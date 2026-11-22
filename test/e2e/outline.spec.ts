import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { postToWebview } from './harness';

// The Outline view's webview on its own (dist/webview-outline.js).
const ROOT = join(__dirname, '../..');

async function mountOutline(page: Page): Promise<void> {
	await page.setContent(`<!DOCTYPE html><html><head><style>${readFileSync(join(ROOT, 'media/webview-outline-style.css'), 'utf8')}</style></head>
<body><div id="mlp-outline-root"></div><script>window.__posted=[];window.acquireVsCodeApi=()=>({postMessage:m=>window.__posted.push(m),getState:()=>null,setState:()=>{}});</script>
<script>${readFileSync(join(ROOT, 'dist/webview-outline.js'), 'utf8')}</script></body></html>`);
}

test('the outline marks the heading the caret is under, and follows it', async ({ page }) => {
	await mountOutline(page);
	const headings = [
		{ level: 1, text: 'Introduction', line: 1 },
		{ level: 2, text: 'Data', line: 10 },
		{ level: 2, text: 'Results', line: 30 },
	];
	await postToWebview(page, { type: 'update', headings });
	await postToWebview(page, { type: 'activeLine', line: 12 });
	await expect(page.locator('.mlp-outline-active')).toHaveText('Data');
	await postToWebview(page, { type: 'activeLine', line: 31 });
	await expect(page.locator('.mlp-outline-active')).toHaveText('Results');
	await expect(page.locator('.mlp-outline-active')).toHaveCount(1);
});
