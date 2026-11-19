import { EditorSelection, type EditorState, type Extension, Prec } from '@codemirror/state';
import { type EditorView, keymap } from '@codemirror/view';
import { autocompletion, type Completion, type CompletionContext, type CompletionResult, snippetCompletion } from '@codemirror/autocomplete';
import { readArgs } from '../../../shared/plusTexScan';
import { texContextField, texScanField } from './context';

/**
 * md-live-preview-plus: editing commands of the LaTeX Live Preview, as in
 * Overleaf — Ctrl/Cmd+B and +I wrap the selection in `\textbf{}` and
 * `\textit{}` (or unwrap it), Ctrl/Cmd+/ comments lines out, Enter on an
 * `\item` starts the next one — and completion of labels, citation keys,
 * environments and common commands.
 */

/** Toggles `\name{…}` around each selection: unwraps when the selection is (inside) one already. */
export function toggleCommand(name: string) {
	return (view: EditorView): boolean => {
		const { state } = view;
		const open = `\\${name}{`;
		const changes = state.changeByRange((range) => {
			const text = state.doc.toString();
			// Inside an existing \name{…} whose argument the selection lies within: unwrap.
			const start = text.lastIndexOf(open, range.from);
			if (start >= 0) {
				const args = readArgs(text, start + open.length - 1, 'm');
				const arg = args?.args[0];
				if (arg && arg.from <= range.from && range.to <= arg.to) {
					return {
						changes: [
							{ from: start, to: arg.from, insert: '' },
							{ from: arg.to, to: arg.to + 1, insert: '' },
						],
						range: EditorSelection.range(range.anchor - open.length, range.head - open.length),
					};
				}
			}
			return {
				changes: [
					{ from: range.from, insert: open },
					{ from: range.to, insert: '}' },
				],
				range: range.empty ? EditorSelection.cursor(range.from + open.length) : EditorSelection.range(range.from + open.length, range.to + open.length),
			};
		});
		view.dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }));
		return true;
	};
}

/** Ctrl/Cmd+/: comments the selected lines out with `% `, or back in when all already are. */
export function toggleLineComment(view: EditorView): boolean {
	const { state } = view;
	const lines = new Set<number>();
	for (const r of state.selection.ranges) {
		const first = state.doc.lineAt(r.from).number;
		const last = state.doc.lineAt(r.to).number;
		for (let n = first; n <= last; n++) lines.add(n);
	}
	const list = [...lines].map((n) => state.doc.line(n));
	const commented = list.filter((l) => l.text.trim()).every((l) => /^\s*%/.test(l.text));
	const changes = list.flatMap((l) => {
		if (commented) {
			const m = /^(\s*)% ?/.exec(l.text);
			return m ? [{ from: l.from + m[1].length, to: l.from + m[0].length, insert: '' }] : [];
		}
		if (!l.text.trim() && list.length > 1) return [];
		const indent = /^\s*/.exec(l.text)![0].length;
		return [{ from: l.from + indent, insert: '% ' }];
	});
	view.dispatch({ changes, userEvent: 'input' });
	return true;
}

/** Enter at the end of an `\item` line starts the next item; on an empty `\item` it ends the list's run of items. */
export function continueItem(view: EditorView): boolean {
	const { state } = view;
	const range = state.selection.main;
	if (!range.empty) return false;
	const line = state.doc.lineAt(range.head);
	const m = /^(\s*)\\item(?:\[[^\]]*\])?\s?(.*)$/.exec(line.text);
	if (!m || range.head !== line.to) return false;
	if (!m[2].trim()) {
		view.dispatch({ changes: { from: line.from, to: line.to, insert: m[1] }, selection: { anchor: line.from + m[1].length }, userEvent: 'input' });
		return true;
	}
	const insert = `\n${m[1]}\\item `;
	view.dispatch({ changes: { from: range.head, insert }, selection: { anchor: range.head + insert.length }, scrollIntoView: true, userEvent: 'input' });
	return true;
}

export const texKeymap: Extension = Prec.high(
	keymap.of([
		{ key: 'Mod-b', run: toggleCommand('textbf') },
		{ key: 'Mod-i', run: toggleCommand('textit') },
		{ key: 'Mod-/', run: toggleLineComment },
		{ key: 'Enter', run: continueItem },
	]),
);

// ── Completion ──────────────────────────────────────────────────────────────

const ENVIRONMENTS = [
	'itemize',
	'enumerate',
	'description',
	'figure',
	'figure*',
	'table',
	'table*',
	'tabular',
	'equation',
	'equation*',
	'align',
	'align*',
	'gather',
	'multline',
	'cases',
	'center',
	'abstract',
	'quote',
	'verbatim',
	'minipage',
	'theorem',
	'lemma',
	'proof',
	'definition',
	'tikzpicture',
	'algorithm',
	'algorithmic',
];

const COMMANDS: [string, string][] = [
	['section{${}}', 'section'],
	['subsection{${}}', 'subsection'],
	['subsubsection{${}}', 'subsubsection'],
	['paragraph{${}}', 'paragraph'],
	['textbf{${}}', 'textbf'],
	['textit{${}}', 'textit'],
	['emph{${}}', 'emph'],
	['texttt{${}}', 'texttt'],
	['underline{${}}', 'underline'],
	['cite{${}}', 'cite'],
	['ref{${}}', 'ref'],
	['eqref{${}}', 'eqref'],
	['label{${}}', 'label'],
	['footnote{${}}', 'footnote'],
	['caption{${}}', 'caption'],
	['includegraphics[width=\\linewidth]{${}}', 'includegraphics'],
	['input{${}}', 'input'],
	['url{${}}', 'url'],
	['href{${url}}{${text}}', 'href'],
	['frac{${}}{${}}', 'frac'],
	['item ', 'item'],
	['centering', 'centering'],
	['midrule', 'midrule'],
	['toprule', 'toprule'],
	['bottomrule', 'bottomrule'],
	['multicolumn{${cols}}{${c}}{${text}}', 'multicolumn'],
];

function envCompletions(closing: boolean): Completion[] {
	return ENVIRONMENTS.map((env) =>
		closing
			? { label: env, type: 'type' }
			: snippetCompletion(`${env}}\n\t\${}\n\\end{${env}}`, { label: env, type: 'type', detail: 'environment' }),
	);
}

function labelsInDoc(state: EditorState): string[] {
	const text = state.doc.toString();
	return [...text.matchAll(/\\label\s*\{([^{}]+)\}/g)].map((m) => m[1].trim());
}

export function texCompletionSource(context: CompletionContext): CompletionResult | null {
	const { state, pos } = context;
	const line = state.doc.lineAt(pos);
	const before = state.sliceDoc(line.from, pos);
	const ctx = state.field(texContextField);

	const refMatch = /\\(?:ref|eqref|autoref|cref|Cref|pageref|nameref|vref|labelcref)\{([^{}]*)$/.exec(before);
	if (refMatch) {
		const typed = refMatch[1].split(',').pop()!;
		const keys = new Set([...Object.keys(ctx.labels), ...labelsInDoc(state)]);
		return {
			from: pos - typed.trimStart().length,
			options: [...keys].map((k) => ({ label: k, type: 'variable', detail: ctx.labels[k] ? `→ ${ctx.labels[k]}` : 'not yet built' })),
			validFor: /^[^,{}]*$/,
		};
	}
	const citeMatch = /\\[A-Za-z]*cite[A-Za-z]*\*?(?:\[[^\]]*\]){0,2}\{([^{}]*)$/.exec(before);
	if (citeMatch) {
		const typed = citeMatch[1].split(',').pop()!;
		return {
			from: pos - typed.trimStart().length,
			options: Object.values(ctx.bib).map((e) => ({
				label: e.key,
				type: 'text',
				detail: [e.authorShort, e.year].filter(Boolean).join(' '),
				info: e.title,
			})),
			validFor: /^[^,{}\s]*$/,
		};
	}
	const envMatch = /\\(begin|end)\{([A-Za-z*]*)$/.exec(before);
	if (envMatch) {
		const closing = envMatch[1] === 'end';
		// closeBrackets may already have put a `}` after the caret; the snippet writes its own.
		const after = state.sliceDoc(pos, pos + 1);
		const options = envCompletions(closing);
		return { from: pos - envMatch[2].length, to: !closing && after === '}' ? pos + 1 : pos, options, validFor: /^[A-Za-z*]*$/ };
	}
	const cmdMatch = /\\([A-Za-z]*)$/.exec(before);
	if (cmdMatch && (cmdMatch[1].length > 0 || context.explicit)) {
		const scan = state.field(texScanField);
		const used = new Set(scan.commands.map((c) => c.name).filter((n) => n.length > 2));
		const options: Completion[] = COMMANDS.map(([tpl, label]) => snippetCompletion(tpl, { label: `\\${label}`, type: 'keyword' }));
		for (const name of used) if (!COMMANDS.some(([, l]) => l === name)) options.push({ label: `\\${name}`, apply: name, type: 'function' });
		// The completion replaces what follows the backslash only.
		return { from: pos - cmdMatch[1].length, options: options.map((o) => ({ ...o, label: o.label.slice(1), displayLabel: o.label })), validFor: /^[A-Za-z]*$/ };
	}
	return null;
}

export const texCompletion: Extension = autocompletion({ override: [texCompletionSource], icons: false });
