import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view';
import type { EditorState, Range } from '@codemirror/state';
import { cursorTouchesRange, inlineCursorTouchesRange } from '../cmUtils';
import { describeBib } from '../../shared/plusBib';
import { findCiteGroups, findNarrativeCitations, formatCiteGroup, formatNarrative, type CiteFormat, type CitePart } from '../../shared/plusCitations';
import { findCitations } from '../../shared/plusWikilinks';
import { linkClass, noteIndexChanged } from './wikilinks';
import { inSourceContext, revealChanged } from './cm';
import { CITE_CONTEXT, CITE_LINK_CONTEXT } from './zotero';
import { registerInlinePass } from './inlineExtras';
import { citationFormat, onQuartoProject } from './quartoProject';

/**
 * Pandoc citations — `[@key]`, `[@a; @b, p. 3]` — drawn one of two ways:
 *
 * - **In a notes vault** (a `.md`), each key behaves like a wikilink to
 *   `@key.md`, the vault's reference note: a hover shows it, a click opens it,
 *   and a key with no note is drawn faint, so a mistyped key shows up before
 *   the document is built. The source text stays as written; the group gets a
 *   faint chip.
 * - **In a Quarto document with a bibliography** (a `.qmd`), the group reads as
 *   the rendered book prints it — `(Chen, 2015)` — in the project's CSL style
 *   and language, and so does an in-text `@key`; a hover shows the entry, a key
 *   the bibliography lacks reads `key?` in red, and the source shows again while
 *   the caret is on it.
 */

// ── In a notes vault: keys link to `@key` notes ─────────────────────────────

const groupDeco = Decoration.mark({ class: 'mlp-cite-group' });

function keyDeco(key: string): Decoration {
	return Decoration.mark({
		tagName: 'a',
		class: `${linkClass(`@${key}`)} mlp-cite`,
		attributes: { 'data-href': `wiki:@${key}`, title: `@${key}`, 'data-vscode-context': CITE_LINK_CONTEXT, 'data-citekeys': key },
	});
}

function decorateVaultLine(state: EditorState, from: number, text: string, out: Range<Decoration>[]): void {
	const groups = new Set<number>();
	for (const c of findCitations(text)) {
		if (inSourceContext(state, from + c.from)) continue;
		if (!groups.has(c.groupFrom)) {
			groups.add(c.groupFrom);
			out.push(groupDeco.range(from + c.groupFrom, from + c.groupTo));
		}
		out.push(keyDeco(c.key).range(from + c.from, from + c.to));
	}
}

// ── In a Quarto document: as the book prints them ───────────────────────────

/** A drawn citation: its parts, each key hover-described from the bibliography. */
function citeElement(parts: CitePart[], format: CiteFormat, source: string): HTMLElement {
	const span = document.createElement('span');
	span.className = 'mlp-qcite';
	span.dataset.citeSrc = source;
	const titles: string[] = [];
	for (const part of parts) {
		if (!part.key) {
			span.append(part.text);
			continue;
		}
		const key = document.createElement('span');
		key.className = part.missing ? 'mlp-qcite-key mlp-qcite-missing' : 'mlp-qcite-key';
		key.textContent = part.text;
		key.dataset.citekeys = part.key;
		span.append(key);
		titles.push(describeBib(format.bib[part.key], part.key));
	}
	// The card (zotero.ts) shows the entries, with links to the papers in Zotero.
	span.dataset.citekeys = parts.flatMap((p) => (p.key ? [p.key] : [])).join(',');
	span.dataset.citedesc = titles.join('\n');
	span.dataset.vscodeContext = CITE_CONTEXT;
	return span;
}

class CitationWidget extends WidgetType {
	private readonly signature: string;
	constructor(
		private readonly parts: CitePart[],
		private readonly format: CiteFormat,
		private readonly source: string,
	) {
		super();
		this.signature = JSON.stringify([parts, source, parts.map((p) => (p.key ? describeBib(format.bib[p.key], p.key) : ''))]);
	}
	eq(other: CitationWidget): boolean {
		return other.signature === this.signature;
	}
	toDOM(): HTMLElement {
		return citeElement(this.parts, this.format, this.source);
	}
	/** Let clicks through, so a click puts the caret there and shows the source. */
	ignoreEvent(): boolean {
		return false;
	}
}

/** The source of a citation under the caret, dimmed like other revealed Quarto syntax. */
const sourceMark = Decoration.mark({ class: 'mlp-qattr' });

function decorateQuartoLine(state: EditorState, from: number, text: string, format: CiteFormat, out: Range<Decoration>[]): void {
	const draw = (start: number, end: number, parts: CitePart[]) => {
		const a = from + start;
		const b = from + end;
		if (inSourceContext(state, a)) return;
		if (inlineCursorTouchesRange(state, a, b)) out.push(sourceMark.range(a, b));
		else out.push(Decoration.replace({ widget: new CitationWidget(parts, format, text.slice(start, end)) }).range(a, b));
	};
	for (const g of findCiteGroups(text)) draw(g.from, g.to, formatCiteGroup(g.items, format));
	for (const c of findNarrativeCitations(text, (k) => k in format.bib)) draw(c.from, c.to, formatNarrative(c.key, format, c.locator));
}

/** Rewrites the citations in rendered text (table cells, cards) as the book prints them. */
function drawQuartoCitations(root: HTMLElement, format: CiteFormat): void {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		if (n.nodeValue?.includes('@') && !n.parentElement?.closest('code,a,.mlp-qcite')) nodes.push(n as Text);
	}
	for (const node of nodes) {
		const value = node.nodeValue ?? '';
		const found: { from: number; to: number; parts: CitePart[] }[] = [
			...findCiteGroups(value).map((g) => ({ from: g.from, to: g.to, parts: formatCiteGroup(g.items, format) })),
			...findNarrativeCitations(value, (k) => k in format.bib).map((c) => ({ ...c, parts: formatNarrative(c.key, format, c.locator) })),
		].sort((a, b) => a.from - b.from);
		if (!found.length) continue;
		const frag = document.createDocumentFragment();
		let last = 0;
		for (const f of found) {
			frag.append(value.slice(last, f.from), citeElement(f.parts, format, value.slice(f.from, f.to)));
			last = f.to;
		}
		frag.append(value.slice(last));
		node.replaceWith(frag);
	}
}

// Tables are drawn before the project arrives, and a table widget is reused
// while its text is unchanged: redraw the citations already in them.
onQuartoProject((view) => {
	const format = citationFormat();
	if (!format) return;
	for (const table of Array.from(view.dom.querySelectorAll<HTMLElement>('.mlp-table-wrap'))) {
		for (const drawn of Array.from(table.querySelectorAll<HTMLElement>('.mlp-cite-group, .mlp-qcite'))) {
			drawn.replaceWith(drawn.dataset.citeSrc ?? drawn.textContent ?? '');
		}
		table.normalize();
		drawQuartoCitations(table, format);
	}
});

// ── The editor plugin and the inline pass ───────────────────────────────────

function build(view: EditorView): DecorationSet {
	const { state } = view;
	const format = citationFormat();
	const out: Range<Decoration>[] = [];
	for (const { from, to } of view.visibleRanges) {
		for (let pos = from; pos <= to; ) {
			const line = state.doc.lineAt(pos);
			pos = line.to + 1;
			if (!line.text.includes('@')) continue;
			if (format) decorateQuartoLine(state, line.from, line.text, format, out);
			else if (!cursorTouchesRange(state, line.from, line.to)) decorateVaultLine(state, line.from, line.text, out);
		}
	}
	return Decoration.set(out, true);
}

export const citationPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = build(view);
		}
		update(update: ViewUpdate) {
			if (
				update.docChanged ||
				update.viewportChanged ||
				update.selectionSet ||
				revealChanged(update, noteIndexChanged)
			) {
				this.decorations = build(update.view);
			}
		}
	},
	{ decorations: (v) => v.decorations },
);

/** Vault notes: wraps each key of rendered "[@key]" text in a link to its note. */
function linkVaultCitations(root: HTMLElement): void {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const nodes: Text[] = [];
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		if (n.nodeValue?.includes('@') && !n.parentElement?.closest('code,a')) nodes.push(n as Text);
	}
	for (const node of nodes) {
		const value = node.nodeValue ?? '';
		const cites = findCitations(value);
		if (!cites.length) continue;
		const frag = document.createDocumentFragment();
		let last = 0;
		let group: HTMLElement | null = null;
		let groupEnd = -1;
		const append = (piece: Node | string) => (group ?? frag).append(piece);
		for (const c of cites) {
			if (c.groupFrom >= groupEnd) {
				if (group) {
					group.append(value.slice(last, groupEnd));
					last = groupEnd;
					group = null;
				}
				frag.append(value.slice(last, c.groupFrom));
				group = document.createElement('span');
				group.className = 'mlp-cite-group';
				frag.append(group);
				last = c.groupFrom;
				groupEnd = c.groupTo;
			}
			append(value.slice(last, c.from));
			const a = document.createElement('a');
			a.className = `${linkClass(`@${c.key}`)} mlp-cite`;
			a.setAttribute('data-href', `wiki:@${c.key}`);
			a.title = `@${c.key}`;
			a.dataset.vscodeContext = CITE_LINK_CONTEXT;
			a.dataset.citekeys = c.key;
			a.textContent = value.slice(c.from, c.to);
			append(a);
			last = c.to;
		}
		if (group) {
			group.append(value.slice(last, groupEnd));
			last = groupEnd;
		}
		frag.append(value.slice(last));
		node.replaceWith(frag);
	}
}

// Table cells and cards: the inline renderer leaves "[@key]" as text (see the
// Link case in tableCellInline.ts); draw its citations here.
registerInlinePass((text) => {
	if (!text.includes('@')) return { text };
	return {
		text,
		finish(root) {
			const format = citationFormat();
			if (format) drawQuartoCitations(root, format);
			else linkVaultCitations(root);
		},
	};
});
