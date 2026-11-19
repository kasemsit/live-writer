import { texToPlain } from './plusTexScan';

/**
 * md-live-preview-plus: what the last LaTeX run knows and the source does not
 * — the number each `\label` and `\cite` key printed as — read from the
 * `.aux` file, and the bibliography entries read from `.bib` files.
 *
 * This is how the LaTeX Live Preview shows "Fig. 3" and "[12]" instead of the
 * keys, as Overleaf does: it reuses whatever the user's own build (LaTeX
 * Workshop, latexmk, Overleaf sync…) last wrote, and never compiles anything.
 */

export interface AuxData {
	/** `\label` key → the number it printed as (`3`, `II-B`, `A.1`). */
	labels: Record<string, string>;
	/** Citation key → its number in the bibliography (numeric styles). */
	cites: Record<string, string>;
	/** Other `.aux` files this one pulls in (`\include` writes one per file). */
	includes: string[];
}

/** The text of a `{…}` group starting at `open`, and where it ends; null when unbalanced. */
function group(text: string, open: number): { body: string; end: number } | null {
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

/** A label's printed number, without the formatting LaTeX wraps it in (`{\relax 1}`, `\textup {II}`). */
export function cleanAuxNumber(raw: string): string {
	return raw
		.replace(/\\(?:relax|textup|textrm|textnormal|ignorespaces|protect|nobreakspace)\b\s*/g, '')
		.replace(/\\([A-Za-z]+)\s*\{/g, '{')
		.replace(/[{}]/g, '')
		.replace(/~/g, ' ')
		.trim();
}

export function parseAux(text: string): AuxData {
	const data: AuxData = { labels: {}, cites: {}, includes: [] };
	for (const m of text.matchAll(/\\newlabel\{([^{}]*)\}\{/g)) {
		const key = m[1];
		// cleveref writes a second label per key (`key@cref`); the plain one is the number.
		if (key.endsWith('@cref')) continue;
		const outer = group(text, m.index! + m[0].length - 1);
		if (!outer) continue;
		const first = group(outer.body, outer.body.indexOf('{'));
		if (!first) continue;
		const value = cleanAuxNumber(first.body);
		if (value) data.labels[key] = value;
	}
	for (const m of text.matchAll(/\\bibcite\{([^{}]*)\}\{/g)) {
		const g = group(text, m.index! + m[0].length - 1);
		if (!g) continue;
		// natbib writes {{number}{year}{{author}}{{full author}}}; plain BibTeX writes the number alone.
		const inner = g.body.startsWith('{') ? group(g.body, 0)?.body ?? g.body : g.body;
		data.cites[m[1]] = cleanAuxNumber(inner);
	}
	for (const m of text.matchAll(/\\@input\{([^{}]+)\}/g)) data.includes.push(m[1]);
	return data;
}

/** Merges aux files read in order; later files add to, and do not override, earlier ones. */
export function mergeAux(parts: AuxData[]): AuxData {
	const out: AuxData = { labels: {}, cites: {}, includes: [] };
	for (const part of parts) {
		for (const [k, v] of Object.entries(part.labels)) if (!(k in out.labels)) out.labels[k] = v;
		for (const [k, v] of Object.entries(part.cites)) if (!(k in out.cites)) out.cites[k] = v;
	}
	return out;
}

// ── BibTeX ──────────────────────────────────────────────────────────────────

export interface BibEntry {
	key: string;
	type: string;
	/** "Smith", "Smith and Jones", "Smith et al." */
	authorShort: string;
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

function authorShort(field: string): string {
	const names = splitNames(field);
	if (!names.length) return '';
	if (names.length === 1) return familyName(names[0]);
	if (names.length === 2) return `${familyName(names[0])} and ${familyName(names[1])}`;
	return `${familyName(names[0])} et al.`;
}

/** Reads one field value at `pos` (after `=`): braces, quotes, a number or a @string name, joined by `#`. */
function readValue(text: string, pos: number, strings: Record<string, string>): { value: string; end: number } {
	let i = pos;
	let value = '';
	for (;;) {
		while (i < text.length && /\s/.test(text[i])) i++;
		if (text[i] === '{') {
			const g = group(text, i);
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
		const authors = fields.author ?? fields.editor ?? '';
		const year = fields.year ?? (fields.date ?? '').slice(0, 4);
		entries[key] = {
			key,
			type,
			authorShort: authorShort(authors) || texToPlain(fields.organization ?? fields.institution ?? ''),
			authors: splitNames(authors).map((n) => texToPlain(n)).join('; '),
			title: texToPlain(fields.title ?? ''),
			year: texToPlain(year),
			venue: texToPlain(fields.journal ?? fields.journaltitle ?? fields.booktitle ?? fields.publisher ?? fields.howpublished ?? fields.school ?? ''),
		};
	}
	return entries;
}

// ── Citation labels ─────────────────────────────────────────────────────────

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

/** One line describing a bibliography entry, for a hover title. */
export function describeBib(e: BibEntry | undefined, key: string): string {
	if (!e) return `${key} — not in the bibliography files found`;
	const bits = [e.authors || e.authorShort, e.title, e.venue, e.year].filter(Boolean);
	return `${key}: ${bits.join('. ')}`;
}
