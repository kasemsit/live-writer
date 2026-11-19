import { expect, test, type Page } from '@playwright/test';
import { mountEditor, postToWebview } from './harness';

/**
 * md-live-preview-plus: the LaTeX Live Preview — what a `.tex` file looks
 * like, and what clicking it does, in the shipped bundle and stylesheet.
 */

const DOC = String.raw`\documentclass{article}
\usepackage{amsmath}
\newcommand{\R}{\mathbb{R}}
\begin{document}
\section{Introduction}
\label{sec:intro}
We use \textbf{bold} and \emph{italic} text, $x \in \R$, and cite~\cite{smith2020,jones2021}.
See Fig.~\ref{fig:a} and~\eqref{eq:e}. Pages 3--5 are QQquoted'' 50\% % a note
\begin{equation}
  E = mc^2 \label{eq:e}
\end{equation}
\begin{enumerate}
  \item First
  \item Second
\end{enumerate}
\begin{table}[t]
\caption{Results}
\label{tab:r}
\centering
\begin{tabular}{lr}
\toprule
System & Score \\
\midrule
Baseline & $0.47$ \\
Final & \textbf{0.06} \\
\bottomrule
\end{tabular}
\end{table}
Last line.
\end{document}
`.replace('QQ', '``'); // a template literal cannot hold LaTeX's opening quotes

const CONTEXT = {
	build: '1',
	labels: { 'sec:intro': 'I', 'fig:a': '3', 'eq:e': '2', 'tab:r': '4' },
	cites: { smith2020: '1', jones2021: '2' },
	bib: {
		smith2020: { key: 'smith2020', type: 'article', authorShort: 'Smith', authors: 'Smith, J.', title: 'A Paper', year: '2020', venue: 'J' },
	},
	macros: {},
	root: '',
};

async function mountTex(page: Page, text = DOC): Promise<void> {
	await mountEditor(page, text, 'en', 'latex');
	await postToWebview(page, { type: 'plusTexContext', context: CONTEXT });
}

/** Text of the editor line whose source starts with `prefix` (lines are matched by their rendered text). */
const content = (page: Page) => page.locator('.cm-content');

test.describe('LaTeX Live Preview', () => {
	test('folds the preamble and opens with nothing shown as source', async ({ page }) => {
		await mountTex(page);
		await expect(page.locator('.mlp-tex-fold')).toHaveText('Preamble · 4 lines');
		await expect(content(page)).not.toContainText('\\usepackage');
	});

	test('draws a heading without its markup', async ({ page }) => {
		await mountTex(page);
		const heading = page.locator('.cm-line.mlp-line-h2');
		await expect(heading).toHaveText('Introduction');
	});

	test('draws text styles, math, typography and comments', async ({ page }) => {
		await mountTex(page);
		await expect(page.locator('.mlp-strong').first()).toHaveText('bold');
		await expect(page.locator('.mlp-em').first()).toHaveText('italic');
		await expect(page.locator('.cm-line .mlp-math .katex').first()).toBeVisible();
		const text = await content(page).innerText();
		expect(text).toContain('3–5');
		expect(text).toContain('“quoted”');
		expect(text).toContain('50%');
		expect(text).not.toContain('\\textbf');
		await expect(page.locator('.mlp-tex-comment')).toHaveText('% a note');
	});

	test('numbers citations, references and equations from the last build', async ({ page }) => {
		await mountTex(page);
		await expect(page.locator('.mlp-tex-cite')).toHaveText('[1], [2]');
		await expect(page.locator('.mlp-tex-ref').first()).toHaveText('3');
		await expect(page.locator('.mlp-tex-ref').nth(1)).toHaveText('(2)');
		await expect(page.locator('.mlp-tex-eqno')).toHaveText('(2)');
		await expect(page.locator('.mlp-tex-caption-label')).toHaveText('Table 4. ');
	});

	test('marks a reference the last build does not know', async ({ page }) => {
		await mountTex(page, 'See \\ref{nowhere}.');
		await expect(page.locator('.mlp-tex-ref')).toHaveText('??');
		await expect(page.locator('.mlp-tex-ref')).toHaveClass(/mlp-tex-chip-missing/);
	});

	test('draws list markers', async ({ page }) => {
		await mountTex(page);
		await expect(page.locator('.mlp-tex-item')).toHaveText(['1.', '2.']);
		await expect(page.locator('.cm-line.mlp-tex-list-1')).toHaveCount(2);
	});

	test('draws a tabular with its rules', async ({ page }) => {
		await mountTex(page);
		const table = page.locator('table.mlp-tex-table');
		await expect(table.locator('tr')).toHaveCount(3);
		await expect(table.locator('tr').first().locator('td').first()).toHaveClass(/mlp-tex-rule-thick/);
		await expect(table.locator('td.mlp-tex-td-r').last()).toHaveText('0.06');
		await expect(table.locator('.mlp-strong')).toHaveText('0.06');
		await expect(table.locator('.katex')).toHaveCount(1);
	});

	test('a click on a table cell shows the source with the caret in that cell', async ({ page }) => {
		await mountTex(page);
		await page.locator('table.mlp-tex-table td', { hasText: 'Baseline' }).click();
		await expect(page.locator('table.mlp-tex-table')).toHaveCount(0);
		await expect(content(page)).toContainText('Baseline & $0.47$');
		const head = await page.evaluate(() => {
			const sel = window.getSelection();
			return sel?.anchorNode?.textContent ?? '';
		});
		expect(head).toContain('Baseline');
	});

	test('a click on a citation shows its source', async ({ page }) => {
		await mountTex(page);
		await page.locator('.mlp-tex-cite').click();
		await expect(page.locator('.mlp-tex-cite')).toHaveCount(0);
		await expect(content(page)).toContainText('\\cite{smith2020,jones2021}');
	});

	test('the caret on a heading line shows its markup', async ({ page }) => {
		await mountTex(page);
		await page.locator('.cm-line.mlp-line-h2').click();
		await expect(page.locator('.cm-line.mlp-line-h2')).toHaveText('\\section{Introduction}');
	});

	test('Ctrl+B wraps the selection in \\textbf', async ({ page }) => {
		await mountTex(page, 'one word here');
		await page.locator('.cm-content').click();
		await page.keyboard.press('Home');
		await page.keyboard.press('Shift+End');
		await page.keyboard.press('Control+b');
		// While the caret is inside, the markup shows; once it leaves, the text is drawn bold.
		await expect(content(page)).toContainText('\\textbf{one word here}');
		await page.keyboard.press('End');
		await page.keyboard.type(' more');
		await expect(page.locator('.mlp-strong')).toHaveText('one word here');
		await expect(content(page)).toHaveText('one word here more');
	});

	test('\\includegraphics asks the host for the file and shows it', async ({ page }) => {
		await mountTex(page, 'Before\n\\includegraphics[width=0.5\\linewidth]{figures/plot}\nAfter');
		const request = await page.waitForFunction(() =>
			(window as unknown as { __posted: { type: string; path?: string; requestId?: number }[] }).__posted.find((m) => m.type === 'plusTexAsset'),
		);
		const asked = (await request.jsonValue()) as { path: string; requestId: number };
		expect(asked.path).toBe('figures/plot');
		const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
		await postToWebview(page, { type: 'plusTexAssetResult', requestId: asked.requestId, asset: { status: 'image', src: pixel, name: 'figures/plot.png' } });
		await expect(page.locator('.mlp-tex-graphic img')).toHaveAttribute('src', pixel);
	});

	test.describe('TikZ pictures', () => {
		const DOC = 'Text -- here.\n\\begin{tikzpicture}\n\\draw (a) -- (b) node {\\textbf{x}};\n\\end{tikzpicture}\nEnd.';
		const pictureRequest = async (page: Page) => {
			const request = await page.waitForFunction(() =>
				(window as unknown as { __posted: { type: string; lines?: number[]; requestId?: number }[] }).__posted.find((m) => m.type === 'plusTexPicture'),
			);
			return (await request.jsonValue()) as { lines: number[]; requestId: number };
		};

		test('show the last build\'s drawing, asked for by the lines inside them', async ({ page }) => {
			await mountTex(page, DOC);
			const asked = await pictureRequest(page);
			expect(asked.lines).toEqual([3, 2]);
			const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
			await postToWebview(page, { type: 'plusTexPictureResult', requestId: asked.requestId, picture: { status: 'image', src: pixel, note: 'main.pdf, p. 1', stale: true } });
			await expect(page.locator('.mlp-tex-picture img')).toHaveAttribute('src', pixel);
			await expect(page.locator('.mlp-tex-picture-stale')).toHaveText('last build');
			await expect(page.locator('.mlp-tex-picture-src')).toHaveCount(0);
			expect(await content(page).innerText()).toContain('Text – here.');
		});

		test('without a build, keep their source as written, with a note', async ({ page }) => {
			await mountTex(page, DOC);
			const asked = await pictureRequest(page);
			await postToWebview(page, { type: 'plusTexPictureResult', requestId: asked.requestId, picture: { status: 'missing', src: null, note: 'No build of this document found.', stale: false } });
			await expect(page.locator('.mlp-tex-picture-note')).toHaveText('No build of this document found.');
			await expect(page.locator('.mlp-tex-picture-src')).toContainText('\\draw (a) -- (b) node {\\textbf{x}};');
		});

		test('a click shows the drawing code as source: no typography, no hidden markup', async ({ page }) => {
			await mountTex(page, DOC);
			await page.locator('.mlp-tex-picture').click();
			const text = await content(page).innerText();
			expect(text).toContain('\\draw (a) -- (b) node {\\textbf{x}};');
			await expect(page.locator('.cm-line.mlp-tex-code')).toHaveCount(3);
			await expect(page.locator('.mlp-tex-picture')).toHaveCount(0);
		});
	});

	for (const command of ['Vref', 'subref']) {
		test(`\\${command} completes labels, as \\ref does`, async ({ page }) => {
			await mountTex(page, '\\label{fig:own}\nSee ');
			await page.locator('.cm-line').last().click();
			await page.keyboard.press('End');
			await page.keyboard.type(`\\${command}{fig`);
			// The last build's labels and this file's own.
			const items = page.locator('.cm-tooltip-autocomplete li');
			await expect(items).toHaveCount(2);
			await expect(items.filter({ hasText: 'fig:a' })).toContainText('→ 3');
			await expect(items.filter({ hasText: 'fig:own' })).toContainText('not yet built');
		});
	}

	test('\\input is a link to the file', async ({ page }) => {
		await mountTex(page, '\\input{sections/intro}\n\nText');
		const chip = page.locator('.mlp-tex-file');
		await expect(chip).toHaveText('sections/intro.tex');
		await chip.click();
		const posted = await page.evaluate(() => (window as unknown as { __posted: { type: string; href?: string }[] }).__posted.filter((m) => m.type === 'openLink'));
		expect(posted).toEqual([{ type: 'openLink', href: 'tex:input:sections/intro' }]);
	});
});

test('a Markdown document still gets the Markdown editor', async ({ page }) => {
	await mountEditor(page, 'intro\n\n# Title\n\n\\section{not latex}');
	await expect(page.locator('.cm-line.mlp-line-h1')).toHaveText('Title');
	await expect(page.locator('.mlp-tex-fold')).toHaveCount(0);
	await expect(page.locator('.cm-content')).toContainText('\\section{not latex}');
});
