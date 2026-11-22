import type { BibEntry } from './bib';
import { CITE_KEY_PATTERN, findCitations } from './wikilinks';

/**
 * How a citation reads once its entry is known.
 *
 * - LaTeX `\cite`: the numbers the last build assigned (IEEEtran style), else
 *   author–year (`citeLabel`).
 * - Pandoc / Quarto `[@key]`: as citeproc prints it with the project's CSL
 *   style and language — `(Chen, 2015)` in APA, `(Chen 2015)` in Chicago
 *   author-date (Quarto's default), `(Hormby และคณะ, 2010)` with `lang: th`.
 *   Only author–date styles are drawn; a numeric style's numbers depend on the
 *   whole book, so those citations show their keys.
 *
 * Finding the citations in text is wikilinks.ts (`findCitations`).
 */

// ── LaTeX: numbers from the last build ──────────────────────────────────────

/**
 * Numeric citations as IEEEtran with the `cite` package prints them: sorted,
 * runs of three or more compressed to a range — `[1], [3]–[5]`.
 */
export function formatCiteNumbers(numbers: string[]): string {
	const nums = numbers.map((s) => Number(s));
	if (nums.some((x) => !Number.isFinite(x))) return numbers.map((s) => `[${s}]`).join(', ');
	const sorted = [...new Set(nums)].sort((a, b) => a - b);
	const parts: string[] = [];
	for (let i = 0; i < sorted.length; ) {
		let j = i;
		while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
		if (j - i >= 2) parts.push(`[${sorted[i]}]–[${sorted[j]}]`);
		else for (let k = i; k <= j; k++) parts.push(`[${sorted[k]}]`);
		i = j + 1;
	}
	return parts.join(', ');
}

/**
 * The text a `\cite{keys}` is drawn as: numbers when the last build assigned
 * them, otherwise author–year from the bibliography, otherwise the keys.
 */
export function citeLabel(keys: string[], cites: Record<string, string>, bib: Record<string, BibEntry>, textual = false): string {
	if (keys.length && keys.every((k) => cites[k] && /^\d+$/.test(cites[k]))) {
		const nums = formatCiteNumbers(keys.map((k) => cites[k]));
		if (textual) {
			const who = keys.map((k) => bib[k]?.authorShort).filter(Boolean);
			if (who.length === keys.length) return `${who.join(', ')} ${nums}`;
		}
		return nums;
	}
	const parts = keys.map((k) => {
		const e = bib[k];
		if (!e || !(e.authorShort || e.year)) return k;
		return textual ? `${e.authorShort} (${e.year})` : `${e.authorShort}${e.authorShort && e.year ? ', ' : ''}${e.year}`;
	});
	return textual ? parts.join('; ') : `[${parts.join('; ')}]`;
}

// ── Pandoc / Quarto: citeproc's author–date ─────────────────────────────────
//
// The rules below were read off Pandoc's citeproc (Quarto 1.8, pandoc 3.8) with
// apa.csl and the default Chicago author-date style, in English and Thai; the
// cases are pinned in citations.citeproc.test.ts.

/** `apa` puts a comma before the year; `chicago` (author-date, Quarto's default) does not. */
export type CiteStyle = 'apa' | 'chicago' | 'numeric';

/** The words and locator labels citeproc takes from the CSL locale. */
export interface CiteTerms {
	and: string;
	etAl: string;
	noDate: string;
	/** The page label APA prints before one page, and before a range. */
	page: string;
	pages: string;
	/** A written page label the locale recognises (`p. 33`); anything else is text. */
	pageLabel: RegExp;
	/** A written chapter label the locale recognises (`chap. 2`), if any. */
	chapterLabel: RegExp | null;
	/** A label the locale recognises but citeproc prints as written (Thai `หน้า 4`). */
	asWritten: RegExp | null;
	/** A comma after a quoted title goes inside the quotes (“Title,”), as in American English. */
	commaInQuotes: boolean;
}

const TERMS: Record<string, CiteTerms> = {
	en: {
		and: 'and',
		etAl: 'et al.',
		noDate: 'n.d.',
		page: 'p.',
		pages: 'pp.',
		pageLabel: /^(?:pp?\.|pages?\b)\s*/i,
		chapterLabel: /^(?:chap\.|chapter\b)\s*/i,
		asWritten: null,
		commaInQuotes: true,
	},
	// As Quarto prints a `lang: th` book: "(Hormby และคณะ, 2010)", "(ACCA, ม.ป.ป.)",
	// "(Chen, 2015, น. 33)". The Thai locale does not read "p." as a label.
	th: {
		and: 'และ',
		etAl: 'และคณะ',
		noDate: 'ม.ป.ป.',
		page: 'น.',
		pages: 'น.',
		pageLabel: /^น\.\s*/,
		chapterLabel: null,
		asWritten: /^หน้า(?=[\s\d])/,
		commaInQuotes: false,
	},
};

/** The locale terms for a `lang:` value (`th`, `th-TH`, `en-US`); English when unknown. */
export function citeTerms(lang: string | undefined): CiteTerms {
	return TERMS[(lang ?? '').toLowerCase().split(/[-_]/)[0]] ?? TERMS.en;
}

/**
 * The style a `csl:` file name points to. Quarto's default (no `csl:`) is
 * Chicago author-date. An unknown author–date style is drawn as APA.
 */
export function citeStyleOf(csl: string | undefined): CiteStyle {
	if (!csl) return 'chicago';
	const name = csl.toLowerCase().replace(/^.*[/\\]/, '');
	if (/\bapa\b|^apa/.test(name)) return 'apa';
	if (/chicago/.test(name)) return 'chicago';
	if (/ieee|vancouver|nature|numeric|\bama\b|^ama|acm|nlm|lancet|bmj|science|springer-basic-brackets|elsevier-with-titles/.test(name)) return 'numeric';
	return 'apa';
}

/** Entry types citeproc cites by a quoted title when there is no author: parts of a larger work. */
const QUOTED_TITLE = /^(?:article|inproceedings|conference|incollection|inbook)$/;

/** Who a citation names: the authors, or the title when there are none. */
function authorPart(e: BibEntry, style: CiteStyle, terms: CiteTerms): { text: string; quoted: boolean } {
	const f = e.families;
	if (!f.length) {
		if (!e.title) return { text: e.key, quoted: false };
		return QUOTED_TITLE.test(e.type) ? { text: `“${e.title}”`, quoted: true } : { text: e.title, quoted: false };
	}
	if (e.others || f.length >= 3) return { text: `${f[0]} ${terms.etAl}`, quoted: false };
	if (f.length === 1) return { text: f[0], quoted: false };
	// APA joins two authors with "&", in the text as well as in parentheses.
	return { text: style === 'apa' ? `${f[0]} & ${f[1]}` : `${f[0]} ${terms.and} ${f[1]}`, quoted: false };
}

/**
 * "Chen, 2015" in APA, "Chen 2015" in Chicago — but "Org, n.d." there too.
 * In English the comma after a quoted title goes inside it: “Title,” 2016.
 */
function authorYear(e: BibEntry, style: CiteStyle, terms: CiteTerms): string {
	const who = authorPart(e, style, terms);
	if (style !== 'apa') return e.year ? `${who.text} ${e.year}` : `${who.text}, ${terms.noDate}`;
	const year = e.year || terms.noDate;
	return who.quoted && terms.commaInQuotes ? `${who.text.slice(0, -1)},” ${year}` : `${who.text}, ${year}`;
}

/** Pandoc's smart typography puts a non-breaking space after these abbreviations in written text. */
const ABBREVIATION = /\b(p|pp|ch|chap|sec|vol)\. (?=\S)/g;
const smart = (text: string) => text.replace(ABBREVIATION, '$1. ');

const LOCATOR_NUMBER = /^((?:\d+|[ivxlcdm]+)(?:\s*[-–—]+\s*(?:\d+|[ivxlcdm]+))?)(?![\p{L}\p{N}])/iu;

/**
 * What follows the key, as citeproc prints it. A locator — written after a
 * comma, or starting with a label the locale knows — is redrawn: a page reads
 * `p. 33` / `pp. 33–35` in APA and `33` in Chicago, a chapter `Chapter 2` in
 * APA. Other text is kept, after a comma if it had one, else after a space.
 * `bracketed`: the `[33]` of an in-text `@key [33]`, read like text after a comma.
 */
function locatorText(raw: string, style: CiteStyle, terms: CiteTerms, bracketed = false): string {
	let text = raw.trim();
	if (!text) return '';
	const comma = bracketed || text.startsWith(',');
	if (text.startsWith(',')) text = text.slice(1).trim();
	if (terms.asWritten?.test(text)) return `, ${smart(text)}`;
	const page = terms.pageLabel.exec(text);
	const chapter = page ? null : (terms.chapterLabel?.exec(text) ?? null);
	const after = text.slice((page ?? chapter)?.[0].length ?? 0);
	const number = page || chapter || comma ? LOCATOR_NUMBER.exec(after) : null;
	if (!number) return `${comma ? ', ' : ' '}${smart(text)}`;
	const value = number[1].replace(/\s*[-–—]+\s*/, '–');
	const rest = smart(after.slice(number[0].length));
	if (chapter) return `, ${style === 'apa' ? 'Chapter' : 'chap.'} ${value}${rest}`;
	if (style !== 'apa') return `, ${value}${rest}`;
	return `, ${value.includes('–') ? terms.pages : terms.page} ${value}${rest}`;
}

/** One item of a citation group: `see @key, p. 33` or `-@key`. */
export interface CiteItem {
	key: string;
	prefix: string;
	/** What follows the key, as written: `, p. 33`, `p. 33`, `หน้า 4`. */
	suffix: string;
	suppressAuthor: boolean;
}

const ITEM = new RegExp(String.raw`^([\s\S]*?)(?:^|(?<=\s))(-?)@(${CITE_KEY_PATTERN})([\s\S]*)$`);

/**
 * The items of a citation group's inside (`see @a, p. 3; @b`), split on `;`.
 * Null when a part has no key: then the brackets are not one citation.
 */
export function parseCiteGroup(inner: string): CiteItem[] | null {
	const items: CiteItem[] = [];
	for (const part of inner.split(';')) {
		const m = ITEM.exec(part.trim());
		if (!m) return null;
		items.push({ prefix: m[1].trim(), suppressAuthor: m[2] === '-', key: m[3], suffix: m[4].trim() });
	}
	return items.length ? items : null;
}

/** A piece of a drawn citation; `key` marks the text that stands for an entry. */
export interface CitePart {
	text: string;
	key?: string;
	/** The key is not in the bibliography: citeproc prints `key?`. */
	missing?: boolean;
}

export interface CiteFormat {
	style: CiteStyle;
	terms: CiteTerms;
	bib: Record<string, BibEntry>;
}

/**
 * A bracketed citation group as citeproc prints it: `(Chen, 2015; Wei et al.,
 * 2022, p. 3)`. APA orders the works by author, then year; Chicago keeps the
 * writer's order. Works by the same author run together: `(Smith, 2019, 2020)`.
 * Not done: the `a`/`b` that tell apart two works by one author in one year.
 */
export function formatCiteGroup(items: CiteItem[], { style, terms, bib }: CiteFormat): CitePart[] {
	if (style === 'numeric') {
		const parts: CitePart[] = [{ text: '[' }];
		items.forEach((item, i) => {
			if (i) parts.push({ text: '; ' });
			parts.push({ text: item.key, key: item.key, missing: !bib[item.key] });
		});
		parts.push({ text: ']' });
		return parts;
	}
	const sortKey = (item: CiteItem) => {
		const e = bib[item.key];
		return e ? `${authorPart(e, style, terms).text.toLowerCase()}\u0000${e.year}` : '￿';
	};
	const ordered = style === 'apa' ? [...items].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0)) : items;
	const parts: CitePart[] = [{ text: '(' }];
	let run: string | null = null;
	ordered.forEach((item, i) => {
		const e = bib[item.key];
		const who = e && !item.suppressAuthor ? authorPart(e, style, terms).text : null;
		const sameAuthor = who !== null && who === run && !item.prefix;
		if (i) parts.push({ text: sameAuthor ? ', ' : '; ' });
		if (item.prefix) parts.push({ text: `${smart(item.prefix)} ` });
		if (!e) parts.push({ text: `${item.key}?`, key: item.key, missing: true });
		else parts.push({ text: item.suppressAuthor || sameAuthor ? e.year || terms.noDate : authorYear(e, style, terms), key: item.key });
		const locator = locatorText(item.suffix, style, terms);
		if (locator) parts.push({ text: locator });
		// A locator ends the run: (Smith, 2019, p. 3; Smith, 2020).
		run = locator ? null : who;
	});
	parts.push({ text: ')' });
	return parts;
}

/** An in-text citation, bare `@key`, with the locator of `@key [p. 33]`: `Chen (2015, p. 33)`. */
export function formatNarrative(key: string, { style, terms, bib }: CiteFormat, locator = ''): CitePart[] {
	const e = bib[key];
	if (!e || style === 'numeric') return [{ text: `@${key}`, key, missing: !e }];
	const year = e.year || terms.noDate;
	return [{ text: `${authorPart(e, style, terms).text} (${year}${locator ? locatorText(locator, style, terms, true) : ''})`, key }];
}

/** The plain text of drawn parts, for tests and accessible names. */
export function citeText(parts: CitePart[]): string {
	return parts.map((p) => p.text).join('');
}

/** Quarto's cross-reference prefixes: `@fig-x` is a figure, not a citation. */
const XREF_KEY = /^(?:fig|tbl|sec|eq|lst|thm|lem|cor|prp|cnj|def|exm|exr)-/;

export function isCrossRefKey(key: string): boolean {
	return XREF_KEY.test(key);
}

/** A citation group in a line, parsed: where it is and what it cites. */
export interface CiteGroupMatch {
	from: number;
	to: number;
	items: CiteItem[];
}

/** The citation groups in `text` that cite works (no cross-references among their keys). */
export function findCiteGroups(text: string): CiteGroupMatch[] {
	const out: CiteGroupMatch[] = [];
	let last = -1;
	for (const c of findCitations(text)) {
		if (c.groupFrom === last) continue;
		last = c.groupFrom;
		const items = parseCiteGroup(text.slice(c.groupFrom + 1, c.groupTo - 1));
		if (items && !items.some((i) => isCrossRefKey(i.key))) out.push({ from: c.groupFrom, to: c.groupTo, items });
	}
	return out;
}

const NARRATIVE = new RegExp(String.raw`(?<![\w@.\\/[-])@(${CITE_KEY_PATTERN})`, 'g');

/**
 * In-text citations, bare `@key`, outside citation groups. Only keys the
 * bibliography holds: an unknown `@word` in prose is more often a handle or a
 * decorator than a mistyped key.
 */
/** The `[p. 33]` right after an in-text `@key`: its locator. Not a link, footnote or wikilink. */
const NARRATIVE_LOCATOR = /^ ?\[(?!\^)([^[\]@\n]*)\](?![(\[:])/;

export interface NarrativeCitation {
	from: number;
	/** Past the key, or past its `[locator]`. */
	to: number;
	key: string;
	locator: string;
}

export function findNarrativeCitations(text: string, known: (key: string) => boolean): NarrativeCitation[] {
	if (!text.includes('@')) return [];
	const groups = findCitations(text).map((c) => [c.groupFrom, c.groupTo] as const);
	const out: NarrativeCitation[] = [];
	for (const m of text.matchAll(NARRATIVE)) {
		const from = m.index!;
		if (!known(m[1]) || isCrossRefKey(m[1]) || groups.some(([a, b]) => from > a && from < b)) continue;
		const to = from + m[0].length;
		const locator = NARRATIVE_LOCATOR.exec(text.slice(to));
		out.push({ from, to: to + (locator?.[0].length ?? 0), key: m[1], locator: locator?.[1] ?? '' });
	}
	return out;
}
