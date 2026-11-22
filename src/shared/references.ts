import type { BibEntry } from './bib';
import { texToPlain } from './texScan';

/**
 * A reference list as Quarto's citeproc prints it with APA (apa.csl): what a
 * `::: {#refs}` div holds in the rendered book. Checked against a real book's
 * bibliography page (references.test.ts). Other styles get the same layout.
 */

/** A piece of a reference: plain, italic, or a link. */
export interface RefPart {
	text: string;
	italic?: boolean;
	href?: string;
}

const PART_OF_WHOLE = /^(?:article|inproceedings|conference|incollection|inbook)$/;

/** "Sharon" → "S.", "Jean-Paul" → "J.-P.", "J. R." stays. */
function initials(given: string): string {
	return given
		.split(/\s+/)
		.filter(Boolean)
		.map((w) => w.split('-').map((p) => (p.endsWith('.') && p.length <= 3 ? p : `${p.charAt(0)}.`)).join('-'))
		.join(' ');
}

function authorList(e: BibEntry): string {
	const people = e.names.map((n) => (n.given ? `${n.family}, ${initials(n.given)}` : n.family));
	if (!people.length) return texToPlain(e.fields.organization ?? e.fields.institution ?? '');
	if (e.others) return `${people.join(', ')}, et al.`;
	if (people.length === 1) return people[0];
	return `${people.slice(0, -1).join(', ')}, & ${people[people.length - 1]}`;
}

/**
 * Sentence case as citeproc makes it: words written Like This become like this,
 * except the first word and the first after a colon; words in braces, and
 * words with capitals elsewhere (AI, ORION, iPhone), are kept.
 */
export function sentenceCase(raw: string): string {
	let out = '';
	let first = true;
	let depth = 0;
	let word = '';
	const flush = () => {
		if (!word) return;
		const parts = word.split('-');
		const titled = parts.map((p) => /^[A-Z][a-z’']*$/.test(p));
		let w = parts.map((p, i) => (titled[i] && !(first && i === 0) ? p.toLowerCase() : p)).join('-');
		// The first word, and the first after a colon, begin with a capital: "statsmodels:" → "Statsmodels:".
		if (first) w = w.charAt(0).toUpperCase() + w.slice(1);
		out += w;
		if (/[A-Za-z0-9]/.test(word)) first = false;
		word = '';
	};
	for (const ch of raw) {
		if (ch === '{') {
			flush();
			depth++;
			out += ch;
			if (depth === 1) first = false;
			continue;
		}
		if (ch === '}') {
			depth = Math.max(0, depth - 1);
			out += ch;
			continue;
		}
		if (depth > 0) {
			out += ch;
			continue;
		}
		if (/[\s:?!.,;()[\]"/]/.test(ch)) {
			flush();
			out += ch;
			if (ch === ':' || ch === '?' || ch === '!') first = true;
			continue;
		}
		word += ch;
	}
	flush();
	return smartQuotes(texToPlain(out));
}

/** Pandoc's smart typography: an apostrophe inside a word is ’. */
const smartQuotes = (s: string) => s.replace(/(\w)'(\w)/g, '$1’$2');

/** "14" → "14th ed."; words stay as written ("Revised"). */
function edition(value: string): string {
	const n = /^(\d+)(?:st|nd|rd|th)?$/.exec(value.trim());
	if (!n) return value.trim();
	const k = Number(n[1]);
	const suffix = k % 100 >= 11 && k % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][k % 10] ?? 'th';
	return `${k}${suffix} ed.`;
}

const end = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);

/** One entry of the reference list. */
export function formatReference(e: BibEntry): RefPart[] {
	const f = e.fields;
	const parts: RefPart[] = [];
	const who = authorList(e);
	const title = sentenceCase(e.rawTitle);
	if (who) parts.push({ text: `${end(who)} ` });
	parts.push({ text: `(${e.year || 'n.d.'}). ` });
	if (!who && title) parts.unshift({ text: `${end(title)} `, italic: !PART_OF_WHOLE.test(e.type) });
	else if (title) {
		if (PART_OF_WHOLE.test(e.type)) parts.push({ text: `${end(title)} ` });
		else {
			parts.push({ text: title, italic: true });
			if (f.edition) parts.push({ text: ` (${edition(f.edition)})` });
			parts.push({ text: '. ' });
		}
	}
	const container = f.journal ?? f.journaltitle ?? f.booktitle;
	if (container && PART_OF_WHOLE.test(e.type)) {
		parts.push({ text: container, italic: true });
		if (f.volume) parts.push({ text: ', ' }, { text: f.volume, italic: true });
		if (f.number) parts.push({ text: `(${f.number})` });
		if (f.pages) parts.push({ text: `, ${f.pages.replace(/\s*-{1,2}\s*/, '–')}` });
		parts.push({ text: '. ' });
	} else {
		const by = f.publisher ?? f.howpublished ?? f.school ?? f.institution ?? (who ? '' : f.organization);
		if (by) parts.push({ text: `${end(smartQuotes(by))} ` });
	}
	const link = f.doi ? `https://doi.org/${f.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')}` : f.url;
	if (link) parts.push(...(e.year || f.doi ? [] : [{ text: 'Retrieved ' }]), { text: link, href: link });
	const last = parts[parts.length - 1];
	if (!link && last) last.text = last.text.trimEnd();
	return parts;
}

/** The plain text of a reference, for tests. */
export function referenceText(parts: RefPart[]): string {
	return parts.map((p) => p.text).join('').trim();
}

/** Keys in the order the list prints them: by first author (or title), then year. */
export function sortReferences(keys: string[], bib: Record<string, BibEntry>): string[] {
	const sortKey = (k: string) => {
		const e = bib[k];
		if (!e) return k.toLowerCase();
		return `${(authorList(e) || sentenceCase(e.rawTitle)).toLowerCase()}\u0000${e.year}`;
	};
	// Ordered as a reader expects, not by code point: "Géron" before "Google".
	const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
	return [...new Set(keys)].filter((k) => bib[k]).sort((a, b) => collator.compare(sortKey(a), sortKey(b)));
}
