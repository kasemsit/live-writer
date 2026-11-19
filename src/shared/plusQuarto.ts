/**
 * Quarto / Pandoc Markdown, the parts a `.qmd` book is written in that
 * CommonMark does not know: attribute blocks `{#id .class key=value}`, fenced
 * divs `::: {.callout-note}` … `:::`, and cross-references `@fig-id`.
 *
 * Pure helpers, shared by the editor (plus/quarto.ts) and the host (the
 * outline, editor/plus/quartoProject.ts). Line numbers here are 0-based
 * indexes into the `lines` array.
 */

import { parse as parseYaml } from 'yaml';
import { citeStyleOf, type CiteStyle } from './plusCitations';

export interface PandocAttrs {
	id: string;
	classes: string[];
	kv: Record<string, string>;
}

/** Parses the inside of an attribute block: `#id .class key=value key="a b"`. `-` is `.unnumbered`. */
export function parseAttrs(inner: string): PandocAttrs {
	const attrs: PandocAttrs = { id: '', classes: [], kv: {} };
	const token = /([#.])([^\s"'=}]+)|([\w-]+)=(?:"([^"]*)"|'([^']*)'|(\S+))|(^|\s)-(?=\s|$)/g;
	for (let m: RegExpExecArray | null; (m = token.exec(inner)); ) {
		if (m[1] === '#') attrs.id = m[2];
		else if (m[1] === '.') attrs.classes.push(m[2]);
		else if (m[3]) attrs.kv[m[3]] = m[4] ?? m[5] ?? m[6] ?? '';
		else attrs.classes.push('unnumbered');
	}
	return attrs;
}

/** Quarto's English defaults for the words the preview draws; a project's `language:` overrides them. */
export const QUARTO_LABELS: Record<string, string> = {
	'crossref-fig-title': 'Figure',
	'callout-note-title': 'Note',
	'callout-tip-title': 'Tip',
	'callout-important-title': 'Important',
	'callout-warning-title': 'Warning',
	'callout-caution-title': 'Caution',
};

/**
 * The labels a `_quarto.yml` sets, e.g. `crossref-fig-title: "รูปที่"`. Read
 * line by line — these are flat scalar keys, wherever they sit in the file.
 */
export function labelsFromQuartoYaml(yaml: string): Record<string, string> {
	const labels: Record<string, string> = {};
	for (const m of yaml.matchAll(/^[ \t]*((?:crossref|callout)-[\w-]+)[ \t]*:[ \t]*(?:"([^"\n]*)"|'([^'\n]*)'|([^#\n]*?))[ \t]*(?:#.*)?$/gm)) {
		const value = m[2] ?? m[3] ?? m[4] ?? '';
		if (m[1] in QUARTO_LABELS && value) labels[m[1]] = value;
	}
	return labels;
}

/** What a `_quarto.yml` or a document's front matter says about citations. */
export interface QuartoSettings {
	/** Bibliography files as written, relative to the file that names them. */
	bibliography: string[];
	csl?: string;
	lang?: string;
}

/** The citation settings in YAML text (`bibliography:` one file or a list, `csl:`, `lang:`). */
export function quartoSettings(yaml: string): QuartoSettings {
	let data: unknown;
	try {
		data = parseYaml(yaml);
	} catch {
		return { bibliography: [] };
	}
	if (!data || typeof data !== 'object' || Array.isArray(data)) return { bibliography: [] };
	const d = data as Record<string, unknown>;
	const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
	const bib = d.bibliography;
	const list = Array.isArray(bib) ? bib : [bib];
	return { bibliography: list.map(text).filter((b): b is string => !!b), csl: text(d.csl), lang: text(d.lang) };
}

/** The YAML between a document's opening `---` and its closing `---` or `...`; null when there is none. */
export function frontMatterOf(text: string): string | null {
	const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
	return m ? m[1] : null;
}

/** What to read for a Quarto document's citations, before any file is opened. */
export interface QuartoCitationPlan {
	/** `.bib` files as written; `base` says which folder they are relative to. */
	files: string[];
	base: 'project' | 'document';
	style: CiteStyle;
	lang: string;
}

/**
 * Where a `.qmd`'s citations come from: its own front matter over the
 * project's `_quarto.yml` (`bibliography:`, `csl:`, `lang:`). Null when it
 * names no `.bib` file. Shared by the host and plus/render.js.
 */
export function quartoCitationPlan(projectYaml: string, documentText: string): QuartoCitationPlan | null {
	const project = quartoSettings(projectYaml);
	const own = quartoSettings(frontMatterOf(documentText) ?? '');
	// Front matter names files beside the document; _quarto.yml, beside itself.
	const [names, base] = own.bibliography.length ? [own.bibliography, 'document' as const] : [project.bibliography, 'project' as const];
	const files = names.filter((n) => /\.bib$/i.test(n));
	if (!files.length) return null;
	return { files, base, style: citeStyleOf(own.csl ?? project.csl), lang: own.lang ?? project.lang ?? 'en' };
}

/** An attribute block ending a line, e.g. after a heading: `{#sec-x}`. Offsets cover the leading space. */
export const TRAILING_ATTRS = /\s*\{([^{}\n]*)\}\s*$/;

/** An attribute block directly after an image: `![a](b){#fig-x width=80%}`. */
export const LEADING_ATTRS = /^\{([^{}\n]*)\}/;

const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})/;
const DIV_OPEN = /^ {0,3}(:{3,})\s*(?:\{([^{}\n]*)\}|([^\s{}:]+))\s*:*\s*$/;
const DIV_CLOSE = /^ {0,3}(:{3,})\s*$/;

/** Indexes of the lines outside fenced code blocks, fence lines excluded. */
function* outsideCode(lines: readonly string[]): Generator<number> {
	let code: string | null = null;
	for (let i = 0; i < lines.length; i++) {
		const fence = CODE_FENCE.exec(lines[i]);
		if (code) {
			if (fence && fence[1][0] === code[0] && fence[1].length >= code.length && lines[i].trim() === fence[1]) code = null;
		} else if (fence) {
			code = fence[1];
		} else {
			yield i;
		}
	}
}

export interface FencedDiv {
	/** Line of the opening fence. */
	open: number;
	/** Line of the closing fence. */
	close: number;
	attrs: PandocAttrs;
}

/**
 * Fenced divs in document order (outer before inner). A closing fence closes
 * the innermost open div; a div never closed is not a div, so a fence being
 * typed does not swallow the rest of the document. Fences inside code blocks
 * are code.
 */
export function findFencedDivs(lines: readonly string[]): FencedDiv[] {
	const found: FencedDiv[] = [];
	const stack: { open: number; attrs: PandocAttrs }[] = [];
	for (const i of outsideCode(lines)) {
		const line = lines[i];
		const open = DIV_OPEN.exec(line);
		if (open) {
			stack.push({ open: i, attrs: open[2] !== undefined ? parseAttrs(open[2]) : { id: '', classes: [open[3]], kv: {} } });
			continue;
		}
		if (DIV_CLOSE.test(line) && stack.length) {
			const div = stack.pop()!;
			found.push({ open: div.open, close: i, attrs: div.attrs });
		}
	}
	return found.sort((a, b) => a.open - b.open);
}

/** `note` for a div with class `callout-note`, else null. */
export function calloutType(attrs: PandocAttrs): string | null {
	for (const c of attrs.classes) if (c.startsWith('callout-')) return c.slice('callout-'.length);
	return null;
}

const ATX = /^ {0,3}#{1,6}(?:\s|$)/;

/**
 * The line holding a callout's title heading: Quarto takes the title from a
 * heading that is the callout's first block. Null when the title comes from
 * `title="…"` or there is none.
 */
export function calloutTitleLine(lines: readonly string[], div: FencedDiv): number | null {
	if (div.attrs.kv.title !== undefined) return null;
	for (let i = div.open + 1; i < div.close; i++) {
		if (!lines[i].trim()) continue;
		return ATX.test(lines[i]) ? i : null;
	}
	return null;
}

/** Lines (0-based) of every callout's title heading: titles, not sections of the document. */
export function calloutTitleLines(lines: readonly string[]): Set<number> {
	const out = new Set<number>();
	for (const div of findFencedDivs(lines)) {
		if (!calloutType(div.attrs)) continue;
		const title = calloutTitleLine(lines, div);
		if (title !== null) out.add(title);
	}
	return out;
}

/**
 * The outline of a Quarto document: callout titles are not sections, and a
 * heading's `{#sec-id}` is not part of its name. Lines are 1-based, as in
 * `extractHeadings`.
 */
export function quartoOutline<T extends { line: number; text: string }>(headings: T[], text: string): T[] {
	if (!text.includes(':::') && !text.includes('{')) return headings;
	const titles = calloutTitleLines(text.split(/\r\n|\r|\n/));
	return headings.filter((h) => !titles.has(h.line - 1)).map((h) => ({ ...h, text: h.text.replace(TRAILING_ATTRS, '') }));
}

/**
 * Cross-references in a line: `@fig-x`, `@tbl-x`, `@sec-x`, `@eq-x`. Not part of
 * an e-mail address or a word; `[@fig-x]` is left to the citation group.
 */
export const XREF = /(?<![\w@.[;-])@((?:fig|tbl|sec|eq)-[\w-]*\w)/g;

/** A line that is one image and its attribute block, nothing else. */
const IMAGE_LINE = /^!\[((?:[^\]\\]|\\.)*)\]\([^()\s]+(?:\s+"[^"]*")?\)\{([^{}\n]*)\}\s*$/;

/** What may stand right before a paragraph without joining it: a blank line, a heading, a fence. */
function opensBlock(line: string | undefined): boolean {
	return line === undefined || !line.trim() || ATX.test(line) || DIV_OPEN.test(line) || DIV_CLOSE.test(line) || CODE_FENCE.test(line);
}

/** What may stand right after a paragraph without joining it. Pandoc needs a blank line before a heading. */
function closesBlock(line: string | undefined): boolean {
	return line === undefined || !line.trim() || DIV_OPEN.test(line) || DIV_CLOSE.test(line);
}

export interface FigureInfo {
	/** 1-based, counted per file, as Quarto numbers a book chapter's figures. */
	number: number;
	line: number;
	caption: string;
}

export interface CrossRefs {
	figures: Map<string, FigureInfo>;
	/**
	 * `fig-` ids on an image that shares its paragraph with the line above or
	 * below (`with`): Quarto does not make it a figure, so it gets no number and
	 * `@fig-…` to it is unresolved.
	 */
	joined: Map<string, { line: number; with: number }>;
	/** `sec-` ids → the heading's line and text. */
	sections: Map<string, { line: number; text: string }>;
}

/** The figures and sections that `@fig-…` / `@sec-…` can point to. */
export function scanCrossRefs(lines: readonly string[]): CrossRefs {
	const refs: CrossRefs = { figures: new Map(), joined: new Map(), sections: new Map() };
	for (const i of outsideCode(lines)) {
		const line = lines[i];
		const image = IMAGE_LINE.exec(line);
		if (image) {
			const { id } = parseAttrs(image[2]);
			if (!id.startsWith('fig-')) continue;
			const prev = i > 0 ? lines[i - 1] : undefined;
			const next = i + 1 < lines.length ? lines[i + 1] : undefined;
			if (!opensBlock(prev)) refs.joined.set(id, { line: i, with: i - 1 });
			else if (!closesBlock(next)) refs.joined.set(id, { line: i, with: i + 1 });
			else refs.figures.set(id, { number: refs.figures.size + 1, line: i, caption: image[1] });
			continue;
		}
		if (ATX.test(line)) {
			const attrs = TRAILING_ATTRS.exec(line);
			if (!attrs) continue;
			const { id } = parseAttrs(attrs[1]);
			if (id) refs.sections.set(id, { line: i, text: line.slice(0, attrs.index).replace(/^ {0,3}#{1,6}\s*/, '').replace(/\s+#+\s*$/, '') });
		}
	}
	return refs;
}

/**
 * Headings Pandoc does not read as headings: an ATX line straight after a line
 * of paragraph text, with no blank line between (Pandoc's `blank_before_header`).
 * Quarto prints such a line as `## …` inside the paragraph above it.
 */
export function joinedHeadingLines(lines: readonly string[]): Set<number> {
	const out = new Set<number>();
	for (const i of outsideCode(lines)) {
		if (i > 0 && ATX.test(lines[i]) && !opensBlock(lines[i - 1]) && isParagraphText(lines[i - 1])) out.add(i);
	}
	return out;
}

/** A line that continues a paragraph: not a list item, quote, table row or `$$`. */
function isParagraphText(line: string): boolean {
	return !/^\s*(?:[-*+]\s|\d+[.)]\s|>|\||\$\$)/.test(line);
}
