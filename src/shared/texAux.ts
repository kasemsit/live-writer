import { braceGroup as group } from './bib';

/**
 * What the last LaTeX run knows and the source does not
 * — the number each `\label` and `\cite` key printed as — read from the
 * `.aux` file. The bibliography is bib.ts; how a citation reads, citations.ts.
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
