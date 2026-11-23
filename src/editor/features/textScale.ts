import * as vscode from 'vscode';
import type { FeatureHostToEditorMessage } from '../../shared/messages';

/**
 * Larger Text / Smaller Text / Reset Text Size, and Wider Page / Narrower Page,
 * for the Live Preview. The size
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

/** What the textScale message carries: the size factor, the font and the page width. */
export function textAppearance(): { scale: number; fontFamily: string; pageWidth: number } {
	return { scale: textScale(), fontFamily: fontFamily(), pageWidth: pageWidth() };
}

// Page width (setting `plus.pageWidth`): the reading column in em of the text,
// 0 for the CSS theme's own width. Wider Page / Narrower Page step through these.
const WIDTH_KEY = 'plus.pageWidth';
const WIDTH_STEPS = [36, 42, 48, 56, 64, 72, 84, 100, 120, 160];
// What the bundled Thai theme sets, stepped from when the setting is 0.
const THEME_WIDTH = 56;

export function pageWidth(): number {
	const value = Number(vscode.workspace.getConfiguration(SECTION).get(WIDTH_KEY, 0));
	if (!Number.isFinite(value) || value <= 0) return 0;
	return Math.min(400, Math.max(20, value));
}

async function setWidth(next: number): Promise<void> {
	await vscode.workspace.getConfiguration(SECTION).update(WIDTH_KEY, next, vscode.ConfigurationTarget.Global);
	vscode.window.setStatusBarMessage(next ? `Live Preview page width ${next} em` : 'Live Preview page width: as the theme sets it', 3000);
}

export function textScale(): number {
	const value = Number(vscode.workspace.getConfiguration(SECTION).get(KEY, 1));
	return Number.isFinite(value) ? Math.min(2, Math.max(0.7, value)) : 1;
}

async function setScale(next: number): Promise<void> {
	await vscode.workspace.getConfiguration(SECTION).update(KEY, next, vscode.ConfigurationTarget.Global);
	vscode.window.setStatusBarMessage(`Live Preview text size ${Math.round(next * 100)}%`, 3000);
}

export function registerTextScale(context: vscode.ExtensionContext, broadcast: (message: FeatureHostToEditorMessage) => void): void {
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
		vscode.commands.registerCommand('liveWriter.plus.pageWider', () => {
			const current = pageWidth() || THEME_WIDTH;
			return setWidth(WIDTH_STEPS.find((s) => s > current) ?? WIDTH_STEPS[WIDTH_STEPS.length - 1]);
		}),
		vscode.commands.registerCommand('liveWriter.plus.pageNarrower', () => {
			const current = pageWidth() || THEME_WIDTH;
			return setWidth([...WIDTH_STEPS].reverse().find((s) => s < current) ?? WIDTH_STEPS[0]);
		}),
		vscode.commands.registerCommand('liveWriter.plus.pageWidthReset', () => setWidth(0)),
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (
				e.affectsConfiguration(`${SECTION}.${KEY}`) ||
				e.affectsConfiguration(`${SECTION}.plus.fontFamily`) ||
				e.affectsConfiguration(`${SECTION}.${WIDTH_KEY}`)
			) {
				broadcast({ type: 'textScale', ...textAppearance() });
			}
		}),
	);
}
