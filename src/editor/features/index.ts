import * as vscode from 'vscode';
import type { EditorToHostMessage, HostToEditorMessage } from '../../shared/messages';
import { hasSessionFor, listAnchors, listNotes, openWikilink, previewWikilink, resolveWikiTarget, trackSession as trackWikiSession, type EditorSession } from './wikiOpen';
import { forgetSelectionOf, writeSelection } from './selectionFile';
import { handleHostAction } from './contextMenu';
import { texSessionOf } from './tex';
import { stopWatchingQuartoProject, watchQuartoProject } from './quartoProject';
import { zoteroLinks } from './zotero';
import { paraphrase } from './paraphrase';
import { isRewriteMode } from '../../shared/rewrite';

export { takePendingJump } from './wikiOpen';

/** Registers an open editor; when the last one on a document closes, its selection stops going to Claude. */
export function trackSession(session: EditorSession): vscode.Disposable {
	const tracked = trackWikiSession(session);
	return new vscode.Disposable(() => {
		tracked.dispose();
		stopWatchingQuartoProject(session);
		const document = session.getDocument();
		if (!hasSessionFor(document.uri)) void forgetSelectionOf(document);
	});
}

/**
 * The host side of Live Writer's features for one editor session: the messages
 * the feature modules in the webview send. Returns true when the message was one of them.
 */
export function handleFeatureMessage(
	session: EditorSession,
	post: (message: HostToEditorMessage) => void,
	message: EditorToHostMessage,
): boolean {
	switch (message.type) {
		case 'selection':
			void writeSelection(session.getDocument(), message);
			return true;
		case 'listNotes':
			void listNotes().then((notes) => post({ type: 'notes', requestId: message.requestId, notes }));
			return true;
		case 'listAnchors':
			void listAnchors(session, message.target).then((anchors) =>
				post({ type: 'anchors', requestId: message.requestId, anchors }),
			);
			return true;
		case 'linkPreview':
			void previewWikilink(session, message.target).then((preview) =>
				post({ type: 'linkPreviewResult', requestId: message.requestId, preview }),
			);
			return true;
		case 'resolveEmbed':
			void resolveWikiTarget(session.getDocument().uri, message.target.trim()).then(
				(uri) => post({ type: 'embedResult', requestId: message.requestId, src: uri ? session.asWebviewUri(uri) : null }),
				() => post({ type: 'embedResult', requestId: message.requestId, src: null }),
			);
			return true;
		case 'rewrite':
			void paraphrase(message.text, isRewriteMode(message.mode) ? message.mode : 'polish').then((r) => post({ type: 'rewriteResult', requestId: message.requestId, ...r }));
			return true;
		case 'zoteroLinks':
			void zoteroLinks(session.getDocument().uri, message.key).then((links) =>
				post({ type: 'zoteroLinksResult', requestId: message.requestId, links }),
			);
			return true;
		case 'quartoWatch':
			watchQuartoProject(session, post);
			return true;
		case 'hostAction':
			void handleHostAction(session, message);
			return true;
		case 'texAsset': {
			const tex = texSessionOf(session);
			const missing = { status: 'missing' as const, src: null, name: message.path };
			void (tex ? tex.resolveAsset(message.path) : Promise.resolve(missing)).then(
				(asset) => post({ type: 'texAssetResult', requestId: message.requestId, asset }),
				() => post({ type: 'texAssetResult', requestId: message.requestId, asset: missing }),
			);
			return true;
		}
		case 'texPicture': {
			const tex = texSessionOf(session);
			const missing = { status: 'missing' as const, src: null, note: 'Not a LaTeX document.', stale: false };
			void (tex ? tex.resolvePicture(message.lines) : Promise.resolve(missing)).then(
				(picture) => post({ type: 'texPictureResult', requestId: message.requestId, picture }),
				() => post({ type: 'texPictureResult', requestId: message.requestId, picture: missing }),
			);
			return true;
		}
		case 'openLink':
			if (message.href.startsWith('tex:')) {
				void texSessionOf(session)?.open(message.href);
				return true;
			}
			if (!message.href.startsWith('wiki:')) return false;
			void openWikilink(session, message.href.slice('wiki:'.length));
			return true;
		default:
			return false;
	}
}
