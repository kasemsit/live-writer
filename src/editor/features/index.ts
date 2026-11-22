import * as vscode from 'vscode';
import type { EditorToHostMessage, HostToEditorMessage } from '../../shared/messages';
import { hasSessionFor, listAnchors, listNotes, openWikilink, previewWikilink, resolveWikiTarget, trackSession as trackWikiSession, type PlusSession } from './wikiOpen';
import { forgetSelectionOf, writeSelection } from './selectionFile';
import { handlePlusDo } from './contextMenu';
import { texSessionOf } from './tex';
import { stopWatchingQuartoProject, watchQuartoProject } from './quartoProject';
import { zoteroLinks } from './zotero';
import { paraphrase } from './paraphrase';
import { isRewriteMode } from '../../shared/rewrite';

export { takePendingJump } from './wikiOpen';

/** Registers an open editor; when the last one on a document closes, its selection stops going to Claude. */
export function trackSession(session: PlusSession): vscode.Disposable {
	const tracked = trackWikiSession(session);
	return new vscode.Disposable(() => {
		tracked.dispose();
		stopWatchingQuartoProject(session);
		const document = session.getDocument();
		if (!hasSessionFor(document.uri)) void forgetSelectionOf(document);
	});
}

/**
 * Host side of md-live-preview-plus for one editor session: the messages the
 * plus webview modules send. Returns true when the message was one of them.
 */
export function handlePlusMessage(
	session: PlusSession,
	post: (message: HostToEditorMessage) => void,
	message: EditorToHostMessage,
): boolean {
	switch (message.type) {
		case 'plusSelection':
			void writeSelection(session.getDocument(), message);
			return true;
		case 'plusListNotes':
			void listNotes().then((notes) => post({ type: 'plusNotes', requestId: message.requestId, notes }));
			return true;
		case 'plusListAnchors':
			void listAnchors(session, message.target).then((anchors) =>
				post({ type: 'plusAnchors', requestId: message.requestId, anchors }),
			);
			return true;
		case 'plusPreview':
			void previewWikilink(session, message.target).then((preview) =>
				post({ type: 'plusPreviewResult', requestId: message.requestId, preview }),
			);
			return true;
		case 'plusResolveEmbed':
			void resolveWikiTarget(session.getDocument().uri, message.target.trim()).then(
				(uri) => post({ type: 'plusEmbedResult', requestId: message.requestId, src: uri ? session.asWebviewUri(uri) : null }),
				() => post({ type: 'plusEmbedResult', requestId: message.requestId, src: null }),
			);
			return true;
		case 'plusParaphrase':
			void paraphrase(message.text, isRewriteMode(message.mode) ? message.mode : 'polish').then((r) => post({ type: 'plusParaphraseResult', requestId: message.requestId, ...r }));
			return true;
		case 'plusZoteroLinks':
			void zoteroLinks(session.getDocument().uri, message.key).then((links) =>
				post({ type: 'plusZoteroLinksResult', requestId: message.requestId, links }),
			);
			return true;
		case 'plusQuartoWatch':
			watchQuartoProject(session, post);
			return true;
		case 'plusDo':
			void handlePlusDo(session, message);
			return true;
		case 'plusTexAsset': {
			const tex = texSessionOf(session);
			const missing = { status: 'missing' as const, src: null, name: message.path };
			void (tex ? tex.resolveAsset(message.path) : Promise.resolve(missing)).then(
				(asset) => post({ type: 'plusTexAssetResult', requestId: message.requestId, asset }),
				() => post({ type: 'plusTexAssetResult', requestId: message.requestId, asset: missing }),
			);
			return true;
		}
		case 'plusTexPicture': {
			const tex = texSessionOf(session);
			const missing = { status: 'missing' as const, src: null, note: 'Not a LaTeX document.', stale: false };
			void (tex ? tex.resolvePicture(message.lines) : Promise.resolve(missing)).then(
				(picture) => post({ type: 'plusTexPictureResult', requestId: message.requestId, picture }),
				() => post({ type: 'plusTexPictureResult', requestId: message.requestId, picture: missing }),
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
