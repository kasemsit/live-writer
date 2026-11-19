/**
 * md-live-preview-plus: a fast, error-tolerant scanner for LaTeX source.
 *
 * Not a TeX implementation. It finds what the LaTeX Live Preview needs to
 * draw a document the way Overleaf's Visual Editor does: comments, math,
 * verbatim, environments and commands, each with its offsets. Arguments are
 * read on demand (`readArgs`) because how many a command takes depends on the
 * command.
 *
 * Malformed input is the normal case while typing, so nothing here throws: an
 * unclosed `$`, a `\begin` without its `\end`, a brace left open all degrade
 * to "not recognised" rather than swallowing the rest of the document. Math
 * never crosses a blank line (TeX itself rejects a paragraph break in math),
 * which is what keeps a half-typed `$` from turning everything below into
 * math.
 */

export const MATH_ENVS = new Set([
	'equation',
	'equation*',
	'align',
	'align*',
	'gather',
	'gather*',
	'multline',
	'multline*',
	'flalign',
	'flalign*',
	'alignat',
	'alignat*',
	'eqnarray',
	'eqnarray*',
	'displaymath',
	'dmath',
	'dmath*',
]);

/** Environments whose body is not LaTeX (or, for `comment`, not output). */
export const VERBATIM_ENVS = new Set([
	'verbatim',
	'verbatim*',
	'Verbatim',
	'lstlisting',
	'minted',
	'comment',
	'alltt',
	'filecontents',
	'filecontents*',
]);

export interface TexRange {
	from: number;
	to: number;
}

export interface TexMath extends TexRange {
	/** The TeX between the delimiters (for an environment, its body). */
	innerFrom: number;
	innerTo: number;
	display: boolean;
	/** The environment name for `\begin{align}`-style math, else null. */
	env: string | null;
}

export interface TexVerbatim extends TexRange {
	env: string;
	innerFrom: number;
	innerTo: number;
}

export interface TexEnv extends TexRange {
	name: string;
	/** End of `\begin{name}` (arguments after it are not included). */
	nameTo: number;
	/** Start of `\end{name}`; equals `to` when the environment is never closed. */
	endFrom: number;
	/** Index of the enclosing environment in `TexScan.envs`, or -1. */
	parent: number;
	depth: number;
	closed: boolean;
}

export interface TexCommand extends TexRange {
	/** The control word without its backslash, or the one character of a control symbol. */
	name: string;
}

export interface TexScan {
	comments: TexRange[];
	maths: TexMath[];
	verbatims: TexVerbatim[];
	envs: TexEnv[];
	/** Every command outside comments, math and verbatim, in document order. */
	commands: TexCommand[];
	/** Where the document body starts: after `\begin{document}`, or 0 for a file without one. */
	bodyFrom: number;
	bodyTo: number;
	/** True when the file has `\begin{document}`, so everything before it is preamble. */
	hasPreamble: boolean;
}

const BACKSLASH = 92;
const PERCENT = 37;
const DOLLAR = 36;
const NEWLINE = 10;

export function isLetter(ch: number): boolean {
	return (ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122);
}

function isSpace(ch: number): boolean {
	return ch === 32 || ch === 9 || ch === 13;
}

export function lineEnd(text: string, pos: number): number {
	const nl = text.indexOf('\n', pos);
	return nl < 0 ? text.length : nl;
}

/** True when `pos` sits on a newline that is followed (after blanks) by another: a paragraph break. */
function blankLineAt(text: string, pos: number): boolean {
	if (text.charCodeAt(pos) !== NEWLINE) return false;
	for (let i = pos + 1; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		if (ch === NEWLINE) return true;
		if (!isSpace(ch)) return false;
	}
	return true;
}

/** `{name}` after `\begin` / `\end`: the name and the offset after `}`, or null. */
function readEnvName(text: string, pos: number): { name: string; to: number } | null {
	let i = pos;
	while (i < text.length && isSpace(text.charCodeAt(i))) i++;
	if (text[i] !== '{') return null;
	const close = text.indexOf('}', i + 1);
	if (close < 0) return null;
	const name = text.slice(i + 1, close).trim();
	if (!/^[A-Za-z@]+\*?$/.test(name)) return null;
	return { name, to: close + 1 };
}

/**
 * Where math that opened before `from` closes: the offset of `close`, or -1
 * when a blank line (or the end of the text) comes first.
 */
function findMathClose(text: string, from: number, close: string): number {
	const first = close.charCodeAt(0);
	for (let i = from; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		if (ch === NEWLINE && blankLineAt(text, i)) return -1;
		if (ch === PERCENT) {
			i = lineEnd(text, i) - 1;
			continue;
		}
		if (ch === first && text.startsWith(close, i)) return i;
		if (ch === BACKSLASH) i++;
	}
	return -1;
}

export function scanTex(text: string): TexScan {
	const n = text.length;
	const scan: TexScan = { comments: [], maths: [], verbatims: [], envs: [], commands: [], bodyFrom: 0, bodyTo: n, hasPreamble: false };
	const stack: number[] = [];
	let i = 0;
	while (i < n) {
		const ch = text.charCodeAt(i);
		if (ch === PERCENT) {
			const end = lineEnd(text, i);
			scan.comments.push({ from: i, to: end });
			i = end;
			continue;
		}
		if (ch === DOLLAR) {
			const display = text.charCodeAt(i + 1) === DOLLAR;
			const open = display ? 2 : 1;
			const close = findMathClose(text, i + open, display ? '$$' : '$');
			if (close >= 0) {
				scan.maths.push({ from: i, to: close + open, innerFrom: i + open, innerTo: close, display, env: null });
				i = close + open;
			} else {
				i += open;
			}
			continue;
		}
		if (ch !== BACKSLASH || i + 1 >= n) {
			i++;
			continue;
		}
		const next = text.charCodeAt(i + 1);
		if (!isLetter(next)) {
			// \[ … \]  and  \( … \)
			if (next === 91 || next === 40) {
				const display = next === 91;
				const close = findMathClose(text, i + 2, display ? '\\]' : '\\)');
				if (close >= 0) {
					scan.maths.push({ from: i, to: close + 2, innerFrom: i + 2, innerTo: close, display, env: null });
					i = close + 2;
					continue;
				}
			}
			scan.commands.push({ name: text[i + 1], from: i, to: i + 2 });
			i += 2;
			continue;
		}
		let j = i + 1;
		while (j < n && isLetter(text.charCodeAt(j))) j++;
		const name = text.slice(i + 1, j);
		if (name === 'begin' || name === 'end') {
			const env = readEnvName(text, j);
			if (env) {
				if (name === 'begin') {
					i = beginEnv(text, scan, stack, i, env);
				} else {
					endEnv(scan, stack, i, env);
					i = env.to;
				}
				continue;
			}
		}
		if (name === 'verb') {
			let k = j;
			if (text[k] === '*') k++;
			const delim = text[k];
			if (delim && !/[\sA-Za-z{]/.test(delim)) {
				const close = text.indexOf(delim, k + 1);
				if (close > 0 && close < lineEnd(text, k)) {
					scan.verbatims.push({ from: i, to: close + 1, env: 'verb', innerFrom: k + 1, innerTo: close });
					i = close + 1;
					continue;
				}
			}
		}
		scan.commands.push({ name, from: i, to: j });
		i = j;
	}
	if (!scan.hasPreamble) {
		scan.bodyFrom = 0;
		scan.bodyTo = n;
	}
	return scan;
}

function beginEnv(text: string, scan: TexScan, stack: number[], from: number, env: { name: string; to: number }): number {
	const n = text.length;
	if (MATH_ENVS.has(env.name)) {
		const endTag = `\\end{${env.name}}`;
		const close = findMathClose(text, env.to, endTag);
		if (close >= 0) {
			scan.maths.push({ from, to: close + endTag.length, innerFrom: env.to, innerTo: close, display: true, env: env.name });
			return close + endTag.length;
		}
		// Unclosed (still being typed, or broken): scanned as ordinary text.
	}
	if (VERBATIM_ENVS.has(env.name)) {
		const endTag = `\\end{${env.name}}`;
		const close = text.indexOf(endTag, env.to);
		const end = close < 0 ? n : close + endTag.length;
		if (env.name === 'comment') scan.comments.push({ from, to: end });
		else scan.verbatims.push({ from, to: end, env: env.name, innerFrom: env.to, innerTo: close < 0 ? n : close });
		return end;
	}
	scan.envs.push({
		name: env.name,
		from,
		nameTo: env.to,
		endFrom: n,
		to: n,
		parent: stack.length ? stack[stack.length - 1] : -1,
		depth: stack.length,
		closed: false,
	});
	stack.push(scan.envs.length - 1);
	if (env.name === 'document') {
		scan.bodyFrom = env.to;
		scan.hasPreamble = true;
	}
	return env.to;
}

function endEnv(scan: TexScan, stack: number[], from: number, env: { name: string; to: number }): void {
	for (let k = stack.length - 1; k >= 0; k--) {
		const open = scan.envs[stack[k]];
		if (open.name !== env.name) continue;
		open.endFrom = from;
		open.to = env.to;
		open.closed = true;
		// Anything opened inside and never closed ends here too.
		for (let m = stack.length - 1; m > k; m--) {
			const inner = scan.envs[stack[m]];
			inner.endFrom = from;
			inner.to = from;
		}
		stack.length = k;
		if (env.name === 'document') scan.bodyTo = from;
		return;
	}
}

// ── Arguments ───────────────────────────────────────────────────────────────

export interface TexArg {
	/** The argument's content, without its delimiters. */
	from: number;
	to: number;
	optional: boolean;
}

export interface TexArgs {
	star: boolean;
	/** One entry per spec letter after `s`: an argument, or null when an optional one is absent. */
	args: (TexArg | null)[];
	/** Offset just after the last argument read. */
	end: number;
}

const MAX_ARG = 20000;

/** Offset of the `}` matching the `{` at `open`, or -1. Escapes and comments are skipped. */
export function matchBrace(text: string, open: number): number {
	let depth = 0;
	const limit = Math.min(text.length, open + MAX_ARG);
	for (let i = open; i < limit; i++) {
		const ch = text.charCodeAt(i);
		if (ch === BACKSLASH) {
			i++;
			continue;
		}
		if (ch === PERCENT) {
			i = lineEnd(text, i);
			continue;
		}
		if (ch === 123) depth++;
		else if (ch === 125) {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

/** Offset of the `close` bracket matching `text[open]`, skipping brace groups. */
function matchBracket(text: string, open: number, close: string): number {
	const limit = Math.min(text.length, open + MAX_ARG);
	for (let i = open + 1; i < limit; i++) {
		const ch = text[i];
		if (ch === '\\') {
			i++;
			continue;
		}
		if (ch === '{') {
			const end = matchBrace(text, i);
			if (end < 0) return -1;
			i = end;
			continue;
		}
		if (ch === '\n' && blankLineAt(text, i)) return -1;
		if (ch === close) return i;
	}
	return -1;
}

/**
 * Reads a command's arguments from `pos` (just after its name) by `spec`:
 * `s` an optional star, `o` an optional `[…]`, `p` an optional `(…)`, `m` a
 * mandatory `{…}`. Returns null when a mandatory argument is missing or
 * unclosed. Blanks (and one line break) may separate a mandatory argument
 * from what precedes it; an optional one must follow on the same line.
 */
export function readArgs(text: string, pos: number, spec: string): TexArgs | null {
	const result: TexArgs = { star: false, args: [], end: pos };
	let i = pos;
	for (const kind of spec) {
		if (kind === 's') {
			if (text[i] === '*') {
				result.star = true;
				i++;
				result.end = i;
			}
			continue;
		}
		let k = i;
		if (kind === 'm') {
			let newlines = 0;
			while (k < text.length) {
				const ch = text.charCodeAt(k);
				if (ch === NEWLINE) {
					if (++newlines > 1) break;
				} else if (!isSpace(ch)) break;
				k++;
			}
			if (text[k] !== '{') return null;
			const close = matchBrace(text, k);
			if (close < 0) return null;
			result.args.push({ from: k + 1, to: close, optional: false });
			i = close + 1;
			result.end = i;
			continue;
		}
		while (k < text.length && (text[k] === ' ' || text[k] === '\t')) k++;
		const open = kind === 'p' ? '(' : '[';
		if (text[k] !== open) {
			result.args.push(null);
			continue;
		}
		const close = matchBracket(text, k, kind === 'p' ? ')' : ']');
		if (close < 0) {
			result.args.push(null);
			continue;
		}
		result.args.push({ from: k + 1, to: close, optional: true });
		i = close + 1;
		result.end = i;
	}
	return result;
}

// ── Lookups over a scan ─────────────────────────────────────────────────────

/** Index of the first range whose `to` is past `pos` (ranges sorted by `from`, non-overlapping). */
function firstEndingAfter(ranges: readonly TexRange[], pos: number): number {
	let lo = 0;
	let hi = ranges.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (ranges[mid].to <= pos) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/** The range among sorted, non-overlapping `ranges` that contains `pos`, if any. */
export function rangeAt<T extends TexRange>(ranges: readonly T[], pos: number): T | undefined {
	const k = firstEndingAfter(ranges, pos);
	const r = ranges[k];
	return r && r.from <= pos && pos < r.to ? r : undefined;
}

/** Index of the first command starting at or after `pos`. */
export function commandIndexAt(commands: readonly TexCommand[], pos: number): number {
	let lo = 0;
	let hi = commands.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (commands[mid].from < pos) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/** The innermost environment containing `pos`. */
export function envAt(scan: TexScan, pos: number, filter?: (env: TexEnv) => boolean): TexEnv | undefined {
	let best: TexEnv | undefined;
	for (const env of scan.envs) {
		if (env.from > pos) break;
		if (pos < env.to && (!filter || filter(env)) && (!best || env.depth >= best.depth)) best = env;
	}
	return best;
}

// ── Document structure ──────────────────────────────────────────────────────

export const SECTION_LEVELS: Record<string, number> = {
	part: 0,
	chapter: 1,
	section: 2,
	subsection: 3,
	subsubsection: 4,
	paragraph: 5,
	subparagraph: 6,
};

export interface TexHeading {
	command: string;
	/** 0 (part) … 6 (subparagraph); see SECTION_LEVELS. */
	level: number;
	text: string;
	/** 1-based line. */
	line: number;
	from: number;
}

function lineNumberAt(text: string, pos: number, cache: { pos: number; line: number }): number {
	let line = cache.line;
	for (let i = cache.pos; i < pos; i++) if (text.charCodeAt(i) === NEWLINE) line++;
	cache.pos = pos;
	cache.line = line;
	return line;
}

/** Sectioning commands in the body, in order, with their titles as plain text. */
export function texHeadings(text: string, scan: TexScan = scanTex(text)): TexHeading[] {
	const out: TexHeading[] = [];
	const cache = { pos: 0, line: 1 };
	for (const cmd of scan.commands) {
		const level = SECTION_LEVELS[cmd.name];
		if (level === undefined || cmd.from < scan.bodyFrom || cmd.from >= scan.bodyTo) continue;
		const args = readArgs(text, cmd.to, 'som');
		const title = args?.args[1];
		if (!title) continue;
		out.push({ command: cmd.name, level, text: texToPlain(text.slice(title.from, title.to)), line: lineNumberAt(text, cmd.from, cache), from: cmd.from });
	}
	return out;
}

/** Headings for the outline view, with levels renumbered so the topmost present is 1. */
export function extractTexHeadings(text: string): { level: number; text: string; line: number }[] {
	const headings = texHeadings(text);
	const top = Math.min(...headings.map((h) => h.level));
	return headings.map((h) => ({ level: h.level - top + 1, text: h.text, line: h.line }));
}

// ── Text ────────────────────────────────────────────────────────────────────

/** Text symbols written as control words (`\ldots`), as the characters they print. */
export const TEXT_SYMBOLS: Record<string, string> = {
	ldots: '…',
	dots: '…',
	textellipsis: '…',
	LaTeX: 'LaTeX',
	LaTeXe: 'LaTeX2ε',
	TeX: 'TeX',
	BibTeX: 'BibTeX',
	copyright: '©',
	textcopyright: '©',
	textregistered: '®',
	texttrademark: '™',
	S: '§',
	P: '¶',
	dag: '†',
	ddag: '‡',
	textdagger: '†',
	textdaggerdbl: '‡',
	textbullet: '•',
	textdegree: '°',
	textless: '<',
	textgreater: '>',
	textbackslash: '\\',
	textasciitilde: '~',
	textasciicircum: '^',
	textunderscore: '_',
	textbar: '|',
	textbraceleft: '{',
	textbraceright: '}',
	textendash: '–',
	textemdash: '—',
	textquoteleft: '‘',
	textquoteright: '’',
	textquotedblleft: '“',
	textquotedblright: '”',
	textperiodcentered: '·',
	textmu: 'µ',
	textpm: '±',
	texttimes: '×',
	textdiv: '÷',
	textminus: '−',
	checkmark: '✓',
	quad: ' ',
	qquad: '  ',
	enspace: ' ',
	enskip: ' ',
	thinspace: ' ',
	nobreakspace: ' ',
	ss: 'ß',
	ae: 'æ',
	AE: 'Æ',
	oe: 'œ',
	OE: 'Œ',
	o: 'ø',
	O: 'Ø',
	aa: 'å',
	AA: 'Å',
	l: 'ł',
	L: 'Ł',
	i: 'ı',
	j: 'ȷ',
	euro: '€',
	texteuro: '€',
	pounds: '£',
	textsterling: '£',
	textyen: '¥',
	textcent: '¢',
	textperthousand: '‰',
	textonehalf: '½',
	textcelsius: '℃',
	textsection: '§',
	textparagraph: '¶',
	textexclamdown: '¡',
	textquestiondown: '¿',
	guillemotleft: '«',
	guillemotright: '»',
	textrightarrow: '→',
	textleftarrow: '←',
	slash: '/',
};

/** Control symbols (`\%`) as the characters they print. */
export const CONTROL_SYMBOLS: Record<string, string> = {
	'%': '%',
	'&': '&',
	$: '$',
	'#': '#',
	_: '_',
	'{': '{',
	'}': '}',
	',': ' ',
	';': ' ',
	':': ' ',
	' ': ' ',
	'@': '',
	'/': '',
	'-': '',
	'!': '',
};

/** Accent commands, as Unicode combining marks. */
export const ACCENTS: Record<string, string> = {
	"'": '́',
	'`': '̀',
	'^': '̂',
	'"': '̈',
	'~': '̃',
	'=': '̄',
	'.': '̇',
	u: '̆',
	v: '̌',
	H: '̋',
	c: '̧',
	k: '̨',
	r: '̊',
	d: '̣',
	b: '̱',
};

/**
 * An accent at `pos` (`\'e`, `\'{e}`, `\"{\i}`, `\v{c}`): the accented
 * character and where the construct ends, or null.
 */
export function readAccent(text: string, pos: number): { text: string; to: number } | null {
	if (text.charCodeAt(pos) !== BACKSLASH) return null;
	let i = pos + 1;
	let mark: string | undefined;
	const sym = text[i];
	if (sym && !isLetter(sym.charCodeAt(0))) {
		mark = ACCENTS[sym];
		i++;
	} else {
		let j = i;
		while (j < text.length && isLetter(text.charCodeAt(j))) j++;
		const word = text.slice(i, j);
		if (word.length !== 1 || text[j] !== '{') return null;
		mark = ACCENTS[word];
		i = j;
	}
	if (!mark) return null;
	let base: string;
	let end: number;
	const braced = text[i] === '{';
	const at = braced ? i + 1 : i;
	if (text.startsWith('\\i', at) && !isLetter(text.charCodeAt(at + 2))) {
		base = 'i';
		end = at + 2;
	} else if (text.startsWith('\\j', at) && !isLetter(text.charCodeAt(at + 2))) {
		base = 'j';
		end = at + 2;
	} else if (at < text.length && isLetter(text.charCodeAt(at))) {
		base = text[at];
		end = at + 1;
	} else {
		return null;
	}
	if (braced) {
		if (text[end] !== '}') return null;
		end++;
	}
	return { text: (base + mark).normalize('NFC'), to: end };
}

/** `` `` `` → “ and similar ligatures of plain text, at `pos`: the replacement and its length, or null. */
export function textLigature(text: string, pos: number): { text: string; length: number } | null {
	const ch = text[pos];
	if (ch === '-') {
		if (text[pos + 1] !== '-') return null;
		if (text[pos + 2] === '-') return { text: '—', length: 3 };
		return { text: '–', length: 2 };
	}
	if (ch === '`') return text[pos + 1] === '`' ? { text: '“', length: 2 } : { text: '‘', length: 1 };
	if (ch === "'" && text[pos + 1] === "'") return { text: '”', length: 2 };
	if (ch === '~') return { text: ' ', length: 1 };
	return null;
}

/**
 * LaTeX reduced to its text, for headings in the outline, search queries and
 * hover cards: commands dropped (their arguments kept), symbols and accents
 * printed, math kept as written.
 */
export function texToPlain(src: string): string {
	let out = '';
	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		if (ch === '%') {
			i = lineEnd(src, i);
			out += ' ';
			continue;
		}
		if (ch === '{' || ch === '}') continue;
		if (ch === '\\') {
			const accent = readAccent(src, i);
			if (accent) {
				out += accent.text;
				i = accent.to - 1;
				continue;
			}
			const next = src[i + 1] ?? '';
			if (next === '\\') {
				out += ' ';
				i++;
				continue;
			}
			if (next && !isLetter(next.charCodeAt(0))) {
				out += CONTROL_SYMBOLS[next] ?? next;
				i++;
				continue;
			}
			let j = i + 1;
			while (j < src.length && isLetter(src.charCodeAt(j))) j++;
			const word = src.slice(i + 1, j);
			if (word in TEXT_SYMBOLS) out += TEXT_SYMBOLS[word];
			i = j - 1;
			// Arguments that are not text: a reference keeps its key in brackets, the rest are dropped.
			if (/^(label|ref|eqref|cref|Cref|autoref|pageref|cite\w*|includegraphics|input|include|vspace|hspace|textcolor|color)$/.test(word)) {
				const args = readArgs(src, j, word === 'textcolor' || word === 'color' ? 'om' : 'som');
				const last = args?.args[args.args.length - 1];
				if (args && last) {
					if (/ref$|^cite/.test(word)) out += `[${src.slice(last.from, last.to)}]`;
					i = args.end - 1;
				}
			}
			continue;
		}
		const lig = textLigature(src, i);
		if (lig) {
			out += lig.text === ' ' ? ' ' : lig.text;
			i += lig.length - 1;
			continue;
		}
		out += ch;
	}
	return out.replace(/\s+/g, ' ').trim();
}

// ── Macros, for KaTeX ───────────────────────────────────────────────────────

/**
 * Adds a macro unless KaTeX could not expand it: one that uses LaTeX
 * internals (`\@…`) or calls itself (`\renewcommand\boldmath{…\boldmath…}`),
 * which would turn every formula using it into an error.
 */
function addMacro(macros: Record<string, string>, name: string, body: string): void {
	if (body.includes('@')) return;
	for (let at = body.indexOf(name); at >= 0; at = body.indexOf(name, at + 1)) {
		if (!isLetter(body.charCodeAt(at + name.length))) return;
	}
	macros[name] = body;
}

/**
 * Macros defined with `\newcommand`, `\renewcommand`, `\providecommand`,
 * `\def` and `\DeclareMathOperator`, in the form KaTeX's `macros` option
 * takes (`#1` stays a parameter). Definitions inside comments are ignored.
 */
export function extractMacros(text: string, scan: TexScan = scanTex(text)): Record<string, string> {
	const macros: Record<string, string> = {};
	for (const cmd of scan.commands) {
		const { name } = cmd;
		if (name === 'newcommand' || name === 'renewcommand' || name === 'providecommand' || name === 'DeclareRobustCommand') {
			let i = cmd.to;
			if (text[i] === '*') i++;
			while (text[i] === ' ') i++;
			let macro: string | null = null;
			if (text[i] === '{') {
				const close = matchBrace(text, i);
				if (close < 0) continue;
				macro = text.slice(i + 1, close).trim();
				i = close + 1;
			} else if (text[i] === '\\') {
				const m = /^\\[A-Za-z]+/.exec(text.slice(i));
				if (!m) continue;
				macro = m[0];
				i += m[0].length;
			}
			if (!macro || !/^\\[A-Za-z]+$/.test(macro)) continue;
			const rest = readArgs(text, i, 'oom');
			if (!rest) continue;
			const body = rest.args[2]!;
			// An optional first argument (`[2][default]`) has no KaTeX equivalent; the default is dropped.
			addMacro(macros, macro, text.slice(body.from, body.to));
		} else if (name === 'DeclareMathOperator') {
			const args = readArgs(text, cmd.to, 'smm');
			if (!args) continue;
			const macro = text.slice(args.args[0]!.from, args.args[0]!.to).trim();
			if (!/^\\[A-Za-z]+$/.test(macro)) continue;
			macros[macro] = `\\operatorname${args.star ? '*' : ''}{${text.slice(args.args[1]!.from, args.args[1]!.to)}}`;
		} else if (name === 'def') {
			const m = /^\\([A-Za-z]+)((?:#\d)*)\{/.exec(text.slice(cmd.to, cmd.to + 80));
			if (!m) continue;
			const open = cmd.to + m[0].length - 1;
			const close = matchBrace(text, open);
			if (close < 0) continue;
			addMacro(macros, `\\${m[1]}`, text.slice(open + 1, close));
		}
	}
	return macros;
}

// ── Root file detection ─────────────────────────────────────────────────────

/** `% !TEX root = ../main.tex` in the first lines, as LaTeX Workshop and TeXShop read it. */
export function magicRoot(text: string): string | null {
	const head = text.split('\n', 20);
	for (const line of head) {
		const m = /^\s*%\s*!\s*TEX\s+root\s*=\s*(.+?)\s*$/i.exec(line);
		if (m) return m[1];
	}
	return null;
}

/** The files a root pulls in with `\input`, `\include`, `\subfile` (as written, without `.tex`). */
export function inputsOf(text: string, scan: TexScan = scanTex(text)): string[] {
	const out: string[] = [];
	for (const cmd of scan.commands) {
		if (cmd.name !== 'input' && cmd.name !== 'include' && cmd.name !== 'subfile' && cmd.name !== 'includeonly') continue;
		const args = readArgs(text, cmd.to, 'm');
		if (!args) continue;
		const arg = args.args[0]!;
		for (const part of text.slice(arg.from, arg.to).split(',')) {
			const name = part.trim().replace(/\.tex$/, '');
			if (name) out.push(name);
		}
	}
	return out;
}

/** `\bibliography{a,b}` and `\addbibresource{x.bib}`: the bibliography files named, each with `.bib`. */
export function bibFilesOf(text: string, scan: TexScan = scanTex(text)): string[] {
	const out: string[] = [];
	for (const cmd of scan.commands) {
		if (cmd.name !== 'bibliography' && cmd.name !== 'addbibresource') continue;
		const args = readArgs(text, cmd.to, 'om');
		if (!args) continue;
		const arg = args.args[1]!;
		for (const part of text.slice(arg.from, arg.to).split(',')) {
			const name = part.trim();
			if (name) out.push(name.endsWith('.bib') ? name : `${name}.bib`);
		}
	}
	return out;
}

/** `\graphicspath{{figures/}{img/}}`: the folders, as written. */
export function graphicsPathOf(text: string, scan: TexScan = scanTex(text)): string[] {
	for (const cmd of scan.commands) {
		if (cmd.name !== 'graphicspath') continue;
		const args = readArgs(text, cmd.to, 'm');
		if (!args) continue;
		const arg = args.args[0]!;
		return [...text.slice(arg.from, arg.to).matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
	}
	return [];
}
