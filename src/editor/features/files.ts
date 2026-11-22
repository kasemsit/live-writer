import * as vscode from 'vscode';

/** md-live-preview-plus: reading the project files the previews draw from (.bib, .aux, _quarto.yml). */

/** Larger files are not read: no bibliography or project file is this big. */
const MAX_READ = 4 * 1024 * 1024;

export async function exists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

/** A file's text — from its open editor when there is one, so unsaved edits count — or null. */
export async function readText(uri: vscode.Uri): Promise<string | null> {
	const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
	if (open) return open.getText();
	try {
		const stat = await vscode.workspace.fs.stat(uri);
		if (stat.size > MAX_READ) return null;
		return new TextDecoder('utf-8').decode(await vscode.workspace.fs.readFile(uri));
	} catch {
		return null;
	}
}
