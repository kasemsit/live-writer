import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import { Prec, StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { blockRevealChanged, isBlockRevealed, setBlockRevealed } from '../cmUtils';
import { createRenderModeButton, withCodeModeButton } from '../codeModeButton';
import { wrapBlockWidget } from '../blockWidgetWrap';
import { renderMarkdownBlocks } from './linkPreview';
import { findFencedDivs, type FencedDiv } from '../../shared/quarto';

/**
 * Quarto's `::: {.columns}` with `::: {.column width="40%"}` inside, drawn
 * side by side. Editor lines can only run top to bottom, so the whole block is
 * one rendered widget, like a table or a diagram: its `</>` button shows the
 * source, and the button over the source renders it again (see
 * `isBlockRevealed` in cmUtils.ts). The caret alone never switches it.
 *
 * Inside a column the Markdown goes through the link preview's block renderer
 * (lists, paragraphs, images, math, tables, code); the fences of divs nested
 * in a column (`.incremental`, `.card` …) are left out, their text kept.
 */

interface ColumnsBlock {
	/** 0-based lines of the outer fences. */
	open: number;
	close: number;
	columns: { width: string | null; text: string }[];
}

const isColumns = (d: FencedDiv) => d.attrs.classes.includes('columns');
const isColumn = (d: FencedDiv) => d.attrs.classes.includes('column');

/** Quarto attribute blocks the column renderer would print as text: `![](a.svg){.diagram}`, `[text]{.fragment}`. */
function withoutAttrs(text: string): string {
	return text.replace(/(!\[[^\]]*\]\([^()\n]*\))\{[^{}\n]*\}/g, '$1').replace(/(?<!!)\[([^\]\n]*)\]\{[^{}\n]*\}/g, '$1');
}

export function findColumnsBlocks(lines: readonly string[]): ColumnsBlock[] {
	const divs = findFencedDivs(lines);
	const blocks: ColumnsBlock[] = [];
	for (const outer of divs.filter(isColumns)) {
		// A columns div inside another one is drawn by the outer one.
		if (blocks.some((b) => b.open < outer.open && outer.close < b.close)) continue;
		const inside = divs.filter((d) => d.open > outer.open && d.close < outer.close);
		const columns = inside.filter((d) => isColumn(d) && !inside.some((p) => isColumn(p) && p.open < d.open && d.close < p.close));
		if (!columns.length) continue;
		blocks.push({
			open: outer.open,
			close: outer.close,
			columns: columns.map((col) => {
				const fences = new Set<number>();
				for (const d of inside) if (d.open > col.open && d.close < col.close) fences.add(d.open).add(d.close);
				const text = [];
				for (let n = col.open + 1; n < col.close; n++) if (!fences.has(n)) text.push(lines[n]);
				return { width: col.attrs.kv.width ?? null, text: withoutAttrs(text.join('\n')) };
			}),
		});
	}
	return blocks;
}

class ColumnsWidget extends WidgetType {
	private readonly signature: string;
	constructor(
		readonly block: ColumnsBlock,
		readonly from: number,
	) {
		super();
		this.signature = JSON.stringify(block.columns);
	}
	eq(other: ColumnsWidget): boolean {
		return other.signature === this.signature && other.from === this.from;
	}
	toDOM(view: EditorView): HTMLElement {
		const row = document.createElement('div');
		row.className = 'mlp-qcols';
		for (const column of this.block.columns) {
			const col = row.appendChild(document.createElement('div'));
			col.className = 'mlp-qcol';
			col.style.flex = column.width ? `0 1 ${column.width}` : '1 1 0';
			renderMarkdownBlocks(col, column.text);
			// An image is zero-height until it loads: measure again when it has.
			for (const img of Array.from(col.querySelectorAll('img'))) img.addEventListener('load', () => view.requestMeasure(), { once: true });
		}
		return wrapBlockWidget(
			withCodeModeButton(view, row, {
				anchor: row,
				caretPos: () => this.from,
				onReveal: () => setBlockRevealed(this.from, true),
			}),
		);
	}
	get estimatedHeight(): number {
		return Math.max(...this.block.columns.map((c) => c.text.split('\n').length)) * 24;
	}
	ignoreEvent(): boolean {
		return true;
	}
}

const blocksField = StateField.define<ColumnsBlock[]>({
	create: (state) => findColumnsBlocks(state.doc.toJSON()),
	update: (value, tr) => (tr.docChanged ? findColumnsBlocks(tr.state.doc.toJSON()) : value),
});

function build(state: EditorState): DecorationSet {
	const { doc } = state;
	const out: Range<Decoration>[] = [];
	for (const block of state.field(blocksField)) {
		const from = doc.line(block.open + 1).from;
		if (isBlockRevealed(from)) continue;
		out.push(Decoration.replace({ widget: new ColumnsWidget(block, from), block: true }).range(from, doc.line(block.close + 1).to));
	}
	return Decoration.set(out, true);
}

// Highest precedence: the widget covers lines that other features decorate
// (lists, headings, the divs' own fences), and a lower-precedence block
// replacement would be cut by those decorations and dropped.
const widgetField = Prec.highest(
	StateField.define<DecorationSet>({
		create: build,
		update: (value, tr) =>
			tr.docChanged || tr.effects.some((e) => e.is(blockRevealChanged)) || tr.state.field(blocksField) !== tr.startState.field(blocksField)
				? build(tr.state)
				: value,
		provide: (f) => EditorView.decorations.from(f),
	}),
);

/** Over a revealed block's opening fence: the way back to the rendered columns. */
class ColumnsRenderButtonWidget extends WidgetType {
	constructor(private readonly from: number) {
		super();
	}
	eq(other: ColumnsRenderButtonWidget): boolean {
		return other.from === this.from;
	}
	toDOM(view: EditorView): HTMLElement {
		const host = document.createElement('span');
		host.className = 'mlp-render-mode-host';
		host.appendChild(
			createRenderModeButton(() => {
				setBlockRevealed(this.from, false);
				const { doc } = view.state;
				// Found again now: the source may have gained or lost lines since this button was drawn.
				const block = view.state.field(blocksField).find((b) => doc.line(b.open + 1).from === this.from);
				const last = block ? block.close + 1 : doc.lineAt(this.from).number;
				if (last < doc.lines) {
					view.dispatch({ selection: { anchor: doc.line(last + 1).from }, effects: blockRevealChanged.of(null), scrollIntoView: true });
					return;
				}
				view.dispatch({
					changes: { from: doc.length, insert: '\n' },
					selection: { anchor: doc.length + 1 },
					effects: blockRevealChanged.of(null),
					scrollIntoView: true,
				});
			}),
		);
		return host;
	}
	get estimatedHeight(): number {
		return 0;
	}
	ignoreEvent(): boolean {
		return true;
	}
}

const renderButtons = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = this.build(view.state);
		}
		update(update: ViewUpdate) {
			if (update.docChanged || update.transactions.some((tr) => tr.effects.some((e) => e.is(blockRevealChanged)))) this.decorations = this.build(update.state);
		}
		build(state: EditorState): DecorationSet {
			const { doc } = state;
			const out: Range<Decoration>[] = [];
			for (const block of state.field(blocksField)) {
				const from = doc.line(block.open + 1).from;
				if (isBlockRevealed(from)) out.push(Decoration.widget({ widget: new ColumnsRenderButtonWidget(from), side: -1 }).range(from));
			}
			return Decoration.set(out, true);
		}
	},
	{ decorations: (v) => v.decorations },
);

export const columnsExtension: Extension = [blocksField, widgetField, renderButtons];
