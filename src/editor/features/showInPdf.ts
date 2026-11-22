import * as vscode from 'vscode';
import { hasLatexWorkshop, withTextEditor } from './momentary';

/**
 * Show in PDF: the line under the caret (or the right-click) in a LaTeX file,
 * found in the build's PDF by LaTeX Workshop's own viewer and SyncTeX — the
 * viewer you already build with (started through a momentary text editor).
 */
export async function showInPdf(document: vscode.TextDocument, line: number): Promise<void> {
	if (!(await hasLatexWorkshop('latex-workshop.synctexto', 'Show in PDF'))) return;
	// 0-based line: LaTeX Workshop adds one.
	await withTextEditor(document, () => vscode.commands.executeCommand('latex-workshop.synctexto', Math.max(0, line - 1), document.uri.fsPath), line);
}
