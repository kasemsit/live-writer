import * as vscode from 'vscode';
import type { FeatureHostToEditorMessage } from '../../shared/messages';

/**
 * Live Writer: Insert Citation from Zotero. Better BibTeX's "cite as you write"
 * picker opens in Zotero; the works picked come back as the document's own
 * citation syntax — `[@a; @b]` in Markdown and Quarto, `\cite{a,b}` in LaTeX —
 * and are inserted at the caret.
 */

const CAYW = 'http://127.0.0.1:23119/better-bibtex/cayw';

/** The picker's URL for a document: Pandoc citations, or LaTeX's `\cite`. */
export function caywUrl(document: vscode.Uri): string {
	return /\.tex$/i.test(document.path) ? `${CAYW}?format=latex` : `${CAYW}?format=pandoc&brackets=1`;
}

/** What the user picked in Zotero ('' when they closed the picker); throws when Zotero or Better BibTeX does not answer. */
export async function pickCitation(document: vscode.Uri): Promise<string> {
	// The picker waits for the user, so no short timeout.
	const res = await fetch(caywUrl(document), { signal: AbortSignal.timeout(10 * 60_000) });
	if (!res.ok) throw new Error(String(res.status));
	return (await res.text()).trim();
}

export function registerInsertCitation(
	context: vscode.ExtensionContext,
	postToActive: (message: FeatureHostToEditorMessage) => boolean,
	activeDocument: () => vscode.Uri | undefined,
): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('liveWriter.plus.insertCitation', async () => {
			const document = activeDocument();
			if (!document) {
				void vscode.window.showWarningMessage('Open a document in Live Writer first.');
				return;
			}
			let text: string;
			try {
				text = await vscode.window.withProgress(
					{ location: vscode.ProgressLocation.Window, title: 'Pick the works in Zotero…' },
					() => pickCitation(document),
				);
			} catch {
				void vscode.window.showWarningMessage('Zotero with Better BibTeX is not running, so no citation can be picked.');
				return;
			}
			if (text) postToActive({ type: 'insertText', text });
		}),
	);
}
