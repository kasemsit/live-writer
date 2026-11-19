import { matchBrace, readArgs } from './plusTexScanner';

/**
 * md-live-preview-plus: a `tabular` body read into rows and cells, for the
 * LaTeX Live Preview to draw as a table.
 *
 * Offsets are kept for every cell so that a selection in the drawn table can
 * be mapped back to its source, as the Markdown tables do. Rules (`\hline`,
 * booktabs' `\toprule` / `\midrule` / `\cmidrule` / `\bottomrule`) are kept
 * as borders above the row they precede.
 */

export type TexAlign = 'l' | 'c' | 'r';

export interface TexRule {
	kind: 'thick' | 'thin' | 'partial';
	/** 1-based first and last column of a partial rule (`\cmidrule{2-4}`, `\cline{2-4}`). */
	first?: number;
	last?: number;
}

export interface TexCell {
	/** Document offsets of the cell's content (inside `\multicolumn`'s last argument when there is one). */
	from: number;
	to: number;
	colspan: number;
	align: TexAlign | null;
}

export interface TexRow {
	cells: TexCell[];
	rulesAbove: TexRule[];
}

export interface TexTable {
	cols: TexAlign[];
	rows: TexRow[];
	rulesBelow: TexRule[];
}

/** Column types of a tabular spec (`l|c|r`, `p{3cm}`, `*{3}{c}`, `@{}`, `>{\bfseries}l`, `X`, `S`). */
export function parseColSpec(spec: string): TexAlign[] {
	const out: TexAlign[] = [];
	for (let i = 0; i < spec.length; i++) {
		const ch = spec[i];
		const skipGroup = () => {
			let k = i + 1;
			while (spec[k] === ' ') k++;
			if (spec[k] === '{') {
				const close = matchBrace(spec, k);
				if (close > 0) i = close;
			}
		};
		if (ch === 'l' || ch === 'c' || ch === 'r') out.push(ch);
		else if (ch === 'L' || ch === 'J') out.push('l');
		else if (ch === 'C' || ch === 'S') out.push('c');
		else if (ch === 'R') out.push('r');
		else if (ch === 'X') out.push('l');
		else if (ch === 'p' || ch === 'm' || ch === 'b') {
			out.push('l');
			skipGroup();
		} else if (ch === '@' || ch === '!' || ch === '>' || ch === '<') skipGroup();
		else if (ch === 'D') {
			out.push('c');
			skipGroup();
			skipGroup();
			skipGroup();
		} else if (ch === '*') {
			const count = readArgs(spec, i + 1, 'mm');
			if (!count) continue;
			const times = Math.min(50, Number(spec.slice(count.args[0]!.from, count.args[0]!.to)) || 0);
			const inner = parseColSpec(spec.slice(count.args[1]!.from, count.args[1]!.to));
			for (let t = 0; t < times; t++) out.push(...inner);
			i = count.end - 1;
		}
	}
	return out;
}

/** The text with comments blanked out (same length, so offsets still hold). */
function blankComments(text: string): string {
	let out = '';
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === '\\') {
			out += text.slice(i, i + 2);
			i++;
			continue;
		}
		if (ch === '%') {
			let j = text.indexOf('\n', i);
			if (j < 0) j = text.length;
			out += ' '.repeat(j - i);
			i = j - 1;
			continue;
		}
		out += ch;
	}
	return out;
}

/**
 * Splits `text` at top-level occurrences found by `at` (brace depth 0,
 * escapes skipped). `at(i)` returns the separator's length there, or 0.
 */
function splitTop(text: string, at: (i: number) => number): { from: number; to: number; sepEnd: number }[] {
	const parts: { from: number; to: number; sepEnd: number }[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === '{') depth++;
		else if (ch === '}') depth = Math.max(0, depth - 1);
		if (depth === 0) {
			const len = at(i);
			if (len) {
				parts.push({ from: start, to: i, sepEnd: i + len });
				start = i + len;
				i += len - 1;
				continue;
			}
		}
		if (ch === '\\') i++;
	}
	parts.push({ from: start, to: text.length, sepEnd: text.length });
	return parts;
}

const RULE = /^\\(hline|toprule|midrule|bottomrule|cmidrule|cline|addlinespace|specialrule|morecmidrules|noalign|rowcolor|hhline|arrayrulecolor|cmidrulewidth)(?![A-Za-z])/;

/** Leading rule commands of a row segment: the rules, and where the row's content starts. */
function readRules(text: string, from: number): { rules: TexRule[]; at: number } {
	const rules: TexRule[] = [];
	let i = from;
	for (;;) {
		while (i < text.length && /\s/.test(text[i])) i++;
		const m = RULE.exec(text.slice(i, i + 20));
		if (!m) return { rules, at: i };
		const name = m[1];
		const after = i + m[0].length;
		let args = null;
		switch (name) {
			case 'hline':
				rules.push({ kind: 'thin' });
				break;
			case 'toprule':
			case 'bottomrule':
				args = readArgs(text, after, 'o');
				rules.push({ kind: 'thick' });
				break;
			case 'midrule':
				args = readArgs(text, after, 'o');
				rules.push({ kind: 'thin' });
				break;
			case 'cmidrule':
			case 'cline': {
				args = readArgs(text, after, name === 'cmidrule' ? 'opm' : 'm');
				const arg = args?.args[args.args.length - 1];
				const range = arg ? /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(text.slice(arg.from, arg.to)) : null;
				if (range) rules.push({ kind: 'partial', first: Number(range[1]), last: Number(range[2]) });
				break;
			}
			case 'specialrule':
				args = readArgs(text, after, 'mmm');
				rules.push({ kind: 'thick' });
				break;
			case 'addlinespace':
				args = readArgs(text, after, 'o');
				break;
			case 'noalign':
			case 'hhline':
				args = readArgs(text, after, 'm');
				break;
			case 'rowcolor':
			case 'arrayrulecolor':
				args = readArgs(text, after, 'om');
				break;
			case 'cmidrulewidth':
				break;
		}
		i = args ? args.end : after;
	}
}

/**
 * Reads a tabular body. `offset` is the body's position in the document;
 * every offset in the result is a document offset.
 */
export function parseTabular(body: string, offset: number, spec: string): TexTable {
	const text = blankComments(body);
	const table: TexTable = { cols: parseColSpec(spec), rows: [], rulesBelow: [] };
	const segments = splitTop(text, (i) => {
		if (text[i] !== '\\') return 0;
		if (text[i + 1] === '\\') {
			// `\\*` and `\\[2pt]` belong to the separator.
			let j = i + 2;
			if (text[j] === '*') j++;
			let k = j;
			while (text[k] === ' ') k++;
			if (text[k] === '[') {
				const close = text.indexOf(']', k);
				if (close > 0) j = close + 1;
			}
			return j - i;
		}
		return text.startsWith('\\tabularnewline', i) ? '\\tabularnewline'.length : 0;
	});
	let pending: TexRule[] = [];
	for (const seg of segments) {
		const { rules, at } = readRules(text, seg.from);
		pending.push(...rules);
		if (!text.slice(at, seg.to).trim()) continue;
		const cells: TexCell[] = [];
		for (const part of splitTop(text.slice(at, seg.to), (i) => (text[at + i] === '&' ? 1 : 0))) {
			let from = at + part.from;
			let to = at + part.to;
			while (from < to && /\s/.test(text[from])) from++;
			while (to > from && /\s/.test(text[to - 1])) to--;
			const cell: TexCell = { from: offset + from, to: offset + to, colspan: 1, align: null };
			const mc = /^\\multicolumn(?![A-Za-z])/.exec(text.slice(from, from + 13));
			if (mc) {
				const args = readArgs(text, from + mc[0].length, 'mmm');
				if (args) {
					cell.colspan = Math.max(1, Number(text.slice(args.args[0]!.from, args.args[0]!.to).trim()) || 1);
					cell.align = parseColSpec(text.slice(args.args[1]!.from, args.args[1]!.to))[0] ?? null;
					cell.from = offset + args.args[2]!.from;
					cell.to = offset + args.args[2]!.to;
				}
			} else {
				const mr = /^\\multirow(?![A-Za-z])/.exec(text.slice(from, from + 10));
				const args = mr ? readArgs(text, from + mr[0].length, 'omom') : null;
				if (args) {
					cell.from = offset + args.args[3]!.from;
					cell.to = offset + args.args[3]!.to;
				}
			}
			cells.push(cell);
		}
		table.rows.push({ cells, rulesAbove: pending });
		pending = [];
	}
	table.rulesBelow = pending;
	return table;
}
