import type { BibEntry } from './plusBib';
import { CITE_KEY_PATTERN, findCitations } from './plusWikilinks';

/**
 * md-live-preview-plus: how a citation reads once its entry is known.
 *
 * - LaTeX `\cite`: the numbers the last build assigned (IEEEtran style), else
 *   author–year (`citeLabel`).
 * - Pandoc / Quarto `[@key]`: as citeproc prints it with the project's CSL
 *   style and language — `(Chen, 2015)` in APA, `(Chen 2015)` in Chicago
 *   author-date (Quarto's default), `(Hormby และคณะ, 2010)` with `lang: th`.
 *   Only author–date styles are drawn; a numeric style's numbers depend on the
 *   whole book, so those citations show their keys.
 *
 * Finding the citations in text is plusWikilinks.ts (`findCitations`).
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

/** `apa` puts a comma before the year; `chicago` (author-date, Quarto's default) does not. */
export type CiteStyle = 'apa' | 'chicago' | 'numeric';

/** The words citeproc takes from the CSL locale. */
export interface CiteTerms {
	and: string;
	etAl: string;
	noDate: string;
}

const TERMS: Record<string, CiteTerms> = {
	en: { and: 'and', etAl: 'et al.', noDate: 'n.d.' },
	// As Quarto prints a `lang: th` book: "(Hormby และคณะ, 2010)", "(ACCA, ม.ป.ป.)".
	th: { and: 'และ', etAl: 'และคณะ', noDate: 'ม.ป.ป.' },
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

/** The author part of one citation. APA joins two names with "&" inside parentheses. */
function authorPart(e: BibEntry, style: CiteStyle, terms: CiteTerms, narrative: boolean): string {
	const f = e.families;
	if (!f.length) return e.title ? `“${e.title}”` : e.key;
	if (e.others || f.length >= (style === 'apa' ? 3 : 4)) return `${f[0]} ${terms.etAl}`;
	if (f.length === 1) return f[0];
	if (f.length === 2) return style === 'apa' && !narrative ? `${f[0]} & ${f[1]}` : `${f[0]} ${terms.and} ${f[1]}`;
	return `${f[0]}, ${f[1]}, ${terms.and} ${f[2]}`;
}

/** One item of a citation group: `see @key, p. 33` or `-@key`. */
export interface CiteItem {
	key: string;
	prefix: string;
	/** After the key, without its leading comma: `p. 33`. */
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
		items.push({ prefix: m[1].trim(), suppressAuthor: m[2] === '-', key: m[3], suffix: m[4].trim().replace(/^,\s*/, '') });
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

/** A bracketed citation group as citeproc prints it: `(Chen, 2015; Wei et al., 2022, p. 3)`. */
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
	const parts: CitePart[] = [{ text: '(' }];
	items.forEach((item, i) => {
		if (i) parts.push({ text: '; ' });
		if (item.prefix) parts.push({ text: `${item.prefix} ` });
		const e = bib[item.key];
		if (!e) {
			parts.push({ text: `${item.key}?`, key: item.key, missing: true });
		} else {
			const year = e.year || terms.noDate;
			const who = authorPart(e, style, terms, false);
			const text = item.suppressAuthor ? year : style === 'apa' ? `${who}, ${year}` : `${who} ${year}`;
			parts.push({ text, key: item.key });
		}
		if (item.suffix) parts.push({ text: `, ${item.suffix}` });
	});
	parts.push({ text: ')' });
	return parts;
}

/** An in-text citation, bare `@key`: `Chen (2015)`. */
export function formatNarrative(key: string, { style, terms, bib }: CiteFormat): CitePart[] {
	const e = bib[key];
	if (!e || style === 'numeric') return [{ text: `@${key}`, key, missing: !e }];
	return [{ text: `${authorPart(e, style, terms, true)} (${e.year || terms.noDate})`, key }];
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
export function findNarrativeCitations(text: string, known: (key: string) => boolean): { from: number; to: number; key: string }[] {
	if (!text.includes('@')) return [];
	const groups = findCitations(text).map((c) => [c.groupFrom, c.groupTo] as const);
	const out: { from: number; to: number; key: string }[] = [];
	for (const m of text.matchAll(NARRATIVE)) {
		const from = m.index!;
		if (!known(m[1]) || isCrossRefKey(m[1]) || groups.some(([a, b]) => from > a && from < b)) continue;
		out.push({ from, to: from + m[0].length, key: m[1] });
	}
	return out;
}
