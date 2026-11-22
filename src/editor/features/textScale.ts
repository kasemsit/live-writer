import * as vscode from 'vscode';
import type { PlusHostToEditorMessage } from '../../shared/messages';

/**
 * Larger Text / Smaller Text / Reset Text Size for the Live Preview. The size
 * is the setting `liveWriter.plus.textScale`, a factor over the theme's own
 * size, so it is remembered across sessions (and synced with Settings Sync)
 * and applies to every open preview at once.
 */

const SECTION = 'liveWriter';
const KEY = 'plus.textScale';
const STEPS = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.45, 1.6, 1.8, 2];

/** The reader's font for the text (setting `plus.fontFamily`), '' for the theme's; characters that could end the CSS rule are dropped. */
export function fontFamily(): string {
	return String(vscode.workspace.getConfiguration(SECTION).get('plus.fontFamily', '') ?? '').replace(/[{}<>;\\]/g, '').trim();
}

/** What the plusTextScale message carries: the size factor and the font. */
export function textAppearance(): { scale: number; fontFamily: string } {
	return { scale: textScale(), fontFamily: fontFamily() };
}

export function textScale(): number {
	const value = Number(vscode.workspace.getConfiguration(SECTION).get(KEY, 1));
	return Number.isFinite(value) ? Math.min(2, Math.max(0.7, value)) : 1;
}

async function setScale(next: number): Promise<void> {
	await vscode.workspace.getConfiguration(SECTION).update(KEY, next, vscode.ConfigurationTarget.Global);
	vscode.window.setStatusBarMessage(`Live Preview text size ${Math.round(next * 100)}%`, 3000);
}

export function registerTextScale(context: vscode.ExtensionContext, broadcast: (message: PlusHostToEditorMessage) => void): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('liveWriter.plus.textLarger', () => {
			const current = textScale();
			return setScale(STEPS.find((s) => s > current + 1e-9) ?? STEPS[STEPS.length - 1]);
		}),
		vscode.commands.registerCommand('liveWriter.plus.textSmaller', () => {
			const current = textScale();
			return setScale([...STEPS].reverse().find((s) => s < current - 1e-9) ?? STEPS[0]);
		}),
		vscode.commands.registerCommand('liveWriter.plus.textReset', () => setScale(1)),
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration(`${SECTION}.${KEY}`) || e.affectsConfiguration(`${SECTION}.plus.fontFamily`)) {
				broadcast({ type: 'plusTextScale', ...textAppearance() });
			}
		}),
	);
}
