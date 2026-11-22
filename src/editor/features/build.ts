import * as vscode from 'vscode';
import { hasLatexWorkshop, withTextEditor } from './momentary';

/**
 * Build the LaTeX document, and open its PDF, with LaTeX Workshop: the same
 * recipes (xelatex, pdflatex, latexmk …), the same problems list and viewer as
 * building from its own editor.
 *
 * LaTeX Workshop finds the root from the active text editor in the first
 * moments of a build and then builds on its own, so the momentary text tab is
 * closed once it has had that time; the build carries on.
 */

const ROOT_FOUND_MS = 1000;

interface Recipe {
	name: string;
	tools?: (string | { name?: string })[];
}

/** LaTeX Workshop's recipes for this file, as its settings list them. */
export function recipesFor(uri: vscode.Uri): Recipe[] {
	const recipes = vscode.workspace.getConfiguration('latex-workshop', uri).get<Recipe[]>('latex.recipes', []);
	return Array.isArray(recipes) ? recipes.filter((r) => r && typeof r.name === 'string') : [];
}

/** Builds with LaTeX Workshop's default recipe (`latex.recipe.default`), or with `recipe`. */
export async function buildLatex(document: vscode.TextDocument, recipe?: string): Promise<void> {
	if (!(await hasLatexWorkshop('latex-workshop.build', 'Building'))) return;
	await withTextEditor(document, async () => {
		const started = recipe ? vscode.commands.executeCommand('latex-workshop.recipes', recipe) : vscode.commands.executeCommand('latex-workshop.build');
		await Promise.race([Promise.resolve(started).catch(() => undefined), new Promise((resolve) => setTimeout(resolve, ROOT_FOUND_MS))]);
	});
}

/** Asks which recipe, then builds with it. */
export async function buildWithRecipe(document: vscode.TextDocument): Promise<void> {
	const recipes = recipesFor(document.uri);
	if (!recipes.length) {
		void vscode.window.showWarningMessage('LaTeX Workshop has no recipes (latex-workshop.latex.recipes).');
		return;
	}
	const picked = await vscode.window.showQuickPick(
		recipes.map((r) => ({
			label: r.name,
			description: (r.tools ?? []).map((t) => (typeof t === 'string' ? t : (t?.name ?? ''))).filter(Boolean).join(' → '),
		})),
		{ placeHolder: 'Build with which LaTeX recipe?' },
	);
	if (picked) await buildLatex(document, picked.label);
}

/** Opens the build's PDF in LaTeX Workshop's viewer. */
export async function viewPdf(document: vscode.TextDocument): Promise<void> {
	if (!(await hasLatexWorkshop('latex-workshop.view', 'Opening the PDF'))) return;
	await withTextEditor(document, () => vscode.commands.executeCommand('latex-workshop.view'));
}

export function registerBuild(context: vscode.ExtensionContext, activeDocument: () => vscode.Uri | undefined): void {
	const onDocument = (fn: (document: vscode.TextDocument) => Promise<void>) => async () => {
		const uri = activeDocument();
		if (!uri || !/\.tex$/i.test(uri.path)) {
			void vscode.window.showWarningMessage('Open a .tex file in Live Writer first.');
			return;
		}
		await fn(await vscode.workspace.openTextDocument(uri));
	};
	context.subscriptions.push(
		vscode.commands.registerCommand('liveWriter.plus.build', onDocument((d) => buildLatex(d))),
		vscode.commands.registerCommand('liveWriter.plus.buildWithRecipe', onDocument(buildWithRecipe)),
		vscode.commands.registerCommand('liveWriter.plus.viewPdf', onDocument(viewPdf)),
	);
}
