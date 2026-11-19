import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { EditorToHostMessage } from '../../../shared/messages';
import { setPlusPoster } from '../hostRequests';
import { selectionReporter } from '../selection';
import { trackChangesExtension } from '../trackChanges';
import { contextMenuExtension } from '../contextMenu';
import { texBlockField } from './blocks';
import { texCompletion, texKeymap } from './commands';
import { texContextField, texScanField } from './context';
import { texRenderPlugin } from './render';

export { handleTexHostMessage } from './context';

/**
 * md-live-preview-plus: the LaTeX Live Preview — the editor a `.tex` file
 * gets in place of the Markdown one. What it shares with Markdown notes:
 * the selection sent to Claude, tracked changes from disk, the right-click
 * menu, text size, search, undo through VS Code.
 */
export function texExtensions(post: (message: EditorToHostMessage) => void): Extension[] {
	setPlusPoster(post);
	return [
		texScanField,
		texContextField,
		texBlockField,
		texRenderPlugin,
		texKeymap,
		texCompletion,
		// Brackets pair; quotes do not (an apostrophe is not a quote, and LaTeX quotes are `` and '').
		EditorState.languageData.of(() => [{ closeBrackets: { brackets: ['(', '[', '{'] } }]),
		trackChangesExtension,
		selectionReporter(post),
		contextMenuExtension(post, true),
		EditorView.contentAttributes.of({ 'data-mlp-lang': 'latex' }),
		EditorView.editorAttributes.of({ class: 'mlp-tex' }),
	];
}

/**
 * Where the caret starts in a LaTeX file: at its end. Wherever the caret is,
 * that line shows its source, and the first body line is the one being read
 * when a file opens; the end is usually `\end{document}` or a blank line.
 * The view still opens at the top.
 */
export function texInitialAnchor(state: EditorState): number {
	return state.doc.length;
}
