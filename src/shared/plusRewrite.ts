/**
 * Live Writer: the ways Claude can rewrite a selection (right-click → Rewrite
 * with Claude). Every mode keeps meaning, terms, numbers, citations and markup;
 * the instruction says what changes. Used by the webview (labels) and the host
 * (the prompt given to `claude -p`, src/editor/plus/paraphrase.ts).
 */

export type RewriteMode = 'polish' | 'tighten' | 'formal' | 'toEnglish' | 'toThai';

export const REWRITE_MODES: Record<RewriteMode, { label: string; instruction: string }> = {
	polish: {
		label: 'Paraphrase',
		instruction: 'Paraphrase the passage in its own language: Thai stays Thai, English stays English. Write conventional academic prose.',
	},
	tighten: {
		label: 'Tighten',
		instruction: 'Make the passage shorter and more direct, in its own language. Remove repetition and filler, but drop no claim, number, condition or hedge.',
	},
	formal: {
		label: 'More Formal',
		instruction: 'Rewrite the passage in a more formal academic register, in its own language.',
	},
	toEnglish: {
		label: 'Translate to English',
		instruction: 'Translate the passage into English, in conventional academic prose. Render each technical term the way the English literature names it, and use the same rendering every time it recurs.',
	},
	toThai: {
		label: 'Translate to Thai',
		instruction: 'Translate the passage into formal academic Thai. Keep in English the technical terms that Thai academic writing usually leaves in English, and use the same rendering every time a term recurs.',
	},
};

const RULES = 'Keep its meaning, technical terms, numbers, citations such as [@key] or \\cite{key}, and any LaTeX or Markdown markup exactly. Reply with the rewritten passage only, nothing else.';

/** The system prompt for a mode. */
export function rewritePrompt(mode: RewriteMode): string {
	return `${REWRITE_MODES[mode].instruction} ${RULES}`;
}

export function isRewriteMode(value: unknown): value is RewriteMode {
	return typeof value === 'string' && value in REWRITE_MODES;
}
