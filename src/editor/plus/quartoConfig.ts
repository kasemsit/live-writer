import * as vscode from 'vscode';
import { labelsFromQuartoYaml } from '../../shared/plusQuarto';

/**
 * The labels (`crossref-fig-title`, `callout-note-title`, …) set by the
 * `_quarto.yml` nearest above `document`, searching no higher than its
 * workspace folder. Empty when there is none, or for a file outside a workspace.
 */
export async function quartoLabels(document: vscode.Uri): Promise<Record<string, string>> {
	const root = vscode.workspace.getWorkspaceFolder(document)?.uri;
	if (!root) return {};
	for (let dir = vscode.Uri.joinPath(document, '..'); ; dir = vscode.Uri.joinPath(dir, '..')) {
		try {
			const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(dir, '_quarto.yml'));
			return labelsFromQuartoYaml(new TextDecoder().decode(bytes));
		} catch {
			// Not here; look one folder up.
		}
		if (dir.path === root.path || dir.path.length <= root.path.length) return {};
	}
}
