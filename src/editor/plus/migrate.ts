import * as vscode from 'vscode';

/**
 * Live Writer: settings made under the extension's former name
 * (`mdLivePreview.*`, md-live-preview-plus ≤ 0.4.17) carried over to
 * `liveWriter.*` — user, workspace and folder values alike — unless the new
 * key already has a value there. The old values are left in place.
 */

const OLD = 'mdLivePreview';
const NEW = 'liveWriter';
const KEYS = ['codeTheme', 'enabledStyles', 'defaultEditor', 'plus.shareSelectionWithClaude', 'plus.checkForUpdates', 'plus.textScale', 'plus.fontFamily', 'plus.trackExternalChanges'];

export async function migrateSettings(): Promise<void> {
	const scopes: (vscode.WorkspaceFolder | undefined)[] = [undefined, ...(vscode.workspace.workspaceFolders ?? [])];
	for (const scope of scopes) {
		const oldConfig = vscode.workspace.getConfiguration(OLD, scope);
		const newConfig = vscode.workspace.getConfiguration(NEW, scope);
		for (const key of KEYS) {
			const was = oldConfig.inspect(key);
			const now = newConfig.inspect(key);
			if (!was || !now) continue;
			const targets: [unknown, unknown, vscode.ConfigurationTarget][] = scope
				? [[was.workspaceFolderValue, now.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder]]
				: [
						[was.globalValue, now.globalValue, vscode.ConfigurationTarget.Global],
						[was.workspaceValue, now.workspaceValue, vscode.ConfigurationTarget.Workspace],
					];
			for (const [value, current, target] of targets) {
				if (value === undefined || current !== undefined) continue;
				try {
					await newConfig.update(key, value, target);
				} catch {
					// A workspace without a settings file to write: leave it.
				}
			}
		}
	}
}
