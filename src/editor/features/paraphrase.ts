import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { REWRITE_MODES, rewritePrompt, type RewriteMode } from '../../shared/rewrite';

/**
 * Rewrite with Claude — the selected passage rewritten
 * by Claude Code run headless (`claude -p`), no tools, no session kept, none of
 * the user's settings or hooks, in a temporary folder so no project's
 * CLAUDE.md is read. The webview shows the result to replace or copy.
 *
 * A mode can be given a command of its own instead
 * (`liveWriter.plus.rewriteCommands`): any program that reads the passage on
 * stdin and writes the rewrite on stdout. If it fails, Claude does the rewrite
 * and the card says why.
 */

export interface RewriteResult {
	text: string;
	error: string;
	/** Who wrote `text`: 'Claude', or the command's label. */
	engine: string;
	/** Why the engine is not the one asked for, when it is not. */
	note: string;
}

const COMMAND_TIMEOUT_MS = 300_000;

/** The command configured for `mode`, or null for Claude. */
function commandFor(mode: RewriteMode): string | null {
	const commands = vscode.workspace.getConfiguration('liveWriter').get<Record<string, unknown>>('plus.rewriteCommands', {}) ?? {};
	const command = commands[mode];
	return typeof command === 'string' && command.trim() ? command.trim() : null;
}

function commandLabel(): string {
	return String(vscode.workspace.getConfiguration('liveWriter').get('plus.rewriteCommandLabel', '') ?? '').trim() || 'rewrite command';
}

/**
 * Context keys for the *Rewrite with Command* submenu: shown only when a
 * command is set, and only the modes that have one.
 */
export function registerRewriteCommandContext(context: vscode.ExtensionContext): void {
	const update = () => {
		let any = false;
		for (const mode of Object.keys(REWRITE_MODES) as RewriteMode[]) {
			const has = commandFor(mode) !== null;
			any ||= has;
			void vscode.commands.executeCommand('setContext', `liveWriter.rewriteCommand.${mode}`, has);
		}
		void vscode.commands.executeCommand('setContext', 'liveWriter.hasRewriteCommand', any);
	};
	update();
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('liveWriter.plus.rewriteCommands')) update();
		}),
	);
}

/** Runs `command` in a shell, the passage on stdin; its stdout, or why it failed. */
export function runRewriteCommand(command: string, text: string, mode: RewriteMode): Promise<{ text: string; error: string; warning: string }> {
	return new Promise((resolve) => {
		const child = spawn(command, { shell: true, cwd: os.homedir(), env: { ...process.env, LIVEWRITER_MODE: mode }, stdio: ['pipe', 'pipe', 'pipe'] });
		let out = '';
		let err = '';
		const timer = setTimeout(() => child.kill(), COMMAND_TIMEOUT_MS);
		child.stdout.on('data', (d) => (out += String(d)));
		child.stderr.on('data', (d) => (err += String(d)));
		child.on('error', (e) => {
			clearTimeout(timer);
			resolve({ text: '', error: e.message, warning: '' });
		});
		child.on('close', (code, signal) => {
			clearTimeout(timer);
			const result = out.trim();
			const lines = err.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
			// A command may succeed and still warn on stderr, e.g. that its output looks summarised.
			const warning = lines.filter((l) => /warning/i.test(l)).join(' ').slice(0, 300);
			if (code === 0 && result) return resolve({ text: result, error: '', warning });
			// The last error-looking line of stderr says most: progress lines come before it.
			const reason = lines.reverse().find((l) => /error|expired|denied|not found|failed|invalid/i.test(l)) ?? lines[0];
			resolve({ text: '', error: (reason ?? (signal ? 'it took too long and was stopped' : code === 0 ? 'it printed nothing' : `it exited with ${code}`)).slice(0, 200), warning: '' });
		});
		child.stdin.on('error', () => undefined);
		child.stdin.end(text);
	});
}

/**
 * The rewrite for `mode`, by Claude (*Rewrite with Claude*) or by the mode's
 * command (*Rewrite with Command*). A command that fails, or is not set,
 * leaves the rewrite to Claude, and the card says why.
 */
export async function rewrite(text: string, mode: RewriteMode, useCommand = false): Promise<RewriteResult> {
	const label = commandLabel();
	let note = '';
	if (useCommand) {
		const command = commandFor(mode);
		if (command) {
			const result = await runRewriteCommand(command, text, mode);
			if (result.text) return { text: result.text, error: '', engine: label, note: result.warning };
			note = `${label} failed (${result.error}); Claude rewrote it instead.`;
		} else {
			note = `No command is set for this mode (liveWriter.plus.rewriteCommands); Claude rewrote it instead.`;
		}
	}
	const result = await paraphrase(text, mode);
	return { ...result, engine: 'Claude', note: result.text ? note : '', error: result.text ? '' : [note, result.error].filter(Boolean).join(' ') };
}

/** The `claude` command: on PATH, else where the installer puts it. */
function claudeCommand(): string {
	return process.env.PATH?.split(path.delimiter).some((d) => d && fs.existsSync(path.join(d, 'claude')))
		? 'claude'
		: path.join(os.homedir(), '.local', 'bin', 'claude');
}

export function paraphrase(text: string, mode: RewriteMode = 'polish'): Promise<{ text: string; error: string }> {
	return new Promise((resolve) => {
		const args = ['-p', '--tools', '', '--no-session-persistence', '--setting-sources', 'project', '--output-format', 'text', '--system-prompt', rewritePrompt(mode)];
		// liveWriter.plus.claudeModel: a model name or alias (sonnet, opus); empty leaves Claude Code's default.
		const model = String(vscode.workspace.getConfiguration('liveWriter').get('plus.claudeModel', '') ?? '').trim();
		if (/^[\w.:-]+$/.test(model)) args.push('--model', model);
		const child = spawn(claudeCommand(), args, { cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
		let out = '';
		let err = '';
		const timer = setTimeout(() => child.kill(), 180_000);
		child.stdout.on('data', (d) => (out += String(d)));
		child.stderr.on('data', (d) => (err += String(d)));
		child.on('error', () => {
			clearTimeout(timer);
			resolve({ text: '', error: 'Claude Code (the claude command) was not found.' });
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			const result = out.trim();
			resolve(code === 0 && result ? { text: result, error: '' } : { text: '', error: (err.trim() || result || `claude exited with ${code}`).slice(0, 300) });
		});
		child.stdin.end(text);
	});
}
