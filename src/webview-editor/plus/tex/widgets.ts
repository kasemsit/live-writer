import { type EditorView, WidgetType } from '@codemirror/view';
import type { PlusTexContext } from '../../../shared/messages';
import type { TexTable } from '../../../shared/plusTexTable';
import { renderMathInto } from '../math';
import { LINK_CONTEXT } from '../wikilinks';
import { resolveTexAsset } from './context';
import { graphicSize, renderTexInline } from './inline';

/**
 * md-live-preview-plus: the widgets the LaTeX Live Preview draws in place of
 * source. Each one that stands for source puts the caret back into that
 * source when clicked, which is what reveals it for editing.
 */

function placeCaret(view: EditorView, pos: number, event: MouseEvent): void {
	if (event.button !== 0) return;
	event.preventDefault();
	view.dispatch({ selection: { anchor: Math.min(pos, view.state.doc.length) }, scrollIntoView: false });
	view.focus();
}

/** Text printed in place of source: a symbol (`\ldots` → …), a quote, a list marker, an empty collapse. */
export class TexTextWidget extends WidgetType {
	constructor(
		readonly text: string,
		readonly cls = '',
		readonly title = '',
	) {
		super();
	}
	eq(other: TexTextWidget): boolean {
		return other.text === this.text && other.cls === this.cls && other.title === this.title;
	}
	toDOM(): HTMLElement {
		const el = document.createElement('span');
		if (this.cls) el.className = this.cls;
		el.textContent = this.text;
		if (this.title) el.title = this.title;
		return el;
	}
	ignoreEvent(): boolean {
		return false;
	}
}

/**
 * A chip for a citation, a reference, a label or a file: its text, a hover
 * title, and either a link (`href`, followed on click by the link handler)
 * or the source offset a click moves the caret to.
 */
export class TexChipWidget extends WidgetType {
	constructor(
		readonly text: string,
		readonly cls: string,
		readonly title: string,
		readonly at: number,
		readonly href: string | null = null,
	) {
		super();
	}
	eq(other: TexChipWidget): boolean {
		return other.text === this.text && other.cls === this.cls && other.title === this.title && other.at === this.at && other.href === this.href;
	}
	toDOM(view: EditorView): HTMLElement {
		const el = document.createElement('span');
		el.className = `mlp-tex-chip ${this.cls}${this.href ? ' mlp-link' : ''}`;
		el.textContent = this.text;
		if (this.title) el.title = this.title;
		if (this.href) {
			el.dataset.href = this.href;
			// Offers "Open Link to the Side" in the right-click menu.
			el.dataset.vscodeContext = LINK_CONTEXT;
		} else el.addEventListener('mousedown', (event) => placeCaret(view, this.at, event));
		return el;
	}
	/** A link chip's clicks go to the editor's link handler (createLinkClickHandler); others are handled here. */
	ignoreEvent(): boolean {
		return !this.href;
	}
}

/** Inline math, or one-line display math sharing its line with text. */
export class TexMathWidget extends WidgetType {
	constructor(
		readonly tex: string,
		readonly display: boolean,
		readonly at: number,
		readonly macros: Record<string, string>,
	) {
		super();
	}
	eq(other: TexMathWidget): boolean {
		return other.tex === this.tex && other.display === this.display && other.at === this.at && other.macros === this.macros;
	}
	toDOM(view: EditorView): HTMLElement {
		const el = document.createElement('span');
		el.className = this.display ? 'mlp-math mlp-math-display' : 'mlp-math';
		renderMathInto(el, this.tex, this.display, () => view.requestMeasure(), this.macros);
		el.addEventListener('mousedown', (event) => placeCaret(view, this.at, event));
		return el;
	}
	ignoreEvent(): boolean {
		return true;
	}
}

/** Display math on lines of its own (`\[…\]`, `equation`, `align`…), with its number from the last build. */
export class TexDisplayMathWidget extends WidgetType {
	constructor(
		readonly tex: string,
		readonly number: string,
		readonly at: number,
		readonly macros: Record<string, string>,
		readonly inFloat = false,
	) {
		super();
	}
	eq(other: TexDisplayMathWidget): boolean {
		return other.tex === this.tex && other.number === this.number && other.at === this.at && other.macros === this.macros && other.inFloat === this.inFloat;
	}
	toDOM(view: EditorView): HTMLElement {
		const el = document.createElement('div');
		el.className = `mlp-math mlp-math-display mlp-math-block mlp-tex-equation${this.inFloat ? ' mlp-tex-in-float' : ''}`;
		const body = document.createElement('div');
		body.className = 'mlp-tex-equation-body';
		renderMathInto(body, this.tex, true, () => view.requestMeasure(), this.macros);
		el.appendChild(body);
		if (this.number) {
			const no = document.createElement('span');
			no.className = 'mlp-tex-eqno';
			no.textContent = this.number;
			el.appendChild(no);
		}
		el.addEventListener('mousedown', (event) => placeCaret(view, this.at, event));
		return el;
	}
	ignoreEvent(): boolean {
		return true;
	}
}

/** `\includegraphics[options]{path}`: the image, found and loaded through the host. */
export class TexImageWidget extends WidgetType {
	constructor(
		readonly path: string,
		readonly options: string,
		readonly at: number,
	) {
		super();
	}
	eq(other: TexImageWidget): boolean {
		return other.path === this.path && other.options === this.options && other.at === this.at;
	}
	toDOM(view: EditorView): HTMLElement {
		const wrap = document.createElement('span');
		wrap.className = 'mlp-tex-graphic mlp-tex-graphic-loading';
		wrap.title = this.path;
		const size = graphicSize(this.options, Math.max(200, view.contentDOM.clientWidth - 40));
		void resolveTexAsset(this.path).then((asset) => {
			wrap.classList.remove('mlp-tex-graphic-loading');
			if (asset.status !== 'image' || !asset.src) {
				wrap.classList.add('mlp-tex-graphic-missing');
				wrap.textContent = asset.status === 'unsupported' ? `${asset.name} (cannot be shown)` : `${this.path} (not found)`;
				view.requestMeasure();
				return;
			}
			const img = document.createElement('img');
			img.src = asset.src;
			img.alt = this.path;
			if (size.width) img.style.width = `${Math.round(size.width)}px`;
			if (size.height) img.style.height = `${Math.round(size.height)}px`;
			img.addEventListener('load', () => {
				if (size.scale && !size.width && !size.height) img.style.width = `${Math.round(img.naturalWidth * size.scale)}px`;
				view.requestMeasure();
			});
			img.addEventListener('error', () => view.requestMeasure());
			wrap.appendChild(img);
		});
		wrap.addEventListener('mousedown', (event) => placeCaret(view, this.at, event));
		return wrap;
	}
	ignoreEvent(): boolean {
		return true;
	}
}

/** A `tabular`, drawn as a table. A click on a cell puts the caret in that cell's source. */
export class TexTableWidget extends WidgetType {
	constructor(
		readonly source: string,
		readonly table: TexTable,
		readonly at: number,
		readonly ctx: PlusTexContext,
		readonly macros: Record<string, string>,
		/** Each cell's source, row by row (the widget outlives the state it was built from). */
		readonly cellText: string[][],
		readonly inFloat = false,
	) {
		super();
	}
	eq(other: TexTableWidget): boolean {
		return other.source === this.source && other.at === this.at && other.ctx === this.ctx && other.macros === this.macros && other.inFloat === this.inFloat;
	}
	toDOM(view: EditorView): HTMLElement {
		const wrap = document.createElement('div');
		wrap.className = `mlp-tex-table-wrap${this.inFloat ? ' mlp-tex-in-float' : ''}`;
		const table = document.createElement('table');
		table.className = 'mlp-tex-table';
		const { rows, cols, rulesBelow } = this.table;
		const env = { ctx: this.ctx, macros: this.macros };
		rows.forEach((row, r) => {
			const tr = document.createElement('tr');
			let col = 1;
			row.cells.forEach((cell, c) => {
				const td = document.createElement('td');
				if (cell.colspan > 1) td.colSpan = cell.colspan;
				const align = cell.align ?? cols[col - 1] ?? 'l';
				td.className = `mlp-tex-td-${align}`;
				for (const rule of row.rulesAbove) {
					if (rule.kind === 'partial' ? rule.first! <= col + cell.colspan - 1 && rule.last! >= col : true) {
						td.classList.add(rule.kind === 'thick' ? 'mlp-tex-rule-thick' : 'mlp-tex-rule-thin');
					}
				}
				if (r === rows.length - 1) {
					for (const rule of rulesBelow) {
						if (rule.kind === 'partial' ? rule.first! <= col + cell.colspan - 1 && rule.last! >= col : true) {
							td.classList.add(rule.kind === 'thick' ? 'mlp-tex-rule-below-thick' : 'mlp-tex-rule-below-thin');
						}
					}
				}
				td.dataset.mlpFrom = String(cell.from);
				td.dataset.mlpTo = String(cell.to);
				renderTexInline(td, this.cellText[r]?.[c] ?? '', env);
				td.addEventListener('mousedown', (event) => placeCaret(view, cell.from, event));
				tr.appendChild(td);
				col += cell.colspan;
			});
			table.appendChild(tr);
		});
		wrap.appendChild(table);
		wrap.addEventListener('mousedown', (event) => {
			if (!(event.target as HTMLElement).closest('td')) placeCaret(view, this.at, event);
		});
		return wrap;
	}
	ignoreEvent(): boolean {
		return true;
	}
}

/** The folded preamble: one line that opens it when clicked. */
export class TexFoldWidget extends WidgetType {
	constructor(
		readonly label: string,
		readonly at: number,
	) {
		super();
	}
	eq(other: TexFoldWidget): boolean {
		return other.label === this.label && other.at === this.at;
	}
	toDOM(view: EditorView): HTMLElement {
		const el = document.createElement('div');
		el.className = 'mlp-tex-fold';
		el.textContent = this.label;
		el.title = 'Click to show the preamble';
		el.addEventListener('mousedown', (event) => placeCaret(view, this.at, event));
		return el;
	}
	ignoreEvent(): boolean {
		return true;
	}
}
