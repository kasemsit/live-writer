import * as vscode from 'vscode';
import * as path from 'node:path';
import type { MenuCommand, FeatureEditorToHostMessage, FeatureHostToEditorMessage } from '../../shared/messages';
import { linkTexts, NOTE_EXT } from '../../shared/links';
import { ZOTERO_LINK } from '../../shared/zotero';
import { listNotes, openWikilink, type EditorSession } from './wikiOpen';
import { texSessionOf } from './tex';

/**
 * The right-click menu of the Live Preview (`webview/context` in package.json).
 *
 * Most items are carried out by the editor webview, which knows what was
 * right-clicked (see webview-editor/features/contextMenu.ts); the commands here
 * forward them and do the parts only the host can: the clipboard, opening
 * files, Claude Code, Obsidian. Every command also works from the command
 * palette, acting on the caret instead of the click.
 */

const WEBVIEW_COMMANDS: Record<string, MenuCommand> = {
	'liveWriter.plus.copyBlockLink': 'copyBlockLink',
	'liveWriter.plus.addReviewComment': 'addReviewComment',
	'liveWriter.plus.copyRichText': 'copyRichText',
	'liveWriter.plus.openAsTextHere': 'openAsTextHere',
	'liveWriter.plus.openLinkBeside': 'openLinkBeside',
	'liveWriter.plus.openInZotero': 'openInZotero',
	'liveWriter.plus.paraphrase': 'paraphrase',
	'liveWriter.plus.rewriteTighten': 'rewrite.tighten',
	'liveWriter.plus.rewriteFormal': 'rewrite.formal',
	'liveWriter.plus.rewriteToEnglish': 'rewrite.toEnglish',
	'liveWriter.plus.rewriteToThai': 'rewrite.toThai',
	'liveWriter.plus.copyTex': 'copyTex',
	'liveWriter.plus.searchGoogle': 'searchGoogle',
	'liveWriter.plus.searchScholar': 'searchScholar',
	'liveWriter.plus.renumberFootnotes': 'renumberFootnotes',
	'liveWriter.plus.table.insertRowAbove': 'table.insertRowAbove',
	'liveWriter.plus.table.insertRowBelow': 'table.insertRowBelow',
	'liveWriter.plus.table.insertColumnLeft': 'table.insertColumnLeft',
	'liveWriter.plus.table.insertColumnRight': 'table.insertColumnRight',
	'liveWriter.plus.table.deleteRow': 'table.deleteRow',
	'liveWriter.plus.table.deleteColumn': 'table.deleteColumn',
	'liveWriter.plus.table.sortAscending': 'table.sortAscending',
	'liveWriter.plus.table.sortDescending': 'table.sortDescending',
	'liveWriter.plus.table.copyTsv': 'table.copyTsv',
};

// Claude Code's own commands, in order of preference: focus its prompt box,
// else open its panel. The selection is already attached by the hook.
const CLAUDE_FOCUS = ['claude-vscode.focus', 'claude-vscode.sidebar.open', 'claude-vscode.editor.openLast'];

function isRange(arg: unknown): arg is { from: number; to: number } {
	return typeof arg === 'object' && arg !== null && typeof (arg as { from?: unknown }).from === 'number' && typeof (arg as { to?: unknown }).to === 'number';
}

export function registerContextMenu(
	context: vscode.ExtensionContext,
	postToActive: (message: FeatureHostToEditorMessage) => boolean,
	activeDocument: () => vscode.Uri | undefined,
): void {
	for (const [id, command] of Object.entries(WEBVIEW_COMMANDS)) {
		context.subscriptions.push(
			vscode.commands.registerCommand(id, (arg?: unknown) => {
				// From the menu, `arg` is VS Code's webview context object; a caller may pass a range instead.
				if (!postToActive({ type: 'runCommand', command, range: isRange(arg) ? arg : undefined })) {
					void vscode.window.showWarningMessage('Open a note in Markdown Live Preview first.');
				}
			}),
		);
	}
	context.subscriptions.push(
		vscode.commands.registerCommand('liveWriter.plus.askClaude', async () => {
			if (!vscode.workspace.getConfiguration('liveWriter').get('plus.shareSelectionWithClaude', true)) {
				void vscode.window.showWarningMessage('Sharing the selection with Claude is turned off (liveWriter.plus.shareSelectionWithClaude).');
				return;
			}
			const available = new Set(await vscode.commands.getCommands(true));
			const command = CLAUDE_FOCUS.find((c) => available.has(c));
			if (!command) {
				void vscode.window.showWarningMessage('Claude Code is not installed in this VS Code.');
				return;
			}
			await vscode.commands.executeCommand(command);
		}),
		vscode.commands.registerCommand('liveWriter.plus.openInObsidian', async () => {
			const uri = activeDocument();
			if (!uri) return;
			// Obsidian's URI scheme opens a note by absolute path, in whichever vault holds it.
			await vscode.env.openExternal(vscode.Uri.parse(`obsidian://open?path=${encodeURIComponent(uri.fsPath)}`));
		}),
	);
}

/** The parts of a context-menu command the webview hands back to the host. */
export async function handleHostAction(session: EditorSession, message: Extract<FeatureEditorToHostMessage, { type: 'hostAction' }>): Promise<void> {
	switch (message.action) {
		case 'copy':
			await vscode.env.clipboard.writeText(message.text);
			vscode.window.setStatusBarMessage(message.notice, 4000);
			return;
		case 'copyBlockLink': {
			const uri = session.getDocument().uri;
			const name = path.basename(uri.fsPath).replace(NOTE_EXT, '');
			const rel = vscode.workspace.asRelativePath(uri, false);
			// The same shortest-unique rule completion uses: the bare name unless another note shares it.
			const notes = await listNotes();
			const all = notes.some((n) => n.path === rel) ? notes : [...notes, { name, path: rel }];
			const target = linkTexts(all)[all.findIndex((n) => n.path === rel)] ?? name;
			const link = `[[${target}#${message.anchor}]]`;
			await vscode.env.clipboard.writeText(link);
			vscode.window.setStatusBarMessage(`Copied ${link}`, 4000);
			return;
		}
		case 'openAsText': {
			const uri = session.getDocument().uri.toString();
			await vscode.commands.executeCommand('liveWriter.openWithSource');
			const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === uri);
			if (!editor) return;
			const at = new vscode.Position(Math.max(0, message.line - 1), 0);
			editor.selection = new vscode.Selection(at, at);
			editor.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.InCenter);
			return;
		}
		case 'openBeside':
			if (message.href.startsWith('wiki:')) await openWikilink(session, message.href.slice('wiki:'.length), true);
			else if (message.href.startsWith('tex:')) await texSessionOf(session)?.open(message.href, true);
			else await vscode.env.openExternal(vscode.Uri.parse(message.href));
			return;
		case 'openUrl':
			// Only the two search pages this menu offers.
			if (/^https:\/\/(www\.google\.com\/search|scholar\.google\.com\/scholar)\?q=/.test(message.url)) {
				await vscode.env.openExternal(vscode.Uri.parse(message.url));
			}
			return;
		case 'openZotero':
			if (ZOTERO_LINK.test(message.url)) await vscode.env.openExternal(vscode.Uri.parse(message.url));
			return;
		case 'notify':
			if (message.error) void vscode.window.showWarningMessage(message.message);
			else vscode.window.setStatusBarMessage(message.message, 4000);
			return;
	}
}
