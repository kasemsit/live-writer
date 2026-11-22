import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { texCompletionSource } from './commands';
import { EMPTY_CONTEXT, setTexContext, texContextField, texScanField } from './context';

/** Completion at the end of `doc`, with `labels` as the last build's. */
function complete(doc: string, labels: Record<string, string> = {}): CompletionResult | null {
	const state = EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [texScanField, texContextField] });
	const withContext = state.update({ effects: setTexContext.of({ ...EMPTY_CONTEXT, labels }) }).state;
	return texCompletionSource(new CompletionContext(withContext, doc.length, false)) as CompletionResult | null;
}

const labelsOf = (result: CompletionResult | null) => result?.options.map((o) => o.label).sort() ?? null;

describe('LaTeX completion of reference keys', () => {
	const doc = '\\section{A}\\label{sec:a}\n\\begin{equation}\n  E = mc^2 \\label{eq:e}\n\\end{equation}\n';

	it('offers labels after every reference command the preview draws, \\Vref and \\subref included', () => {
		for (const name of ['ref', 'eqref', 'autoref', 'cref', 'Cref', 'pageref', 'nameref', 'vref', 'Vref', 'subref', 'labelcref']) {
			expect(labelsOf(complete(`${doc}See \\${name}{`)), name).toEqual(['eq:e', 'sec:a']);
		}
	});

	it("offers the last build's labels and this file's, not those commented out or in verbatim", () => {
		const text = `${doc}% \\label{old}\n\\begin{verbatim}\n\\label{code}\n\\end{verbatim}\nSee \\ref{`;
		const result = complete(text, { 'fig:built': '3' });
		expect(labelsOf(result)).toEqual(['eq:e', 'fig:built', 'sec:a']);
		expect(result!.options.find((o) => o.label === 'fig:built')!.detail).toBe('→ 3');
		expect(result!.options.find((o) => o.label === 'sec:a')!.detail).toBe('not yet built');
	});

	it('completes the key after the last comma', () => {
		const text = `${doc}See \\cref{sec:a, eq`;
		expect(complete(text)!.from).toBe(text.length - 'eq'.length);
	});

	it('leaves the arguments of other commands alone', () => {
		expect(complete(`${doc}\\textbf{`)).toBeNull();
	});
});
