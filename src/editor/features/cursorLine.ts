import * as vscode from 'vscode';

/** The caret's line in each Live Writer editor, as its webview reports it (for the Outline view). */
const emitter = new vscode.EventEmitter<{ uri: vscode.Uri; line: number }>();
export const onCursorLine = emitter.event;

export function reportCursorLine(uri: vscode.Uri, line: number): void {
	emitter.fire({ uri, line });
}
