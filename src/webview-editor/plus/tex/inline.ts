import type { PlusTexContext } from '../../../shared/messages';
import { describeBib } from '../../../shared/plusBib';
import { citeLabel } from '../../../shared/plusCitations';
import { isLetter, lineEnd, matchBrace, readArgs } from '../../../shared/plusTexScanner';
import { CONTROL_SYMBOLS, TEXT_SYMBOLS, readAccent, textLigature, texToPlain } from '../../../shared/plusTexText';
import { renderMathInto } from '../math';
import { resolveTexAsset } from './context';

/**
 * md-live-preview-plus: a LaTeX fragment drawn as DOM — for the cells of a
 * rendered `tabular`, which are one widget and so cannot use the editor's
 * own decorations. Covers what table cells hold in practice: text styles,
 * math, references and citations, symbols; anything else shows its text.
 */

export interface InlineEnv {
	ctx: PlusTexContext;
	macros: Record<string, string>;
}

/** Command → class of the element its argument is drawn in. */
export const STYLE_CLASS: Record<string, string> = {
	textbf: 'mlp-strong',
	textit: 'mlp-em',
	emph: 'mlp-em',
	textsl: 'mlp-em',
	texttt: 'mlp-tex-tt',
	underline: 'mlp-underline',
	uline: 'mlp-underline',
	textsc: 'mlp-tex-sc',
	textsf: 'mlp-tex-sf',
	textsuperscript: 'mlp-tex-sup',
	textsubscript: 'mlp-tex-sub',
	uppercase: 'mlp-tex-upper',
	MakeUppercase: 'mlp-tex-upper',
	MakeTextUppercase: 'mlp-tex-upper',
	MakeLowercase: 'mlp-tex-lower',
	sout: 'mlp-strikethrough',
	st: 'mlp-strikethrough',
	xout: 'mlp-strikethrough',
	hl: 'mlp-tex-hl',
	textrm: '',
	textnormal: '',
	textup: '',
	textmd: '',
	mbox: '',
	makebox: '',
	text: '',
	hbox: '',
	makecell: '',
	shortstack: '',
	thead: 'mlp-strong',
};

/** Declarations that style the rest of their group (`{\bfseries x}`). */
const DECLARATIONS: Record<string, string> = {
	bfseries: 'mlp-strong',
	bf: 'mlp-strong',
	itshape: 'mlp-em',
	it: 'mlp-em',
	em: 'mlp-em',
	slshape: 'mlp-em',
	ttfamily: 'mlp-tex-tt',
	tt: 'mlp-tex-tt',
	scshape: 'mlp-tex-sc',
	sffamily: 'mlp-tex-sf',
	rmfamily: '',
	mdseries: '',
	upshape: '',
	normalfont: '',
	tiny: '',
	scriptsize: '',
	footnotesize: '',
	small: '',
	normalsize: '',
	large: '',
	Large: '',
	LARGE: '',
	huge: '',
	Huge: '',
	centering: '',
	raggedright: '',
	raggedleft: '',
	arraybackslash: '',
	color: '',
};

export const REF_COMMANDS = /^(ref|eqref|autoref|cref|Cref|pageref|nameref|vref|Vref|subref|labelcref)$/;
export const CITE_COMMANDS = /^(cite|citep|citet|citealp|citealt|citeauthor|citeyear|citeyearpar|citenum|parencite|textcite|autocite|footcite|supercite|smartcite|Cite|Citep|Citet|Textcite|Parencite|Autocite)$/;
const TEXTUAL_CITES = /^(citet|Citet|textcite|Textcite)$/;

/** The text a `\ref`-family command shows: the number from the last build, with the prefix the command adds. */
export function refText(command: string, keys: string[], labels: Record<string, string>): { text: string; missing: boolean } {
	const nums = keys.map((k) => labels[k]);
	const missing = nums.some((n) => n === undefined);
	const shown = nums.map((n) => n ?? '??').join(', ');
	if (command === 'eqref') return { text: `(${shown})`, missing };
	if (command === 'pageref') return { text: missing ? 'p. ??' : `p. ${shown}`, missing };
	if (/^(autoref|cref|Cref|vref|Vref)$/.test(command)) {
		const prefix = refPrefix(keys[0] ?? '', command === 'Cref' || command === 'Vref');
		return { text: prefix ? `${prefix} ${shown}` : shown, missing };
	}
	return { text: shown, missing };
}

const PREFIXES: [RegExp, string][] = [
	[/^fig/i, 'Fig.'],
	[/^(tab|tbl)/i, 'Table'],
	[/^(sec|ssec|subsec|chap)/i, 'Section'],
	[/^(eq|eqn)/i, 'Eq.'],
	[/^app/i, 'Appendix'],
	[/^alg/i, 'Algorithm'],
	[/^thm/i, 'Theorem'],
	[/^lem/i, 'Lemma'],
	[/^def/i, 'Definition'],
	[/^cor/i, 'Corollary'],
	[/^prop/i, 'Proposition'],
	[/^lst/i, 'Listing'],
];

function refPrefix(key: string, capital: boolean): string {
	const kind = key.split(/[:.]/)[0];
	for (const [re, name] of PREFIXES) if (re.test(kind)) return capital ? name.replace(/^./, (c) => c.toUpperCase()) : name;
	return '';
}

export function splitKeys(text: string): string[] {
	return text
		.split(',')
		.map((k) => k.trim())
		.filter(Boolean);
}

/** The label a `\cite`-family command shows, and its hover text. */
export function citeText(command: string, keys: string[], post: string | null, ctx: PlusTexContext): { text: string; title: string; missing: boolean } {
	const title = keys.map((k) => describeBib(ctx.bib[k], k)).join('\n');
	const missing = keys.some((k) => !(k in ctx.cites) && !(k in ctx.bib));
	if (command === 'nocite') return { text: `nocite: ${keys.join(', ')}`, title, missing: false };
	if (command === 'citeauthor') {
		return { text: keys.map((k) => ctx.bib[k]?.authorShort || k).join(', '), title, missing };
	}
	if (command === 'citeyear' || command === 'citeyearpar') {
		const years = keys.map((k) => ctx.bib[k]?.year || '?').join(', ');
		return { text: command === 'citeyearpar' ? `(${years})` : years, title, missing };
	}
	let text = citeLabel(keys, ctx.cites, ctx.bib, TEXTUAL_CITES.test(command));
	const note = post ? texToPlain(post) : '';
	if (note) text = text.endsWith(']') ? `${text.slice(0, -1)}, ${note}]` : `${text}, ${note}`;
	return { text, title, missing };
}

/** A CSS color for an xcolor name or model value, or null. */
export function cssColor(model: string | null, value: string): string | null {
	const v = value.trim();
	if (model === 'HTML' && /^[0-9A-Fa-f]{6}$/.test(v)) return `#${v}`;
	if (model === 'rgb') {
		const parts = v.split(',').map(Number);
		if (parts.length === 3 && parts.every((x) => x >= 0 && x <= 1)) return `rgb(${parts.map((x) => Math.round(x * 255)).join(',')})`;
	}
	if (model === 'RGB') {
		const parts = v.split(',').map(Number);
		if (parts.length === 3 && parts.every((x) => x >= 0 && x <= 255)) return `rgb(${parts.join(',')})`;
	}
	if (model) return null;
	const name = v.split('!')[0];
	if (!/^[A-Za-z]+$/.test(name)) return null;
	const map: Record<string, string> = { green: '#16a34a', darkgreen: '#166534', lime: '#65a30d', olive: '#808000', teal: '#0d9488', violet: '#7c3aed' };
	return map[name] ?? name.toLowerCase();
}

/**
 * Draws `src` (LaTeX) into `parent`. Offsets are into `src`; nothing here
 * edits the document.
 */
export function renderTexInline(parent: HTMLElement, src: string, env: InlineEnv): void {
	emit(parent, src, 0, src.length, env);
}

function emit(parent: HTMLElement, src: string, from: number, to: number, env: InlineEnv): void {
	let textBuf = '';
	const flush = () => {
		if (textBuf) parent.appendChild(document.createTextNode(textBuf));
		textBuf = '';
	};
	const append = (node: Node) => {
		flush();
		parent.appendChild(node);
	};
	const span = (cls: string, text?: string): HTMLElement => {
		const el = document.createElement('span');
		if (cls) el.className = cls;
		if (text !== undefined) el.textContent = text;
		return el;
	};
	for (let i = from; i < to; i++) {
		const ch = src[i];
		if (ch === '%') {
			i = Math.min(to, lineEnd(src, i));
			continue;
		}
		if (ch === '$') {
			const display = src[i + 1] === '$';
			const open = display ? 2 : 1;
			const close = src.indexOf(display ? '$$' : '$', i + open);
			if (close > 0 && close < to) {
				const el = span('mlp-math');
				renderMathInto(el, src.slice(i + open, close), false, undefined, env.macros);
				append(el);
				i = close + open - 1;
				continue;
			}
		}
		if (ch === '{') {
			const close = matchBrace(src, i);
			const end = close < 0 || close >= to ? to : close;
			flush();
			emit(parent, src, i + 1, end, env);
			i = end;
			continue;
		}
		if (ch === '}') continue;
		if (ch !== '\\') {
			const lig = textLigature(src, i);
			if (lig) {
				textBuf += lig.text;
				i += lig.length - 1;
			} else {
				textBuf += ch === '\n' ? ' ' : ch;
			}
			continue;
		}
		// A command.
		const accent = readAccent(src, i);
		if (accent) {
			textBuf += accent.text;
			i = accent.to - 1;
			continue;
		}
		const next = src[i + 1] ?? '';
		if (next === '\\') {
			append(document.createElement('br'));
			i++;
			// `\\[2pt]`
			if (src[i + 1] === '[') {
				const close = src.indexOf(']', i + 1);
				if (close > 0 && close < to) i = close;
			}
			continue;
		}
		if (next === '(') {
			const close = src.indexOf('\\)', i + 2);
			if (close > 0 && close < to) {
				const el = span('mlp-math');
				renderMathInto(el, src.slice(i + 2, close), false, undefined, env.macros);
				append(el);
				i = close + 1;
				continue;
			}
		}
		if (next && !isLetter(next.charCodeAt(0))) {
			textBuf += CONTROL_SYMBOLS[next] ?? next;
			i++;
			continue;
		}
		let j = i + 1;
		while (j < to && isLetter(src.charCodeAt(j))) j++;
		const name = src.slice(i + 1, j);
		if (name in TEXT_SYMBOLS) {
			textBuf += TEXT_SYMBOLS[name];
			if (src.startsWith('{}', j)) j += 2;
			i = j - 1;
			continue;
		}
		if (name in STYLE_CLASS) {
			const args = readArgs(src, j, name === 'makecell' || name === 'thead' ? 'om' : name === 'makebox' ? 'oom' : 'm');
			const arg = args?.args[args.args.length - 1];
			if (args && arg && arg.to <= to) {
				const el = span(STYLE_CLASS[name]);
				emit(el, src, arg.from, arg.to, env);
				append(el);
				i = args.end - 1;
				continue;
			}
		}
		if (name in DECLARATIONS) {
			// Styles the rest of the enclosing group.
			let k = j;
			if (name === 'color') {
				const args = readArgs(src, j, 'om');
				if (args) k = args.end;
			}
			const cls = DECLARATIONS[name];
			if (cls) {
				const el = span(cls);
				emit(el, src, k, to, env);
				append(el);
				flush();
				return;
			}
			i = k - 1;
			continue;
		}
		if (name === 'textcolor' || name === 'colorbox') {
			const args = readArgs(src, j, 'omm');
			if (args && args.args[2]!.to <= to) {
				const model = args.args[0] ? src.slice(args.args[0].from, args.args[0].to) : null;
				const color = cssColor(model, src.slice(args.args[1]!.from, args.args[1]!.to));
				const el = span(name === 'colorbox' ? 'mlp-tex-colorbox' : '');
				if (color) el.style.setProperty(name === 'colorbox' ? 'background-color' : 'color', color);
				emit(el, src, args.args[2]!.from, args.args[2]!.to, env);
				append(el);
				i = args.end - 1;
				continue;
			}
		}
		if (REF_COMMANDS.test(name)) {
			const args = readArgs(src, j, 'sm');
			if (args) {
				const keys = splitKeys(src.slice(args.args[0]!.from, args.args[0]!.to));
				const shown = refText(name, keys, env.ctx.labels);
				const el = span(`mlp-tex-chip mlp-tex-ref${shown.missing ? ' mlp-tex-chip-missing' : ''}`, shown.text);
				el.title = keys.join(', ');
				append(el);
				i = args.end - 1;
				continue;
			}
		}
		if (CITE_COMMANDS.test(name)) {
			const args = readArgs(src, j, 'soom');
			if (args) {
				const keys = splitKeys(src.slice(args.args[2]!.from, args.args[2]!.to));
				const opt = args.args[1] ?? args.args[0];
				const shown = citeText(name, keys, opt ? src.slice(opt.from, opt.to) : null, env.ctx);
				const el = span(`mlp-tex-chip mlp-tex-cite${shown.missing ? ' mlp-tex-chip-missing' : ''}`, shown.text);
				el.title = shown.title;
				append(el);
				i = args.end - 1;
				continue;
			}
		}
		if (name === 'label' || name === 'vspace' || name === 'hspace' || name === 'rule' || name === 'phantom') {
			const args = readArgs(src, j, name === 'rule' ? 'omm' : 'sm');
			if (args) {
				i = args.end - 1;
				continue;
			}
		}
		if (name === 'footnote' || name === 'tablefootnote') {
			const args = readArgs(src, j, 'om');
			if (args) {
				const el = span('mlp-tex-sup', '*');
				el.title = src.slice(args.args[1]!.from, args.args[1]!.to);
				append(el);
				i = args.end - 1;
				continue;
			}
		}
		if (name === 'includegraphics') {
			const args = readArgs(src, j, 'som');
			if (args) {
				const path = src.slice(args.args[1]!.from, args.args[1]!.to).trim();
				const opts = args.args[0] ? src.slice(args.args[0].from, args.args[0].to) : '';
				append(graphicElement(path, opts));
				i = args.end - 1;
				continue;
			}
		}
		if (name === 'url' || name === 'href') {
			const args = readArgs(src, j, name === 'href' ? 'mm' : 'm');
			if (args) {
				const arg = args.args[args.args.length - 1]!;
				const el = span('mlp-tex-url', src.slice(arg.from, arg.to));
				append(el);
				i = args.end - 1;
				continue;
			}
		}
		// Unknown: drop the name; its arguments, if any, follow as groups and are drawn as text.
		i = j - 1;
	}
	flush();
}

/** Width the inline renderer sizes `\linewidth`-relative figures against (a table cell has no line of its own). */
const NOMINAL_LINE_WIDTH = 700;

/** An `\includegraphics` inside a widget (a table cell): the image once the host has found it. */
function graphicElement(path: string, options: string): HTMLElement {
	const wrap = document.createElement('span');
	wrap.className = 'mlp-tex-graphic mlp-tex-graphic-loading';
	wrap.title = path;
	const size = graphicSize(options, NOMINAL_LINE_WIDTH);
	void resolveTexAsset(path).then((asset) => {
		wrap.classList.remove('mlp-tex-graphic-loading');
		if (asset.status !== 'image' || !asset.src) {
			wrap.classList.add('mlp-tex-graphic-missing');
			wrap.textContent = asset.status === 'unsupported' ? `${asset.name} (cannot be shown)` : `${path} (not found)`;
			return;
		}
		const img = document.createElement('img');
		img.src = asset.src;
		img.alt = path;
		if (size.width) img.style.width = `${Math.round(size.width)}px`;
		if (size.height) img.style.height = `${Math.round(size.height)}px`;
		wrap.appendChild(img);
	});
	return wrap;
}

/** Size of an `\includegraphics` from its options (`width=0.5\linewidth`, `height=4cm`, `scale=0.5`). */
export function graphicSize(options: string, lineWidth: number): { width?: number; height?: number; scale?: number } {
	const out: { width?: number; height?: number; scale?: number } = {};
	const UNITS: Record<string, number> = { cm: 37.8, mm: 3.78, in: 96, pt: 1.333, bp: 1.333, em: 16, ex: 8, px: 1 };
	for (const part of options.split(',')) {
		const m = /^\s*(width|height|scale|totalheight)\s*=\s*([\d.]*)\s*(\\(?:linewidth|columnwidth|textwidth|hsize|textheight)|[a-z]{2})?\s*$/.exec(part);
		if (!m) continue;
		const value = m[2] === '' ? 1 : Number(m[2]);
		if (!Number.isFinite(value)) continue;
		if (m[1] === 'scale') {
			out.scale = value;
			continue;
		}
		const unit = m[3] ?? 'px';
		const px = unit.startsWith('\\') ? (unit === '\\textheight' ? value * lineWidth * 1.3 : value * lineWidth) : value * (UNITS[unit] ?? 1);
		if (m[1] === 'width') out.width = px;
		else out.height = px;
	}
	return out;
}
