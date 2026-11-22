import * as vscode from 'vscode';

/**
 * Inverse search into Live Writer: a Ctrl+click in LaTeX Workshop's PDF viewer
 * makes it open the source as a text editor at that line. When the file is
 * open in Live Writer too, Live Writer comes to the front at that line
 * instead, and a text tab opened only for the jump is closed. A text tab that
 * was already open stays. Setting: liveWriter.plus.inverseSearch.
 */

const WINDOW_MS = 3000;

/** LaTeX Workshop's PDF viewer, as a tab. */
export function isPdfViewerTab(tab: vscode.Tab | undefined): boolean {
	const input = tab?.input;
	if (input instanceof vscode.TabInputWebview) return input.viewType.includes('latex-workshop-pdf');
	if (input instanceof vscode.TabInputCustom) return input.viewType.includes('latex-workshop-pdf');
	return false;
}

function textTabsFor(uri: vscode.Uri): vscode.Tab[] {
	return vscode.window.tabGroups.all.flatMap((g) => g.tabs).filter((t) => t.input instanceof vscode.TabInputText && t.input.uri.toString() === uri.toString());
}

export function registerInverseSearch(context: vscode.ExtensionContext, revealLine: (uri: vscode.Uri, line: number) => boolean): void {
	let pdfAt = 0;
	const opened = new Map<string, number>(); // text tabs that appeared, by uri, and when
	const track = () => {
		if (isPdfViewerTab(vscode.window.tabGroups.activeTabGroup.activeTab)) pdfAt = Date.now();
	};
	context.subscriptions.push(
		vscode.window.tabGroups.onDidChangeTabs((e) => {
			for (const tab of e.opened) if (tab.input instanceof vscode.TabInputText) opened.set(tab.input.uri.toString(), Date.now());
			track();
		}),
		vscode.window.tabGroups.onDidChangeTabGroups(track),
		vscode.window.onDidChangeTextEditorSelection((e) => {
			const doc = e.textEditor.document;
			if (!/\.tex$/i.test(doc.uri.path) || Date.now() - pdfAt > WINDOW_MS) return;
			if (!vscode.workspace.getConfiguration('liveWriter').get('plus.inverseSearch', true)) return;
			const line = e.selections[0].active.line + 1;
			const key = doc.uri.toString();
			const fresh = Date.now() - (opened.get(key) ?? 0) < WINDOW_MS;
			pdfAt = 0;
			if (!revealLine(doc.uri, line)) return;
			if (fresh) void vscode.window.tabGroups.close(textTabsFor(doc.uri), true);
			opened.delete(key);
		}),
	);
	track();
}
