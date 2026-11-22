import { texToPlain } from './texScan';

/**
 * md-live-preview-plus: BibTeX files, read into the entries citations are drawn
 * from — by the LaTeX Live Preview (`\cite`) and by Quarto documents (`[@key]`).
 * How a citation then reads is plusCitations.ts.
 */

/**
 * The text of a `{…}` group starting at `open`, and where it ends; null when
 * unbalanced. Unlike plusTexScanner's matchBrace, `%` is text: `.bib` and `.aux`
 * files have no comments inside values, and URLs carry `%20`.
 */
export function braceGroup(text: string, open: number): { body: string; end: number } | null {
	if (text[open] !== '{') return null;
	let depth = 0;
	for (let i = open; i < text.length; i++) {
		const ch = text[i];
		if (ch === '\\') {
			i++;
			continue;
		}
		if (ch === '{') depth++;
		else if (ch === '}' && --depth === 0) return { body: text.slice(open + 1, i), end: i + 1 };
	}
	return null;
}

export interface BibEntry {
	key: string;
	type: string;
	/** "Smith", "Smith and Jones", "Smith et al." — the English author–year LaTeX shows. */
	authorShort: string;
	/**
	 * Family names as citeproc cites them, in order: "others" left out, and a
	 * lower-case particle dropped ("van Beethoven" → "Beethoven"); a braced
	 * organisation is one name. Empty when no person is author or editor — an
	 * `organization` field is not an author to citeproc, which cites the title.
	 */
	families: string[];
	/** The name list ends in "and others": there are more authors than `families`. */
	others: boolean;
	authors: string;
	title: string;
	year: string;
	venue: string;
}

/** Splits a BibTeX name list on top-level " and ". */
function splitNames(field: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < field.length; i++) {
		const ch = field[i];
		if (ch === '{') depth++;
		else if (ch === '}') depth--;
		else if (depth === 0 && /^\sand\s/i.test(field.slice(i, i + 5))) {
			out.push(field.slice(start, i));
			start = i + 5;
			i += 4;
		}
	}
	out.push(field.slice(start));
	return out.map((s) => s.trim()).filter(Boolean);
}

/** A person's family name from "Last, First", "First Last" or "{Organisation Name}". */
export function familyName(name: string): string {
	const trimmed = name.trim();
	if (/^\{.*\}$/.test(trimmed)) return texToPlain(trimmed);
	const comma = trimmed.indexOf(',');
	if (comma >= 0) return texToPlain(trimmed.slice(0, comma));
	const words = trimmed.split(/\s+/);
	// "Ludwig van Beethoven": the family name starts at the first lower-case particle.
	const particle = words.findIndex((w, i) => i > 0 && i < words.length - 1 && /^[a-z]/.test(w));
	return texToPlain(particle > 0 ? words.slice(particle).join(' ') : words[words.length - 1]);
}

function authorShort(families: string[], others: boolean): string {
	if (!families.length) return '';
	if (families.length === 1 && !others) return families[0];
	if (families.length === 2 && !others) return `${families[0]} and ${families[1]}`;
	return `${families[0]} et al.`;
}

/** Reads one field value at `pos` (after `=`): braces, quotes, a number or a @string name, joined by `#`. */
function readValue(text: string, pos: number, strings: Record<string, string>): { value: string; end: number } {
	let i = pos;
	let value = '';
	for (;;) {
		while (i < text.length && /\s/.test(text[i])) i++;
		if (text[i] === '{') {
			const g = braceGroup(text, i);
			if (!g) return { value, end: text.length };
			value += g.body;
			i = g.end;
		} else if (text[i] === '"') {
			let j = i + 1;
			let depth = 0;
			for (; j < text.length; j++) {
				if (text[j] === '\\') {
					j++;
					continue;
				}
				if (text[j] === '{') depth++;
				else if (text[j] === '}') depth--;
				else if (text[j] === '"' && depth === 0) break;
			}
			value += text.slice(i + 1, j);
			i = j + 1;
		} else {
			const m = /^[^\s,#}]+/.exec(text.slice(i));
			if (!m) return { value, end: i };
			value += strings[m[0].toLowerCase()] ?? m[0];
			i += m[0].length;
		}
		while (i < text.length && /\s/.test(text[i])) i++;
		if (text[i] !== '#') return { value, end: i };
		i++;
	}
}

export function parseBib(text: string): Record<string, BibEntry> {
	const entries: Record<string, BibEntry> = {};
	const strings: Record<string, string> = {};
	const at = /@\s*([A-Za-z]+)\s*([{(])/g;
	let m: RegExpExecArray | null;
	while ((m = at.exec(text))) {
		const type = m[1].toLowerCase();
		const open = at.lastIndex - 1;
		if (type === 'comment' || type === 'preamble') continue;
		let i = open + 1;
		if (type === 'string') {
			const sm = /^\s*([A-Za-z][\w:-]*)\s*=/.exec(text.slice(i));
			if (sm) {
				const v = readValue(text, i + sm[0].length, strings);
				strings[sm[1].toLowerCase()] = v.value;
				at.lastIndex = v.end;
			}
			continue;
		}
		const km = /^\s*([^,\s{}()]+)\s*,/.exec(text.slice(i));
		if (!km) continue;
		const key = km[1];
		i += km[0].length;
		const fields: Record<string, string> = {};
		for (;;) {
			const fm = /^\s*([A-Za-z][\w:-]*)\s*=/.exec(text.slice(i, i + 200));
			if (!fm) break;
			const v = readValue(text, i + fm[0].length, strings);
			fields[fm[1].toLowerCase()] = v.value;
			i = v.end;
			while (i < text.length && /\s/.test(text[i])) i++;
			if (text[i] !== ',') break;
			i++;
		}
		at.lastIndex = i;
		const names = splitNames(fields.author ?? fields.editor ?? '');
		const others = names.length > 1 && names[names.length - 1].toLowerCase() === 'others';
		const people = others ? names.slice(0, -1) : names;
		const organisation = texToPlain(fields.organization ?? fields.institution ?? '');
		const familyNames = people.map(familyName);
		const year = fields.year ?? (fields.date ?? '').slice(0, 4);
		entries[key] = {
			key,
			type,
			authorShort: authorShort(familyNames.length ? familyNames : organisation ? [organisation] : [], others),
			families: familyNames.map((n) => n.replace(/^(?:[a-z][\w'’]*\s+)+(?=\S)/, '')),
			others,
			authors: people.map((n) => texToPlain(n)).join('; ') + (others ? '; …' : ''),
			title: texToPlain(fields.title ?? ''),
			year: texToPlain(year),
			venue: texToPlain(fields.journal ?? fields.journaltitle ?? fields.booktitle ?? fields.publisher ?? fields.howpublished ?? fields.school ?? ''),
		};
	}
	return entries;
}

/** One line describing a bibliography entry, for a hover title. */
export function describeBib(e: BibEntry | undefined, key: string): string {
	if (!e) return `${key} — not in the bibliography files found`;
	const bits = [e.authors || e.authorShort, e.title, e.venue, e.year].filter(Boolean);
	return `${key}: ${bits.join('. ')}`;
}
