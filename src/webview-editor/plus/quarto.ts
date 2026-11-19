import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import { StateField, type EditorState, type Extension, type Line, type Range } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import { cursorTouchesRange, inlineCursorTouchesRange } from '../cmUtils';
import { blockReplacedLines, cellInlineHooks } from '../livePreviewPlugin';
import { renderInlineInto } from '../tableCellInline';
import { calloutIcon } from './callouts';
import { quartoLabel as label, watchQuartoProject } from './quartoProject';
import { inSourceContext, jumpTo, revealChanged } from './cm';
import {
	LEADING_ATTRS,
	TRAILING_ATTRS,
	XREF,
	calloutTitleLine,
	calloutType,
	findFencedDivs,
	joinedHeadingLines,
	parseAttrs,
	scanCrossRefs,
	type CrossRefs,
	type FencedDiv,
} from '../../shared/plusQuarto';

/**
 * Quarto `.qmd` documents (Pandoc Markdown), drawn the way the rendered book
 * shows them:
 *
 * - `::: {.callout-note}` … `:::` is a callout box. Its fences hide; the title
 *   is a heading that opens the callout, or `title="…"`, or the type's name.
 *   `icon=false` and `appearance="simple"|"minimal"` are followed. Any other
 *   fenced div just hides its fences (`.text-end` / `.text-center` align).
 * - `![caption](img.png){#fig-id width=80%}` is a figure: sized, captioned and
 *   numbered per file, as Quarto numbers a book chapter's figures. The hook is
 *   `quartoImage`, called from livePreviewPlugin's Image case.
 * - `@fig-id` reads "Figure 2" (`crossref-fig-title` from `_quarto.yml`) and
 *   `@sec-id` the heading's text; a press jumps there. An id with no target
 *   reads `?fig-id`, as Quarto prints it.
 * - `{#sec-id}` after a heading hides.
 * - The words drawn come from the project's `_quarto.yml` (quartoProject.ts).
 * - A heading straight after a line of text, with no blank line between, is
 *   flagged: Pandoc reads it as part of that paragraph, not as a heading.
 *
 * Every source shows again while the caret is on its line.
 */

interface QuartoScan {
	divs: FencedDiv[];
	/** Callout opening line → its title heading's line, or null. */
	titles: Map<number, number | null>;
	refs: CrossRefs;
	joined: Set<number>;
}

function scan(state: EditorState): QuartoScan {
	const lines = state.doc.toJSON();
	const divs = findFencedDivs(lines);
	const titles = new Map<number, number | null>();
	for (const div of divs) if (calloutType(div.attrs)) titles.set(div.open, calloutTitleLine(lines, div));
	return { divs, titles, refs: scanCrossRefs(lines), joined: joinedHeadingLines(lines) };
}

const quartoScan = StateField.define<QuartoScan>({
	create: scan,
	update: (value, tr) => (tr.docChanged ? scan(tr.state) : value),
});

// ── Callouts and other fenced divs ───────────────────────────────────────────

/** Quarto's five callout types → colour (media/plus.css) and icon (callouts.ts). */
const CALLOUTS: Record<string, { colour: string; icon: string }> = {
	note: { colour: 'blue', icon: 'info' },
	tip: { colour: 'green', icon: 'tip' },
	important: { colour: 'red', icon: 'alert' },
	warning: { colour: 'yellow', icon: 'warn' },
	caution: { colour: 'orange', icon: 'danger' },
};

/** The header drawn over a callout's opening fence when no heading gives the title. */
class CalloutHeadWidget extends WidgetType {
	constructor(
		private readonly icon: string | null,
		private readonly title: string,
	) {
		super();
	}
	eq(other: CalloutHeadWidget): boolean {
		return other.icon === this.icon && other.title === this.title;
	}
	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.className = 'mlp-qc-label';
		if (this.icon) span.appendChild(calloutIcon(this.icon));
		const title = document.createElement('span');
		title.className = 'mlp-callout-title';
		renderInlineInto(title, this.title, cellInlineHooks);
		span.appendChild(title);
		return span;
	}
	ignoreEvent(): boolean {
		return false;
	}
}

/** The icon before a callout's title heading. */
class CalloutIconWidget extends WidgetType {
	constructor(private readonly icon: string) {
		super();
	}
	eq(other: CalloutIconWidget): boolean {
		return other.icon === this.icon;
	}
	toDOM(): HTMLElement {
		return calloutIcon(this.icon);
	}
}

const hidden = Decoration.replace({});

function decorateDiv(state: EditorState, div: FencedDiv, titleLine: number | null, replaced: Set<number>, out: Range<Decoration>[]): void {
	const { doc } = state;
	const open = doc.line(div.open + 1);
	const close = doc.line(div.close + 1);
	const openShown = cursorTouchesRange(state, open.from, open.to);
	const closeShown = cursorTouchesRange(state, close.from, close.to);
	if (!closeShown) out.push(hidden.range(close.from, close.to));
	const type = calloutType(div.attrs);

	if (!type) {
		const { classes } = div.attrs;
		const align = classes.includes('text-end') ? 'mlp-qdiv-end' : classes.includes('text-center') ? 'mlp-qdiv-center' : '';
		for (let n = div.open; n <= div.close; n++) {
			if (replaced.has(n + 1)) continue;
			const cls =
				n === div.open ? (openShown ? 'mlp-qdiv-src' : 'mlp-qdiv-fence') : n === div.close ? (closeShown ? 'mlp-qdiv-src' : 'mlp-qdiv-fence') : align;
			if (cls) out.push(Decoration.line({ class: cls }).range(doc.line(n + 1).from));
		}
		if (!openShown) out.push(hidden.range(open.from, open.to));
		return;
	}

	const { kv } = div.attrs;
	const style = CALLOUTS[type] ?? CALLOUTS.note;
	const appearance = kv.appearance ?? 'default';
	const minimal = appearance === 'minimal';
	const icon = kv.icon !== 'false' && !minimal ? style.icon : null;
	const title =
		kv.title ?? (titleLine === null && !minimal ? (label(`callout-${type}-title`) ?? type.charAt(0).toUpperCase() + type.slice(1)) : null);
	const base = `mlp-qc mlp-co-${style.colour}${minimal ? ' mlp-qc-minimal' : appearance === 'simple' ? ' mlp-qc-simple' : ''}`;
	for (let n = div.open; n <= div.close; n++) {
		if (replaced.has(n + 1)) continue;
		let cls = base;
		// A hidden opening fence above a title heading is the header's top edge: `-cap` tints it to match.
		if (n === div.open) {
			cls += ` mlp-qc-first ${openShown ? 'mlp-qc-src' : title !== null ? 'mlp-qc-head' : titleLine !== null ? 'mlp-qc-fence mlp-qc-cap' : 'mlp-qc-fence'}`;
		}
		else if (n === div.close) cls += ` mlp-qc-last ${closeShown ? 'mlp-qc-src' : 'mlp-qc-fence'}`;
		else if (n === titleLine) cls += ' mlp-qc-head mlp-qc-title';
		out.push(Decoration.line({ class: cls }).range(doc.line(n + 1).from));
	}
	if (!openShown) {
		out.push(title !== null ? Decoration.replace({ widget: new CalloutHeadWidget(icon, title) }).range(open.from, open.to) : hidden.range(open.from, open.to));
	}
	if (titleLine !== null && icon) out.push(Decoration.widget({ widget: new CalloutIconWidget(icon), side: -1 }).range(doc.line(titleLine + 1).from));
}

// ── Cross-references ─────────────────────────────────────────────────────────

interface XrefTarget {
	text: string;
	/** 0-based line to jump to, or null when there is nothing to jump to. */
	line: number | null;
	hint: string;
	missing: boolean;
}

function resolveXref(refs: CrossRefs, id: string): XrefTarget {
	const figure = refs.figures.get(id);
	if (figure) return { text: `${label('crossref-fig-title')} ${figure.number}`, line: figure.line, hint: figure.caption, missing: false };
	const section = refs.sections.get(id);
	if (section) return { text: section.text, line: section.line, hint: section.text, missing: false };
	const joined = refs.joined.get(id);
	if (joined) {
		const where = joined.with < joined.line ? 'above' : 'below';
		return { text: `?${id}`, line: joined.line, hint: `Quarto does not number this image: it needs a blank line ${where} it.`, missing: true };
	}
	return { text: `?${id}`, line: null, hint: `No figure or section has the id #${id} in this file.`, missing: true };
}

class XrefWidget extends WidgetType {
	constructor(private readonly target: XrefTarget) {
		super();
	}
	eq(other: XrefWidget): boolean {
		const a = this.target;
		const b = other.target;
		return a.text === b.text && a.line === b.line && a.hint === b.hint && a.missing === b.missing;
	}
	toDOM(view: EditorView): HTMLElement {
		const link = document.createElement('a');
		link.className = this.target.missing ? 'mlp-xref mlp-xref-missing' : 'mlp-xref';
		link.textContent = this.target.text;
		link.title = this.target.hint;
		const { line } = this.target;
		link.addEventListener('mousedown', (event) => {
			if (event.button !== 0 || line === null) return;
			event.preventDefault();
			event.stopPropagation();
			if (line < view.state.doc.lines) jumpTo(view, view.state.doc.line(line + 1).from);
		});
		return link;
	}
}

// ── Figures ──────────────────────────────────────────────────────────────────

/** `width=80%`, `width=300px`, `width="300"` → a CSS width; anything else is ignored. */
function cssWidth(value: string | undefined): string {
	const m = /^(\d+(?:\.\d+)?)(%|px|em|rem|in|cm|mm)?$/.exec(value?.trim() ?? '');
	return m ? m[1] + (m[2] ?? 'px') : '';
}

class FigureWidget extends WidgetType {
	constructor(
		private readonly src: string,
		private readonly caption: string,
		private readonly width: string,
		/** Caption prefix, e.g. "Figure 2", or '' for an unnumbered figure. */
		private readonly number: string,
		/** Drawn as a figure (block, caption below) rather than an inline image. */
		private readonly block: boolean,
		/** Why Quarto does not make this a figure, or ''. */
		private readonly warning: string,
	) {
		super();
	}
	eq(other: FigureWidget): boolean {
		return (
			other.src === this.src &&
			other.caption === this.caption &&
			other.width === this.width &&
			other.number === this.number &&
			other.block === this.block &&
			other.warning === this.warning
		);
	}
	toDOM(view: EditorView): HTMLElement {
		const wrap = document.createElement('span');
		wrap.className = this.block ? 'mlp-qfig' : 'mlp-qfig mlp-qfig-inline';
		const img = document.createElement('img');
		img.className = 'mlp-image';
		img.src = cellInlineHooks.resolveImageSrc(this.src);
		img.alt = this.caption;
		if (this.width) img.style.width = this.width;
		const remeasure = () => view.requestMeasure();
		img.addEventListener('load', remeasure);
		img.addEventListener('error', remeasure);
		wrap.appendChild(img);
		if (this.block && this.caption) {
			const caption = document.createElement('span');
			caption.className = 'mlp-qfig-caption';
			if (this.number) {
				const number = document.createElement('span');
				number.className = 'mlp-qfig-number';
				number.textContent = `${this.number}: `;
				caption.appendChild(number);
			}
			renderInlineInto(caption, this.caption, cellInlineHooks);
			wrap.appendChild(caption);
		}
		if (this.warning) {
			const warning = document.createElement('span');
			warning.className = 'mlp-q-warning';
			warning.textContent = `⚠ ${this.warning}`;
			wrap.appendChild(warning);
		}
		return wrap;
	}
	/** Let clicks through, as ImageWidget does, so a click reveals the source. */
	ignoreEvent(): boolean {
		return false;
	}
}

/**
 * livePreviewPlugin's hook for an image followed by an attribute block,
 * `![caption](src){#fig-id width=80%}`: the widget that draws it and the end
 * of its source (attribute block included). Null for an image with no block,
 * which keeps its ordinary rendering.
 */
export function quartoImage(state: EditorState, image: SyntaxNode, src: string, alt: string): { to: number; widget: WidgetType } | null {
	const line = state.doc.lineAt(image.to);
	const block = LEADING_ATTRS.exec(state.sliceDoc(image.to, line.to));
	if (!block) return null;
	const to = image.to + block[0].length;
	const attrs = parseAttrs(block[1]);
	const refs = state.field(quartoScan, false)?.refs;
	const figure = refs?.figures.get(attrs.id);
	const joined = refs?.joined.get(attrs.id);
	const alone = !state.sliceDoc(line.from, image.from).trim() && !state.sliceDoc(to, line.to).trim();
	const number = figure ? `${label('crossref-fig-title')} ${figure.number}` : '';
	const warning = joined
		? `Quarto does not make this a figure: leave a blank line ${joined.with < joined.line ? 'above' : 'below'} the image.`
		: '';
	return { to, widget: new FigureWidget(src, alt, cssWidth(attrs.kv.width), number, alone && !joined, warning) };
}

// ── The per-line pass: heading attributes, joined headings, cross-references ─

/** Source that the rendered view hides: an attribute block, or a reference under the caret. */
const attrMark = Decoration.mark({ class: 'mlp-qattr' });

class JoinedHeadingWidget extends WidgetType {
	eq(): boolean {
		return true;
	}
	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.className = 'mlp-q-warning';
		span.textContent = '⚠ Not a heading in Quarto: leave a blank line above it.';
		return span;
	}
}

const ATX_LINE = /^ {0,3}#{1,6}(?:\s|$)/;
const IMAGE_ATTRS = /!\[(?:[^\]\\]|\\.)*\]\([^()\n]*\)(\{[^{}\n]*\})/g;

function decorateLine(state: EditorState, line: Line, scan: QuartoScan, out: Range<Decoration>[]): void {
	const { text } = line;
	const touched = cursorTouchesRange(state, line.from, line.to);
	if (ATX_LINE.test(text) && !inSourceContext(state, line.from)) {
		const attrs = TRAILING_ATTRS.exec(text);
		if (attrs) out.push((touched ? attrMark : hidden).range(line.from + attrs.index, line.to));
		if (scan.joined.has(line.number - 1)) {
			out.push(Decoration.line({ class: 'mlp-q-joined' }).range(line.from));
			out.push(Decoration.widget({ widget: new JoinedHeadingWidget(), side: 2 }).range(line.to));
		}
	}
	// With the caret on the line the image shows as source; dim its attribute block.
	if (touched && text.includes('](')) {
		for (const m of text.matchAll(IMAGE_ATTRS)) {
			const from = line.from + m.index + m[0].length - m[1].length;
			if (!inSourceContext(state, from)) out.push(attrMark.range(from, from + m[1].length));
		}
	}
	if (!text.includes('@')) return;
	for (const m of text.matchAll(XREF)) {
		const from = line.from + m.index;
		const to = from + m[0].length;
		if (inSourceContext(state, from)) continue;
		if (inlineCursorTouchesRange(state, from, to)) out.push(attrMark.range(from, to));
		else out.push(Decoration.replace({ widget: new XrefWidget(resolveXref(scan.refs, m[1])) }).range(from, to));
	}
}

function build(view: EditorView): DecorationSet {
	const { state } = view;
	const { doc } = state;
	const value = state.field(quartoScan);
	const out: Range<Decoration>[] = [];
	const visible = (from: number, to: number) => view.visibleRanges.some((r) => r.from <= to && r.to >= from);
	// Lines a table or $$ block widget replaces must carry no line decoration,
	// or CodeMirror drops the widget (see blockReplacedLines).
	let replaced: Set<number> | null = null;
	for (const div of value.divs) {
		if (!visible(doc.line(div.open + 1).from, doc.line(div.close + 1).to)) continue;
		replaced ??= blockReplacedLines(state, syntaxTree(state).topNode);
		decorateDiv(state, div, value.titles.get(div.open) ?? null, replaced, out);
	}
	for (const { from, to } of view.visibleRanges) {
		for (let pos = from; pos <= to; ) {
			const line = doc.lineAt(pos);
			pos = line.to + 1;
			decorateLine(state, line, value, out);
		}
	}
	return Decoration.set(out, true);
}

const quartoDecorations = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = build(view);
			watchQuartoProject();
		}
		update(update: ViewUpdate) {
			if (
				update.docChanged ||
				update.viewportChanged ||
				update.selectionSet ||
				revealChanged(update)
			) {
				this.decorations = build(update.view);
			}
		}
	},
	{ decorations: (v) => v.decorations },
);

export const quartoExtension: Extension = [quartoScan, quartoDecorations];
