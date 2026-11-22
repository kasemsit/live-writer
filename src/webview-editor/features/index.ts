import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { EditorToHostMessage, HostToEditorMessage } from '../../shared/messages';
import { wikilinkExtension } from './wikilinks';
import { calloutPlugin } from './callouts';
import { quartoExtension } from './quarto';
import { handleQuartoHostMessage } from './quartoProject';
import { footnotePlugin, insertFootnote } from './footnotes';
import { blockIdPlugin } from './blockIds';
import { commentPlugin } from './comments';
import { citationPlugin } from './citations';
import { mathExtension } from './math';
import { underlineExtension } from './underline';
import { embedPlugin } from './embeds';
import { spacingPlugin } from './spacing';
import { reapplyTextScale, setTextScale } from './textScale';
import { beforeExternalUpdate, trackChangesExtension, trackNextUpdate } from './trackChanges';
import { linkPreviewExtension } from './linkPreview';
import { citeCardExtension } from './zotero';
import { selectionReporter } from './selection';
import { featureCompletion } from './completion';
import { handleHostReply, setHostPoster } from './hostRequests';
import { contextMenuExtension, runMenuCommand } from './contextMenu';

/**
 * Everything this fork adds to the editor webview, as one
 * extension list and one message handler, so main.ts needs two hooks.
 */
export function featureExtensions(post: (message: EditorToHostMessage) => void): Extension[] {
	setHostPoster(post);
	return [
		wikilinkExtension((href) => post({ type: 'openLink', href })),
		linkPreviewExtension((href) => post({ type: 'openLink', href })),
		citeCardExtension,
		calloutPlugin,
		quartoExtension,
		footnotePlugin,
		blockIdPlugin,
		commentPlugin,
		citationPlugin,
		mathExtension,
		underlineExtension,
		embedPlugin,
		spacingPlugin,
		trackChangesExtension,
		selectionReporter(post),
		contextMenuExtension(post),
		featureCompletion,
	];
}

/** Handles a plus message from the host. Returns true when it was one. */
export function handleFeatureHostMessage(view: EditorView | undefined, message: HostToEditorMessage): boolean {
	if (handleHostReply(message)) return true;
	if (handleQuartoHostMessage(view, message)) return true;
	if (message.type === 'trackNext') {
		trackNextUpdate();
		return true;
	}
	// Not ours: the editor applies it; tracked changes are worked out once it has.
	if (message.type === 'externalUpdate') beforeExternalUpdate(view, message.changes);
	if (message.type === 'textScale') {
		setTextScale(view, message.scale, message.fontFamily ?? '');
		return true;
	}
	// Not ours, but a new document or theme changes the size the text scale multiplies.
	if (message.type === 'init' || message.type === 'applyCss') reapplyTextScale();
	if (message.type === 'runCommand') {
		if (view) runMenuCommand(view, message.command, message.range);
		return true;
	}
	if (message.type === 'insertText') {
		if (view) {
			view.dispatch(view.state.replaceSelection(message.text));
			view.focus();
		}
		return true;
	}
	if (message.type === 'insertFootnote') {
		if (view) insertFootnote(view);
		return true;
	}
	return false;
}
