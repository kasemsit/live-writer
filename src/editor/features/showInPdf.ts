import * as vscode from 'vscode';

/**
 * Show in PDF: the line under the caret (or the right-click) in a LaTeX file,
 * found in the build's PDF by LaTeX Workshop's own viewer and SyncTeX — the
 * viewer you already build with. LaTeX Workshop starts that search only from a
 * LaTeX text editor, so the file is opened as one for a moment in the same
 * tab group, the search started, and that tab closed again.
 */
export async function showInPdf(document: vscode.TextDocument, line: number): Promise<void> {
	const available = new Set(await vscode.commands.getCommands(true));
	if (!available.has('latex-workshop.synctexto')) {
		void vscode.window.showWarningMessage('Show in PDF needs the LaTeX Workshop extension, whose viewer shows the PDF.');
		return;
	}
	const at = new vscode.Position(Math.max(0, line - 1), 0);
	const editor = await vscode.window.showTextDocument(document, {
		viewColumn: vscode.window.tabGroups.activeTabGroup.viewColumn,
		preview: true,
		selection: new vscode.Range(at, at),
	});
	try {
		// 0-based line: LaTeX Workshop adds one.
		await vscode.commands.executeCommand('latex-workshop.synctexto', at.line, document.uri.fsPath);
	} finally {
		if (vscode.window.activeTextEditor === editor) await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
	}
}
