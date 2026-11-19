import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import { type EditorState, type Range, StateField } from '@codemirror/state';
import { type TexEnv, type TexMath, type TexScan, readArgs } from '../../../shared/plusTexScanner';
import { parseTabular, type TexTable } from '../../../shared/plusTexTable';
import { setTexContext, texContextField, texScanField } from './context';
import { texMacros } from './macros';
import { TexDisplayMathWidget, TexFoldWidget, TexTableWidget } from './widgets';

/**
 * md-live-preview-plus: display math and tables, drawn over the whole lines
 * they occupy — block widgets, which CodeMirror accepts only from state.
 *
 * Unlike Markdown tables (switched by their own button), these follow the
 * caret, as Overleaf's Visual Editor does: a selection inside or touching one
 * shows its source; moving away draws it again. A click on the drawing puts
 * the caret in it, at the clicked cell for a table.
 */

export interface TexBlock {
	kind: 'math' | 'table' | 'preamble';
	/** Inside a figure or table float, whose frame the widget continues. */
	inFloat?: boolean;
	/** Line-aligned range the widget covers. */
	from: number;
	to: number;
	math?: TexMath;
	env?: TexEnv;
	table?: TexTable;
}

const FLOAT_NAMES = /^(figure|table|algorithm|wrapfigure|wraptable|sidewaysfigure|sidewaystable|listing|subfigure|subtable)\*?$/;

export const TABLE_ENVS = new Set(['tabular', 'tabular*', 'tabularx', 'tabulary', 'longtable', 'tabu', 'supertabular']);

/** Only blanks — or blanks and a comment — between `from` and `to`. */
function blank(text: string, from: number, to: number): boolean {
	return /^[ \t]*(%.*)?$/.test(text.slice(from, to));
}

function lineStart(text: string, pos: number): number {
	return text.lastIndexOf('\n', pos - 1) + 1;
}

function lineEndAt(text: string, pos: number): number {
	const nl = text.indexOf('\n', pos);
	return nl < 0 ? text.length : nl;
}

// A wrapper opened before a table on its first line: `\resizebox{\columnwidth}{!}{`, `\scalebox{0.9}{`, `{\small`.
const WRAPPER_PREFIX = /^[ \t]*(?:(?:\\[A-Za-z]+\*?(?:[ \t]*(?:\{[^{}\n]*\}|\[[^\]\n]*\]|!))*[ \t]*\{?|\{)[ \t]*)*$/;

/** Math to render for a display region: environment bodies rewritten into what KaTeX numbers nothing in. */
export function displayTex(text: string, math: TexMath): { tex: string; labels: string[] } {
	let body = text.slice(math.innerFrom, math.innerTo);
	const labels: string[] = [];
	body = body.replace(/\\label\s*\{([^{}]*)\}/g, (_m, key: string) => {
		labels.push(key.trim());
		return '';
	});
	body = body.replace(/\\(?:nonumber|notag)(?![A-Za-z])/g, '');
	const env = math.env?.replace(/\*$/, '') ?? null;
	switch (env) {
		case 'align':
		case 'flalign':
		case 'gather':
		case 'multline':
			return { tex: `\\begin{${env === 'flalign' ? 'align' : env}*}${body}\\end{${env === 'flalign' ? 'align' : env}*}`, labels };
		case 'alignat': {
			const cols = /^\s*\{(\d+)\}/.exec(body);
			const rest = cols ? body.slice(cols[0].length) : body;
			return { tex: `\\begin{alignat*}{${cols ? cols[1] : '1'}}${rest}\\end{alignat*}`, labels };
		}
		case 'eqnarray':
			return { tex: `\\begin{array}{rcl}${body}\\end{array}`, labels };
		default:
			return { tex: body.trim(), labels };
	}
}

function numberFor(math: TexMath, labels: string[], known: Record<string, string>): string {
	if (!math.env || math.env.endsWith('*') || math.env === 'displaymath') return '';
	const nums = labels.map((k) => known[k]).filter((n): n is string => !!n);
	return nums.length ? nums.map((n) => `(${n})`).join(', ') : '';
}

const candidateCache = new WeakMap<TexScan, TexBlock[]>();

/** Every display-math or table region that could be drawn as a block, for this document. */
export function texBlockCandidates(state: EditorState): TexBlock[] {
	const scan = state.field(texScanField);
	let blocks = candidateCache.get(scan);
	if (blocks) return blocks;
	const text = state.doc.toString();
	blocks = [];
	// The preamble, through the `\begin{document}` line, folds into one line as in Overleaf.
	if (scan.hasPreamble) {
		const to = lineEndAt(text, scan.bodyFrom);
		if (blank(text, scan.bodyFrom, to)) blocks.push({ kind: 'preamble', from: 0, to });
	}
	for (const math of scan.maths) {
		if (!math.display || math.from < scan.bodyFrom || math.to > scan.bodyTo) continue;
		const from = lineStart(text, math.from);
		const to = lineEndAt(text, math.to);
		if (!blank(text, from, math.from) || !blank(text, math.to, to)) continue;
		// A one-line `\[ x \]` is drawn inline by the render plugin; a block needs a line of its own all the same.
		blocks.push({ kind: 'math', from, to, math });
	}
	for (const env of scan.envs) {
		if (!TABLE_ENVS.has(env.name) || !env.closed || env.from < scan.bodyFrom) continue;
		const args = readArgs(text, env.nameTo, env.name === 'tabular' || env.name === 'longtable' ? 'om' : 'mom');
		if (!args) continue;
		const spec = args.args[args.args.length - 1]!;
		const from = lineStart(text, env.from);
		const to = lineEndAt(text, env.to);
		if (!WRAPPER_PREFIX.test(text.slice(from, env.from)) || !blank(text, args.end, lineEndAt(text, args.end))) continue;
		// After `\end{tabular}`: closing braces of a wrapper, or `\\[4pt]` between two tables of one figure.
		if (!/^[ \t}]*(?:\\\\(?:\[[^\]\n]*\])?)?[ \t]*(%.*)?$/.test(text.slice(env.to, to)) || !blank(text, lineStart(text, env.endFrom), env.endFrom)) continue;
		const table = parseTabular(text.slice(args.end, env.endFrom), args.end, text.slice(spec.from, spec.to));
		if (!table.rows.length) continue;
		blocks.push({ kind: 'table', from, to, env, table });
	}
	for (const b of blocks) b.inFloat = b.kind !== 'preamble' && scan.envs.some((e) => FLOAT_NAMES.test(e.name) && e.from < b.from && b.to < e.to);
	blocks.sort((a, b) => a.from - b.from);
	// Nested candidates (a table inside a table's cell): only the outer one.
	const outer: TexBlock[] = [];
	for (const b of blocks) if (!outer.length || b.from > outer[outer.length - 1].to) outer.push(b);
	candidateCache.set(scan, outer);
	return outer;
}

/** True while the selection is inside or touching `block`, which then shows its source. */
export function texBlockRevealed(state: EditorState, block: { from: number; to: number }): boolean {
	return state.selection.ranges.some((r) => r.from <= block.to && r.to >= block.from);
}

/** The blocks drawn in this state (those the selection is not in). */
export function replacedTexBlocks(state: EditorState): TexBlock[] {
	return texBlockCandidates(state).filter((b) => !texBlockRevealed(state, b));
}

function build(state: EditorState): DecorationSet {
	const blocks = replacedTexBlocks(state);
	if (!blocks.length) return Decoration.none;
	const text = state.doc.toString();
	const ctx = state.field(texContextField);
	const macros = texMacros(state);
	const out: Range<Decoration>[] = [];
	for (const block of blocks) {
		if (block.kind === 'math' && block.math) {
			const { tex, labels } = displayTex(text, block.math);
			const widget = new TexDisplayMathWidget(tex, numberFor(block.math, labels, ctx.labels), block.math.innerFrom, macros, !!block.inFloat);
			out.push(Decoration.replace({ widget, block: true }).range(block.from, block.to));
		} else if (block.kind === 'preamble') {
			const lines = state.doc.lineAt(block.to).number;
			const widget = new TexFoldWidget(`Preamble · ${lines} lines`, 0);
			out.push(Decoration.replace({ widget, block: true }).range(block.from, block.to));
		} else if (block.kind === 'table' && block.table && block.env) {
			const source = state.sliceDoc(block.from, block.to);
			const cellText = block.table.rows.map((row) => row.cells.map((cell) => state.sliceDoc(cell.from, cell.to)));
			const widget = new TexTableWidget(source, block.table, block.env.from, ctx, macros, cellText, !!block.inFloat);
			out.push(Decoration.replace({ widget, block: true }).range(block.from, block.to));
		}
	}
	return Decoration.set(out, true);
}

export const texBlockField = StateField.define<DecorationSet>({
	create: build,
	update(value, tr) {
		if (tr.docChanged || tr.selection || tr.effects.some((e) => e.is(setTexContext))) return build(tr.state);
		return value;
	},
	provide: (field) => EditorView.decorations.from(field),
});
