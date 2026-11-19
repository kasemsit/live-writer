import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate, type WidgetType } from '@codemirror/view';
import type { EditorState, Range } from '@codemirror/state';
import type { PlusTexContext } from '../../../shared/messages';
import { SECTION_LEVELS } from '../../../shared/plusTexHeadings';
import { type TexCommand, type TexEnv, type TexScan, envAt, isLetter, rangeAt, readArgs } from '../../../shared/plusTexScanner';
import { ACCENTS, CONTROL_SYMBOLS, TEXT_SYMBOLS, readAccent } from '../../../shared/plusTexText';
import { cursorTouchesRange, inlineCursorTouchesRange } from '../../cmUtils';
import { replacedTexBlocks, texBlockCandidates, displayTex, type TexBlock } from './blocks';
import { fileLabels, setTexContext, texContextField, texScanField } from './context';
import { citeText, cssColor, refText, splitKeys } from './inline';
import { texMacros } from './macros';
import { LINK_CONTEXT } from '../wikilinks';
import {
	BEGIN_SPECS,
	CITE_COMMANDS,
	CODE_ENVS,
	COLLAPSED,
	FLOAT_ENVS,
	FOOTNOTES,
	HEADING_CLASS,
	ITALIC_THEOREMS,
	LABELLED,
	LAYOUT,
	LIST_ENVS,
	META,
	NOTES,
	REF_COMMANDS,
	STYLE_CLASS,
	TABLE_ENVS,
	THEOREMS,
} from './vocabulary';
import { TexChipWidget, TexImageWidget, TexMathWidget, TexTextWidget } from './widgets';

/**
 * md-live-preview-plus: the LaTeX Live Preview's inline drawing — what
 * Overleaf's Visual Editor shows, in this editor's manner: markup is hidden
 * and its effect drawn until the caret enters it, then the source is back.
 *
 * Headings, text styles, math, citations, references, labels, footnotes,
 * lists, captions, figures and links are drawn; layout commands are dimmed
 * rather than hidden, because they change the output; anything unknown is
 * left as coloured source. The preamble is never drawn, only coloured.
 */

// ── Per-scan facts, computed once ───────────────────────────────────────────

interface ListFacts {
	/** `\item` offset → its marker text. */
	markers: Map<number, string>;
	/** List environment index → list depth (1 for an outermost list). */
	depth: Map<number, number>;
}

const listCache = new WeakMap<TexScan, ListFacts>();

const BULLETS = ['•', '–', '∗', '·'];

function roman(n: number): string {
	const table: [number, string][] = [
		[10, 'x'],
		[9, 'ix'],
		[5, 'v'],
		[4, 'iv'],
		[1, 'i'],
	];
	let out = '';
	for (const [v, s] of table) while (n >= v) {
		out += s;
		n -= v;
	}
	return out;
}

function enumMarker(n: number, depth: number): string {
	switch ((depth - 1) % 4) {
		case 0:
			return `${n}.`;
		case 1:
			return `(${String.fromCharCode(96 + Math.min(26, n))})`;
		case 2:
			return `${roman(n)}.`;
		default:
			return `${String.fromCharCode(64 + Math.min(26, n))}.`;
	}
}

function listFacts(scan: TexScan): ListFacts {
	let facts = listCache.get(scan);
	if (facts) return facts;
	facts = { markers: new Map(), depth: new Map() };
	scan.envs.forEach((env, index) => {
		if (!LIST_ENVS.has(env.name)) return;
		let depth = 1;
		for (let p = env.parent; p >= 0; p = scan.envs[p].parent) if (LIST_ENVS.has(scan.envs[p].name)) depth++;
		facts!.depth.set(index, depth);
	});
	const counters = new Map<number, number>();
	for (const cmd of scan.commands) {
		if (cmd.name !== 'item') continue;
		const env = envAt(scan, cmd.from, (e) => LIST_ENVS.has(e.name));
		if (!env) continue;
		const index = scan.envs.indexOf(env);
		const depth = facts.depth.get(index) ?? 1;
		const n = (counters.get(index) ?? 0) + 1;
		counters.set(index, n);
		const name = env.name.replace(/^(IEEE|compact|aspara|inpara)/, '');
		facts.markers.set(cmd.from, /enum/.test(name) ? enumMarker(n, depth) : name === 'description' ? '' : BULLETS[(depth - 1) % BULLETS.length]);
	}
	listCache.set(scan, facts);
	return facts;
}

const footnoteCache = new WeakMap<TexScan, Map<number, number>>();

function footnoteNumbers(scan: TexScan): Map<number, number> {
	let numbers = footnoteCache.get(scan);
	if (!numbers) {
		numbers = new Map();
		let n = 0;
		for (const cmd of scan.commands) if (cmd.name in FOOTNOTES && cmd.name !== 'footnotetext') numbers.set(cmd.from, ++n);
		footnoteCache.set(scan, numbers);
	}
	return numbers;
}

// ── Building ────────────────────────────────────────────────────────────────

class Builder {
	readonly out: Range<Decoration>[] = [];
	private readonly lineClasses = new Map<number, Set<string>>();
	/** Ranges whose text is not prose (keys, paths, URLs, lengths): no typography there. */
	readonly raw: [number, number][] = [];
	readonly replaced: [number, number][] = [];

	constructor(
		readonly state: EditorState,
		readonly text: string,
		readonly scan: TexScan,
		readonly ctx: PlusTexContext,
		readonly blocks: TexBlock[],
		readonly macros: Record<string, string>,
	) {}

	inBlock(pos: number): boolean {
		return this.blocks.some((b) => b.from <= pos && pos <= b.to);
	}

	/** Inside markup already hidden (an environment's arguments, `\href`'s URL): nothing more is drawn there. */
	inReplaced(pos: number): boolean {
		for (let i = this.replaced.length - 1; i >= 0; i--) {
			const [from, to] = this.replaced[i];
			if (from <= pos && pos < to) return true;
		}
		return false;
	}

	sameLine(from: number, to: number): boolean {
		const nl = this.text.indexOf('\n', from);
		return nl < 0 || nl >= to;
	}

	/** Hides `[from, to)`, drawing `widget` there if given. False (and nothing done) when it spans lines. */
	replace(from: number, to: number, widget?: WidgetType): boolean {
		if (from > to || (from === to && !widget) || !this.sameLine(from, to) || this.inBlock(from)) return false;
		this.out.push((widget ? Decoration.replace({ widget }) : Decoration.replace({})).range(from, to));
		if (to > from) this.replaced.push([from, to]);
		return true;
	}

	/** Hides an opening and a closing piece of markup together, or neither. */
	hide(openFrom: number, openTo: number, closeFrom: number, closeTo: number, openWidget?: WidgetType): boolean {
		if (!this.sameLine(openFrom, openTo) || !this.sameLine(closeFrom, closeTo) || this.inBlock(openFrom)) return false;
		this.replace(openFrom, openTo, openWidget);
		this.replace(closeFrom, closeTo);
		return true;
	}

	mark(from: number, to: number, cls: string, attributes?: Record<string, string>): void {
		if (from >= to || !cls) return;
		this.out.push(Decoration.mark(attributes ? { class: cls, attributes } : { class: cls }).range(from, to));
	}

	line(pos: number, cls: string): void {
		const from = this.state.doc.lineAt(pos).from;
		let set = this.lineClasses.get(from);
		if (!set) this.lineClasses.set(from, (set = new Set()));
		for (const c of cls.split(' ')) set.add(c);
	}

	/** Adds `cls` to every line from the one holding `from` to the one holding `to`, within [lo, hi]. */
	lines(from: number, to: number, cls: string, lo: number, hi: number): void {
		const { doc } = this.state;
		const first = doc.lineAt(Math.max(from, lo)).number;
		const last = doc.lineAt(Math.min(to, hi, doc.length)).number;
		for (let n = first; n <= last; n++) this.line(doc.line(n).from, cls);
	}

	cmd(c: TexCommand): void {
		this.mark(c.from, c.to, 'mlp-tex-cmd');
	}

	rawArg(from: number, to: number): void {
		if (to > from) this.raw.push([from, to]);
	}

	touched(from: number, to: number): boolean {
		return inlineCursorTouchesRange(this.state, from, to);
	}

	lineTouched(from: number, to: number): boolean {
		return cursorTouchesRange(this.state, from, to);
	}

	finish(): DecorationSet {
		for (const [from, set] of this.lineClasses) this.out.push(Decoration.line({ class: [...set].join(' ') }).range(from));
		return Decoration.set(this.out, true);
	}
}

/** Consumes consecutive `[…]` / `{…}` groups on the same line after `pos` (an environment's arguments). */
function readAnyArgs(text: string, pos: number): number {
	let end = pos;
	for (;;) {
		const args = readArgs(text, end, text[end] === '{' ? 'm' : 'o');
		if (!args || args.end === end) return end;
		if (text.slice(end, args.end).includes('\n')) return end;
		end = args.end;
	}
}

// ── Environments ────────────────────────────────────────────────────────────

function envLines(b: Builder, env: TexEnv, index: number, lo: number, hi: number): void {
	const { text, state } = b;
	const doc = state.doc;
	const name = env.name;
	const spec = BEGIN_SPECS[name];
	const beginEnd = spec ? (readArgs(text, env.nameTo, spec)?.end ?? env.nameTo) : readAnyArgs(text, env.nameTo);
	const beginLine = doc.lineAt(env.from);
	const endLine = env.closed ? doc.lineAt(env.endFrom) : null;
	const inner = (cls: string) => {
		const from = beginLine.to + 1;
		const to = endLine ? endLine.from - 1 : doc.length;
		if (from <= to && from <= hi && to >= lo) b.lines(from, to, cls, lo, hi);
	};
	const alone = (lineFrom: number, start: number, stop: number, lineTo: number) =>
		/^[ \t]*$/.test(text.slice(lineFrom, start)) && /^[ \t]*(%.*)?$/.test(text.slice(stop, lineTo));
	const beginAlone = alone(beginLine.from, env.from, beginEnd, beginLine.to);
	const beginShown = beginAlone && !b.lineTouched(beginLine.from, beginLine.to);
	const endAlone = !!endLine && alone(endLine.from, env.endFrom, env.to, endLine.to);
	const endShown = endAlone && !!endLine && !b.lineTouched(endLine.from, endLine.to);
	// `\begin{name}` / `\end{name}` as source, coloured, when not drawn.
	if (!beginShown) b.mark(env.from, env.nameTo, 'mlp-tex-env-src');
	if (endLine && !endShown) b.mark(env.endFrom, env.to, 'mlp-tex-env-src');

	const collapseBegin = (widget?: WidgetType) => {
		if (beginShown && b.replace(beginLine.from, beginEnd, widget)) {
			if (!widget) b.line(beginLine.from, 'mlp-tex-collapsed');
		}
	};
	const collapseEnd = (widget?: WidgetType) => {
		if (endShown && endLine && b.replace(endLine.from, env.to, widget)) {
			if (!widget) b.line(endLine.from, 'mlp-tex-collapsed');
		}
	};

	if (LIST_ENVS.has(name)) {
		const depth = Math.min(4, listFacts(b.scan).depth.get(index) ?? 1);
		collapseBegin();
		collapseEnd();
		inner(`mlp-tex-list mlp-tex-list-${depth}`);
		return;
	}
	if (name in FLOAT_ENVS) {
		const label = FLOAT_ENVS[name] + (name.endsWith('*') ? ' (full width)' : '');
		collapseBegin(new TexTextWidget(label, 'mlp-tex-env-label'));
		collapseEnd();
		if (beginLine.from >= lo && beginLine.from <= hi) b.line(beginLine.from, 'mlp-tex-float mlp-tex-float-first');
		if (endLine && endLine.from >= lo && endLine.from <= hi) b.line(endLine.from, 'mlp-tex-float mlp-tex-float-last');
		inner('mlp-tex-float');
		return;
	}
	if (name in LABELLED) {
		collapseBegin(new TexTextWidget(LABELLED[name], 'mlp-tex-env-label mlp-tex-env-heading'));
		collapseEnd();
		inner('mlp-tex-abstract');
		return;
	}
	if (name in THEOREMS) {
		const opt = readArgs(text, env.nameTo, 'o')?.args[0];
		const title = THEOREMS[name] + (opt ? ` (${text.slice(opt.from, opt.to)})` : '') + '.';
		collapseBegin(new TexTextWidget(title, name === 'proof' ? 'mlp-tex-theorem-label mlp-em' : 'mlp-tex-theorem-label'));
		collapseEnd(name === 'proof' ? new TexTextWidget('∎', 'mlp-tex-qed') : undefined);
		inner(ITALIC_THEOREMS.has(name) ? 'mlp-tex-theorem mlp-tex-theorem-italic' : 'mlp-tex-theorem');
		return;
	}
	if (CODE_ENVS.has(name)) {
		b.lines(env.from, endLine ? endLine.to : doc.length, 'mlp-tex-code', lo, hi);
		return;
	}
	if (COLLAPSED.has(name)) {
		collapseBegin();
		collapseEnd();
		if (name === 'center') inner('mlp-tex-center');
		else if (name === 'flushright') inner('mlp-tex-right');
		else if (name === 'quote' || name === 'quotation' || name === 'verse') inner('mlp-tex-quote');
		return;
	}
}

// ── Commands ────────────────────────────────────────────────────────────────

/** A command whose last argument is drawn styled (`cls`) with its markup hidden. */
function styled(b: Builder, c: TexCommand, spec: string, cls: string, attributes?: Record<string, string>, openWidget?: WidgetType): void {
	const args = readArgs(b.text, c.to, spec);
	const arg = args?.args[args.args.length - 1];
	if (!args || !arg) return b.cmd(c);
	b.mark(arg.from, arg.to, cls, attributes);
	if (b.touched(c.from, args.end) || !b.hide(c.from, arg.from, arg.to, arg.to + 1, openWidget)) b.cmd(c);
}

function section(b: Builder, c: TexCommand): void {
	const args = readArgs(b.text, c.to, 'som');
	const title = args?.args[1];
	if (!args || !title) return b.cmd(c);
	const { doc } = b.state;
	const line = doc.lineAt(c.from);
	const level = SECTION_LEVELS[c.name] ?? 0;
	const lineCls = HEADING_CLASS[c.name];
	if (!lineCls || level >= 5 || !/^[ \t]*$/.test(b.text.slice(line.from, c.from))) {
		// \paragraph{…} and headings in running text: a bold run-in title.
		b.mark(title.from, title.to, 'mlp-strong');
		if (b.touched(c.from, args.end) || !b.hide(c.from, title.from, title.to, title.to + 1)) b.cmd(c);
		return;
	}
	for (let n = line.number; n <= doc.lineAt(Math.min(args.end, doc.length)).number; n++) b.line(doc.line(n).from, lineCls);
	if (b.lineTouched(c.from, args.end) || !b.hide(line.from, title.from, title.to, title.to + 1)) b.cmd(c);
}

function chipFor(b: Builder, c: TexCommand, end: number, widget: WidgetType): void {
	if (b.touched(c.from, end) || !b.replace(c.from, end, widget)) b.cmd(c);
}

function cite(b: Builder, c: TexCommand): void {
	const args = readArgs(b.text, c.to, 'soom');
	const keysArg = args?.args[2];
	if (!args || !keysArg) return b.cmd(c);
	b.rawArg(keysArg.from, keysArg.to);
	const keys = splitKeys(b.text.slice(keysArg.from, keysArg.to));
	const post = args.args[1] ?? args.args[0];
	const shown = citeText(c.name, keys, post ? b.text.slice(post.from, post.to) : null, b.ctx);
	if (b.touched(c.from, args.end)) {
		b.cmd(c);
		b.mark(keysArg.from, keysArg.to, 'mlp-tex-key');
		return;
	}
	chipFor(b, c, args.end, new TexChipWidget(shown.text, `mlp-tex-cite${shown.missing ? ' mlp-tex-chip-missing' : ''}${c.name === 'nocite' ? ' mlp-tex-chip-faint' : ''}`, shown.title, keysArg.from));
}

function ref(b: Builder, c: TexCommand): void {
	const args = readArgs(b.text, c.to, 'sm');
	const arg = args?.args[0];
	if (!args || !arg) return b.cmd(c);
	b.rawArg(arg.from, arg.to);
	if (b.touched(c.from, args.end)) {
		b.cmd(c);
		b.mark(arg.from, arg.to, 'mlp-tex-key');
		return;
	}
	const keys = splitKeys(b.text.slice(arg.from, arg.to));
	const shown = refText(c.name, keys, b.ctx.labels);
	const pending = shown.missing && keys.every((k) => k in b.ctx.labels || fileLabels(b.state).has(k));
	const title = `\\${c.name}{${keys.join(',')}}${shown.missing ? (pending ? ' — defined, not yet in the last build' : ' — undefined in the last build') : ''}`;
	chipFor(b, c, args.end, new TexChipWidget(pending ? shown.text.replace(/\?\?/g, '?') : shown.text, `mlp-tex-ref${shown.missing && !pending ? ' mlp-tex-chip-missing' : ''}`, title, arg.from));
}

function label(b: Builder, c: TexCommand): void {
	const args = readArgs(b.text, c.to, 'm');
	const arg = args?.args[0];
	if (!args || !arg) return b.cmd(c);
	b.rawArg(arg.from, arg.to);
	const key = b.text.slice(arg.from, arg.to).trim();
	if (b.touched(c.from, args.end)) {
		b.cmd(c);
		b.mark(arg.from, arg.to, 'mlp-tex-key');
		return;
	}
	const num = b.ctx.labels[key];
	chipFor(b, c, args.end, new TexChipWidget(key, 'mlp-tex-label', num ? `\\label{${key}} → ${num}` : `\\label{${key}}`, arg.from));
}

function fileChip(b: Builder, c: TexCommand, spec: string, describe: (path: string) => { text: string; href: string }): void {
	const args = readArgs(b.text, c.to, spec);
	const arg = args?.args[args.args.length - 1];
	if (!args || !arg) return b.cmd(c);
	b.rawArg(arg.from, arg.to);
	const path = b.text.slice(arg.from, arg.to).split(',')[0].trim();
	if (!path || b.touched(c.from, args.end)) return b.cmd(c);
	const { text, href } = describe(path);
	chipFor(b, c, args.end, new TexChipWidget(text, 'mlp-tex-file', `${href.replace(/^tex:\w+:/, '')} — click to open`, arg.from, href));
}

function graphic(b: Builder, c: TexCommand): void {
	const args = readArgs(b.text, c.to, 'som');
	const arg = args?.args[1];
	if (!args || !arg) return b.cmd(c);
	b.rawArg(c.to, args.end);
	const path = b.text.slice(arg.from, arg.to).trim();
	if (!path || b.touched(c.from, args.end)) return b.cmd(c);
	const opts = args.args[0] ? b.text.slice(args.args[0].from, args.args[0].to) : '';
	chipFor(b, c, args.end, new TexImageWidget(path, opts, c.from));
}

function footnote(b: Builder, c: TexCommand): void {
	const args = readArgs(b.text, c.to, FOOTNOTES[c.name]);
	const arg = args?.args[args.args.length - 1];
	if (!args || !arg) return b.cmd(c);
	b.mark(arg.from, arg.to, 'mlp-tex-footnote');
	const n = footnoteNumbers(b.scan).get(c.from);
	const marker = c.name === 'footnotetext' ? undefined : new TexTextWidget(n ? String(n) : '*', 'mlp-tex-sup mlp-tex-footnote-mark');
	if (b.touched(c.from, args.end) || !b.hide(c.from, arg.from, arg.to, arg.to + 1, marker)) b.cmd(c);
}

function caption(b: Builder, c: TexCommand): void {
	const args = readArgs(b.text, c.to, 'som');
	const arg = args?.args[1];
	if (!args || !arg) return b.cmd(c);
	b.mark(arg.from, arg.to, 'mlp-tex-caption');
	const float = envAt(b.scan, c.from, (e) => e.name in FLOAT_ENVS);
	const kind = float ? FLOAT_ENVS[float.name] : 'Figure';
	let num = '';
	if (float) {
		for (const cmd of b.scan.commands) {
			if (cmd.from < float.from) continue;
			if (cmd.from > float.to) break;
			if (cmd.name !== 'label') continue;
			const key = readArgs(b.text, cmd.to, 'm')?.args[0];
			if (key && b.ctx.labels[b.text.slice(key.from, key.to).trim()]) {
				num = b.ctx.labels[b.text.slice(key.from, key.to).trim()];
				break;
			}
		}
	}
	const prefix = `${kind === 'Figure' ? 'Fig.' : kind}${num ? ` ${num}` : ''}${args.star ? '' : '.'} `;
	if (b.touched(c.from, args.end) || !b.hide(c.from, arg.from, arg.to, arg.to + 1, new TexTextWidget(prefix, 'mlp-tex-caption-label'))) b.cmd(c);
}

function link(b: Builder, c: TexCommand): void {
	const two = c.name === 'href';
	const args = readArgs(b.text, c.to, two ? 'mm' : 'm');
	if (!args) return b.cmd(c);
	const urlArg = args.args[0]!;
	const textArg = args.args[args.args.length - 1]!;
	b.rawArg(urlArg.from, urlArg.to);
	const url = b.text.slice(urlArg.from, urlArg.to).trim();
	b.mark(textArg.from, textArg.to, 'mlp-link mlp-tex-url', { 'data-href': url, 'data-vscode-context': LINK_CONTEXT });
	if (b.touched(c.from, args.end) || !b.hide(c.from, textArg.from, textArg.to, textArg.to + 1)) b.cmd(c);
}

function colored(b: Builder, c: TexCommand): void {
	const args = readArgs(b.text, c.to, 'omm');
	if (!args) return b.cmd(c);
	const model = args.args[0] ? b.text.slice(args.args[0].from, args.args[0].to) : null;
	b.rawArg(c.to, args.args[2]!.from);
	const color = cssColor(model, b.text.slice(args.args[1]!.from, args.args[1]!.to));
	const prop = c.name === 'colorbox' ? 'background-color' : 'color';
	styled(b, c, 'omm', c.name === 'colorbox' ? 'mlp-tex-colorbox' : 'mlp-tex-colored', color ? { style: `${prop}: ${color}` } : undefined);
}

function item(b: Builder, c: TexCommand): void {
	const marker = listFacts(b.scan).markers.get(c.from);
	if (marker === undefined) return b.cmd(c);
	const args = readArgs(b.text, c.to, 'o');
	const end = args?.end ?? c.to;
	if (b.touched(c.from, end)) return b.cmd(c);
	const line = b.state.doc.lineAt(c.from);
	const start = /^[ \t]*$/.test(b.text.slice(line.from, c.from)) ? line.from : c.from;
	const opt = args?.args[0];
	const text = opt ? b.text.slice(opt.from, opt.to) : marker;
	const stop = b.text[end] === ' ' && b.sameLine(end, end + 1) ? end + 1 : end;
	if (!b.replace(start, stop, new TexTextWidget(text, opt ? 'mlp-tex-item mlp-tex-item-label' : 'mlp-tex-item'))) b.cmd(c);
}

function layout(b: Builder, c: TexCommand, spec: string): void {
	const args = spec ? readArgs(b.text, c.to, spec) : null;
	const end = args?.end ?? c.to;
	b.rawArg(c.to, end);
	b.mark(c.from, end, 'mlp-tex-layout');
}

function symbol(b: Builder, c: TexCommand): void {
	const { name } = c;
	if (name === '\\') {
		const args = readArgs(b.text, c.to, 'so');
		b.mark(c.from, args?.end ?? c.to, 'mlp-tex-linebreak');
		return;
	}
	const accent = readAccent(b.text, c.from);
	if (accent) {
		if (!b.touched(c.from, accent.to)) b.replace(c.from, accent.to, new TexTextWidget(accent.text));
		return;
	}
	const value = CONTROL_SYMBOLS[name];
	if (value === undefined) return b.cmd(c);
	if (b.touched(c.from, c.to)) return b.cmd(c);
	b.replace(c.from, c.to, value ? new TexTextWidget(value, value.trim() ? '' : 'mlp-tex-space') : undefined);
}

function command(b: Builder, c: TexCommand): void {
	const { name } = c;
	if (!isLetter(name.charCodeAt(0))) return symbol(b, c);
	if (name.length === 1 && name in ACCENTS && b.text[c.to] === '{') {
		const accent = readAccent(b.text, c.from);
		if (accent && !b.touched(c.from, accent.to)) {
			b.replace(c.from, accent.to, new TexTextWidget(accent.text));
			return;
		}
	}
	if (name in SECTION_LEVELS || name === 'title') return section(b, c);
	if (name in STYLE_CLASS) return styled(b, c, name === 'makecell' || name === 'thead' ? 'om' : name === 'makebox' ? 'oom' : 'm', STYLE_CLASS[name] || 'mlp-tex-plain');
	if (CITE_COMMANDS.test(name) || name === 'nocite') return cite(b, c);
	if (REF_COMMANDS.test(name)) return ref(b, c);
	if (name in FOOTNOTES) return footnote(b, c);
	if (name in TEXT_SYMBOLS) {
		const end = b.text.startsWith('{}', c.to) ? c.to + 2 : c.to;
		if (!b.touched(c.from, end)) b.replace(c.from, end, new TexTextWidget(TEXT_SYMBOLS[name], name === 'LaTeX' || name === 'TeX' ? 'mlp-tex-logo' : ''));
		else b.cmd(c);
		return;
	}
	switch (name) {
		case 'label':
			return label(b, c);
		case 'item':
			return item(b, c);
		case 'caption':
			return caption(b, c);
		case 'includegraphics':
			return graphic(b, c);
		case 'input':
		case 'include':
		case 'subfile':
		case 'import':
			return fileChip(b, c, name === 'import' ? 'mm' : 'm', (path) => {
				const file = /\.[A-Za-z]+$/.test(path) ? path : `${path}.tex`;
				return { text: file, href: `tex:input:${path}` };
			});
		case 'bibliography':
		case 'addbibresource':
			return fileChip(b, c, name === 'addbibresource' ? 'om' : 'm', (path) => {
				const file = path.endsWith('.bib') ? path : `${path}.bib`;
				return { text: `Bibliography: ${file}`, href: `tex:file:${file}` };
			});
		case 'url':
		case 'href':
			return link(b, c);
		case 'textcolor':
		case 'colorbox':
			return colored(b, c);
		case 'author':
			return styled(b, c, 'om', 'mlp-tex-author');
		case 'address': {
			const args = readArgs(b.text, c.to, 'om');
			const n = args?.args[0];
			return styled(b, c, 'om', 'mlp-tex-meta', undefined, n ? new TexTextWidget(b.text.slice(n.from, n.to), 'mlp-tex-sup') : undefined);
		}
		case 'authorrefmark':
		case 'IEEEauthorrefmark': {
			const args = readArgs(b.text, c.to, 'm');
			const arg = args?.args[0];
			if (!args || !arg) return b.cmd(c);
			return chipFor(b, c, args.end, new TexTextWidget(b.text.slice(arg.from, arg.to), 'mlp-tex-sup'));
		}
	}
	if (NOTES.has(name)) {
		const args = readArgs(b.text, c.to, 'om');
		if (args?.args[1]) return styled(b, c, 'om', 'mlp-tex-todo', undefined, new TexTextWidget(name === 'hl' ? '' : `${name.toUpperCase()}: `, 'mlp-tex-todo-label'));
	}
	if (name in META) return styled(b, c, META[name], 'mlp-tex-meta');
	if (name in LAYOUT) return layout(b, c, LAYOUT[name]);
	b.cmd(c);
}

// ── Typography: ~  --  ---  ``  ''  ` ──────────────────────────────────────

function sortedHas(ranges: [number, number][], pos: number): boolean {
	let lo = 0;
	let hi = ranges.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const [from, to] = ranges[mid];
		if (pos < from) hi = mid - 1;
		else if (pos >= to) lo = mid + 1;
		else return true;
	}
	return false;
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
	const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
	const out: [number, number][] = [];
	for (const r of sorted) {
		const last = out[out.length - 1];
		if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
		else out.push([r[0], r[1]]);
	}
	return out;
}

const LIGATURE = /---|--|``|`|''|~/g;
const LIGATURE_TEXT: Record<string, string> = { '---': '—', '--': '–', '``': '“', '`': '‘', "''": '”', '~': ' ' };

function typography(b: Builder, lo: number, hi: number): void {
	const { scan, text } = b;
	const from = Math.max(lo, scan.bodyFrom);
	const to = Math.min(hi, scan.bodyTo);
	if (from >= to) return;
	const raw = mergeRanges(b.raw);
	const replaced = mergeRanges(b.replaced);
	LIGATURE.lastIndex = 0;
	const slice = text.slice(from, to);
	let m: RegExpExecArray | null;
	while ((m = LIGATURE.exec(slice))) {
		const pos = from + m.index;
		const end = pos + m[0].length;
		if (rangeAt(scan.comments, pos) || rangeAt(scan.maths, pos) || rangeAt(scan.verbatims, pos) || rangeAt(scan.commands, pos)) continue;
		if (sortedHas(raw, pos) || sortedHas(replaced, pos) || b.inBlock(pos)) continue;
		if (b.touched(pos, end)) continue;
		b.replace(pos, end, new TexTextWidget(LIGATURE_TEXT[m[0]], m[0] === '~' ? 'mlp-tex-nbsp' : ''));
	}
}

// ── The plugin ──────────────────────────────────────────────────────────────

const WINDOW = 3000;

function build(view: EditorView): DecorationSet {
	const { state } = view;
	const scan = state.field(texScanField);
	const text = state.doc.toString();
	const ctx = state.field(texContextField);
	const blocks = replacedTexBlocks(state);
	const b = new Builder(state, text, scan, ctx, blocks, texMacros(state));
	const lo = Math.max(0, view.viewport.from - WINDOW);
	const hi = Math.min(text.length, view.viewport.to + WINDOW);

	// The preamble (when it is not folded away): coloured source only.
	if (scan.hasPreamble && lo < scan.bodyFrom) b.lines(0, Math.min(scan.bodyFrom, hi), 'mlp-tex-preamble', lo, hi);

	scan.envs.forEach((env, index) => {
		if (env.to < lo || env.from > hi || (env.from < scan.bodyFrom && env.name !== 'document')) return;
		envLines(b, env, index, lo, hi);
	});

	const candidates = texBlockCandidates(state);
	// Shown as plain source: a table being edited (as a Markdown table is), and drawing code (TikZ, pgfplots…).
	const raw: { from: number; to: number }[] = candidates.filter((c) => c.kind === 'table' && !blocks.includes(c));
	for (const env of scan.envs) {
		if (CODE_ENVS.has(env.name) && !TABLE_ENVS.has(env.name) && env.to >= lo && env.from <= hi) raw.push(env);
		else if (TABLE_ENVS.has(env.name) && env.to >= lo && env.from <= hi && !candidates.some((c) => c.env === env)) raw.push(env);
	}
	const inEditedTable = (pos: number) => raw.some((c) => c.from <= pos && pos <= c.to);
	for (const m of scan.maths) {
		if (m.to < lo || m.from > hi || b.inBlock(m.from) || b.inReplaced(m.from)) continue;
		const inBody = m.from >= scan.bodyFrom && m.to <= scan.bodyTo;
		const asBlock = candidates.some((c) => c.math === m);
		if (!inBody || asBlock || inEditedTable(m.from) || b.touched(m.from, m.to) || !b.sameLine(m.from, m.to)) {
			b.mark(m.from, m.to, 'mlp-tex-math-src');
			continue;
		}
		const tex = m.env ? displayTex(text, m).tex : text.slice(m.innerFrom, m.innerTo);
		b.replace(m.from, m.to, new TexMathWidget(tex, m.display, m.innerFrom, b.macros));
	}

	for (const v of scan.verbatims) {
		if (v.to < lo || v.from > hi) continue;
		b.mark(v.from, v.to, 'mlp-tex-verb');
		if (v.env !== 'verb') b.lines(v.from, v.to, 'mlp-tex-code', lo, hi);
	}

	for (const c of scan.commands) {
		if (c.from < lo - WINDOW) continue;
		if (c.from > hi) break;
		if (b.inBlock(c.from) || b.inReplaced(c.from)) continue;
		if (c.from < scan.bodyFrom || c.from >= scan.bodyTo || inEditedTable(c.from)) {
			b.cmd(c);
			continue;
		}
		command(b, c);
	}
	for (const c of raw) b.rawArg(c.from, c.to);

	for (const comment of scan.comments) {
		if (comment.to < lo || comment.from > hi || b.inBlock(comment.from)) continue;
		b.mark(comment.from, comment.to, 'mlp-tex-comment');
		const line = state.doc.lineAt(comment.from);
		if (/^[ \t]*$/.test(text.slice(line.from, comment.from)) && comment.to >= line.to) {
			b.lines(comment.from, comment.to, 'mlp-tex-comment-line', lo, hi);
		}
	}

	typography(b, lo, hi);
	return b.finish();
}

export const texRenderPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = build(view);
		}
		update(update: ViewUpdate) {
			if (
				update.docChanged ||
				update.viewportChanged ||
				update.selectionSet ||
				update.transactions.some((tr) => tr.effects.some((e) => e.is(setTexContext)))
			) {
				this.decorations = build(update.view);
			}
		}
	},
	{ decorations: (v) => v.decorations },
);
