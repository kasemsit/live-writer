import { codeFolding } from '@codemirror/language';
import { headingFoldPlaceholder, isHeadingSection } from './headingFold';

/**
 * The editor's one codeFolding config (CodeMirror accepts a single
 * placeholder): a folded heading section shows a clickable `…`
 * (headingFold.ts); a folded callout body, a thin bar (callouts.ts).
 */
export const foldingConfig = codeFolding({
	preparePlaceholder: (state, range) => (isHeadingSection(state, range.from) ? 'heading' : 'callout'),
	placeholderDOM: (_view, onclick, kind) => {
		if (kind === 'heading') return headingFoldPlaceholder(onclick);
		const span = document.createElement('span');
		span.className = 'mlp-callout-fold-placeholder';
		return span;
	},
});
