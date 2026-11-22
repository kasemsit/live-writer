import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { rewritePrompt, type RewriteMode } from '../../shared/rewrite';

/**
 * Paraphrase with Claude — the selected passage rewritten
 * by Claude Code run headless (`claude -p`), no tools, no session kept, none of
 * the user's settings or hooks, in a temporary folder so no project's
 * CLAUDE.md is read. The webview shows the result to replace or copy.
 */

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
