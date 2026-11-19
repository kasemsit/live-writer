import { isLetter, lineEnd, readArgs } from './plusTexScanner';

/**
 * md-live-preview-plus: LaTeX's text markup as the characters it prints —
 * symbols written as commands, accents, the ligatures of plain text — and a
 * fragment of LaTeX reduced to its text.
 */

const BACKSLASH = 92;

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
