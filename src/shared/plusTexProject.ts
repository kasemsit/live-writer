import { isPathInside } from './pathContainment';
import { readArgs, scanTex, type TexScan } from './plusTexScanner';

/**
 * md-live-preview-plus: what a LaTeX file says about the project around it —
 * the root it names, the files it pulls in, its bibliographies and graphics
 * folders — for the host, which finds the root file and its build from them
 * (and watches the build's folders).
 */

/** `% !TEX root = ../main.tex` in the first lines, as LaTeX Workshop and TeXShop read it. */
export function magicRoot(text: string): string | null {
	const head = text.split('\n', 20);
	for (const line of head) {
		const m = /^\s*%\s*!\s*TEX\s+root\s*=\s*(.+?)\s*$/i.exec(line);
		if (m) return m[1];
	}
	return null;
}

/** The files a root pulls in with `\input`, `\include`, `\subfile` (as written, without `.tex`). */
export function inputsOf(text: string, scan: TexScan = scanTex(text)): string[] {
	const out: string[] = [];
	for (const cmd of scan.commands) {
		if (cmd.name !== 'input' && cmd.name !== 'include' && cmd.name !== 'subfile' && cmd.name !== 'includeonly') continue;
		const args = readArgs(text, cmd.to, 'm');
		if (!args) continue;
		const arg = args.args[0]!;
		for (const part of text.slice(arg.from, arg.to).split(',')) {
			const name = part.trim().replace(/\.tex$/, '');
			if (name) out.push(name);
		}
	}
	return out;
}

/** `\bibliography{a,b}` and `\addbibresource{x.bib}`: the bibliography files named, each with `.bib`. */
export function bibFilesOf(text: string, scan: TexScan = scanTex(text)): string[] {
	const out: string[] = [];
	for (const cmd of scan.commands) {
		if (cmd.name !== 'bibliography' && cmd.name !== 'addbibresource') continue;
		const args = readArgs(text, cmd.to, 'om');
		if (!args) continue;
		const arg = args.args[1]!;
		for (const part of text.slice(arg.from, arg.to).split(',')) {
			const name = part.trim();
			if (name) out.push(name.endsWith('.bib') ? name : `${name}.bib`);
		}
	}
	return out;
}

/** `\graphicspath{{figures/}{img/}}`: the folders, as written. */
export function graphicsPathOf(text: string, scan: TexScan = scanTex(text)): string[] {
	for (const cmd of scan.commands) {
		if (cmd.name !== 'graphicspath') continue;
		const args = readArgs(text, cmd.to, 'm');
		if (!args) continue;
		const arg = args.args[0]!;
		return [...text.slice(arg.from, arg.to).matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
	}
	return [];
}

/**
 * `folders` without repeats and without those inside another, in order: the
 * folders to watch for a rebuild, since a watch on a folder sees its
 * subfolders too. `pathOf` gives each one's file-system path.
 */
export function outermostFolders<T>(folders: readonly T[], pathOf: (folder: T) => string, caseInsensitive = false): T[] {
	const paths = folders.map(pathOf);
	const inside = (i: number, j: number) => isPathInside(paths[j], paths[i], caseInsensitive);
	// Left out: a folder inside another, or the same as one before it.
	return folders.filter((_, i) => !paths.some((_path, j) => j !== i && inside(i, j) && (j < i || !inside(j, i))));
}
