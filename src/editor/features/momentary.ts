import * as vscode from 'vscode';

/**
 * LaTeX Workshop starts its commands (build, SyncTeX, the viewer) only from a
 * LaTeX text editor. Live Writer reaches them by showing the file as text for
 * a moment in the same tab group, running the command, and closing that tab
 * again, unless the file was already open as text there.
 */

const momentary = new Set<string>();

/** Whether `uri` is open as text only for one of these moments (inverse search leaves it alone). */
export function isMomentary(uri: vscode.Uri): boolean {
	return momentary.has(uri.toString());
}

/** Whether LaTeX Workshop is installed and offers `command`; warns when not. */
export async function hasLatexWorkshop(command: string, what: string): Promise<boolean> {
	if ((await vscode.commands.getCommands(true)).includes(command)) return true;
	void vscode.window.showWarningMessage(`${what} needs the LaTeX Workshop extension.`);
	return false;
}

function textTabsOf(uri: vscode.Uri, group: vscode.TabGroup): vscode.Tab[] {
	return group.tabs.filter((t) => t.input instanceof vscode.TabInputText && t.input.uri.toString() === uri.toString());
}

/** Shows `document` as text (at `line`, 1-based), runs `run`, then closes the tab if it opened one. */
export async function withTextEditor<T>(document: vscode.TextDocument, run: () => PromiseLike<T>, line?: number): Promise<T> {
	const key = document.uri.toString();
	const group = vscode.window.tabGroups.activeTabGroup;
	const hadTab = textTabsOf(document.uri, group).length > 0;
	const at = line === undefined ? undefined : new vscode.Position(Math.max(0, line - 1), 0);
	momentary.add(key);
	try {
		await vscode.window.showTextDocument(document, {
			viewColumn: group.viewColumn,
			preview: true,
			...(at ? { selection: new vscode.Range(at, at) } : {}),
		});
		return await run();
	} finally {
		if (!hadTab) {
			const groupNow = vscode.window.tabGroups.all.find((g) => g.viewColumn === group.viewColumn) ?? group;
			const tabs = textTabsOf(document.uri, groupNow);
			if (tabs.length) await vscode.window.tabGroups.close(tabs, true);
		}
		momentary.delete(key);
	}
}
