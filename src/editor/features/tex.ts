import * as vscode from 'vscode';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { HostToEditorMessage, PlusTexAsset, PlusTexContext, PlusTexPicture } from '../../shared/messages';
import { cropOf, largestBox, parseSynctexView, type SynctexBox } from '../../shared/synctex';
import { mergeAux, parseAux, type AuxData } from '../../shared/texAux';
import { parseBib, type BibEntry } from '../../shared/bib';
import { extractMacros } from '../../shared/texMacros';
import { bibFilesOf, graphicsPathOf, inputsOf, magicRoot, outermostFolders } from '../../shared/texProject';
import { scanTex } from '../../shared/texScanner';
import { isPathInside } from '../../shared/pathContainment';
import { exists, readText } from './files';

/**
 * md-live-preview-plus: the host side of the LaTeX Live Preview.
 *
 * - Finds the root file (`% !TEX root`, the file itself when it has
 *   `\documentclass`, or the nearby root that `\input`s it).
 * - Reads what the last build wrote (`<root>.aux`: the numbers of labels and
 *   citations), the bibliography, and the root preamble's macros, and sends
 *   them to the webview — again whenever the build rewrites them.
 * - Resolves `\includegraphics` targets as LaTeX does, converting a PDF
 *   figure's first page to PNG with `pdftoppm` when it is installed.
 * - Opens the files `\input` names, in the Live Preview.
 *
 * Nothing here compiles: the numbers are the user's own last build.
 */

const VIEW_TYPE = 'liveWriter.editor';
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'];
const GRAPHIC_EXTS = ['', '.pdf', '.png', '.jpg', '.jpeg', '.svg', '.eps', '.gif', '.webp'];

export function isTexDocument(document: vscode.TextDocument): boolean {
	return document.languageId === 'latex' || document.languageId === 'tex' || /\.tex$/i.test(document.uri.path);
}

const DOCUMENTCLASS = /^[^%\n]*\\documentclass/m;

/** The root file of `document` (see the module comment). */
export async function findRoot(document: vscode.TextDocument): Promise<vscode.Uri> {
	const text = document.getText();
	const dir = vscode.Uri.joinPath(document.uri, '..');
	const magic = magicRoot(text);
	if (magic) {
		const uri = vscode.Uri.joinPath(dir, magic);
		if (await exists(uri)) return uri;
	}
	if (DOCUMENTCLASS.test(text)) return document.uri;
	const workspace = vscode.workspace.getWorkspaceFolder(document.uri);
	let fallback: vscode.Uri | undefined;
	let current = dir;
	for (let up = 0; up < 3; up++) {
		let entries: [string, vscode.FileType][] = [];
		try {
			entries = await vscode.workspace.fs.readDirectory(current);
		} catch {
			entries = [];
		}
		for (const [name, type] of entries) {
			if (type !== vscode.FileType.File || !/\.tex$/i.test(name)) continue;
			const candidate = vscode.Uri.joinPath(current, name);
			if (candidate.toString() === document.uri.toString()) continue;
			const candText = await readText(candidate);
			if (!candText || !DOCUMENTCLASS.test(candText)) continue;
			const rel = path.posix.relative(path.posix.dirname(candidate.path), document.uri.path).replace(/\.tex$/i, '');
			if (inputsOf(candText).some((p) => p.replace(/^\.\//, '') === rel)) return candidate;
			fallback ??= candidate;
		}
		if (workspace && current.toString() === workspace.uri.toString()) break;
		const parent = vscode.Uri.joinPath(current, '..');
		if (parent.toString() === current.toString()) break;
		current = parent;
	}
	return fallback ?? document.uri;
}

/**
 * The folders LaTeX Workshop may have written the `.aux` to, most likely
 * first. The root's own folder is always one of them.
 */
function auxDirs(root: vscode.Uri): vscode.Uri[] {
	const rootDir = vscode.Uri.joinPath(root, '..');
	const dirs = [rootDir];
	const outDir = vscode.workspace.getConfiguration('latex-workshop', root).get<string>('latex.outDir');
	if (outDir && outDir !== '%DIR%' && outDir !== './') {
		const base = path.posix.basename(root.path).replace(/\.tex$/i, '');
		const workspace = vscode.workspace.getWorkspaceFolder(root);
		const resolved = outDir
			.replace(/%DIR%/g, rootDir.path)
			.replace(/%DOCFILE%/g, base)
			.replace(/%DOC%/g, root.path.replace(/\.tex$/i, ''))
			.replace(/%WORKSPACE_FOLDER%/g, workspace?.uri.path ?? rootDir.path);
		// Normalized (`%DIR%/../build`), since a file watcher takes the folder as given.
		dirs.unshift(path.posix.isAbsolute(resolved) ? root.with({ path: path.posix.normalize(resolved) }) : vscode.Uri.joinPath(rootDir, resolved));
	}
	dirs.push(vscode.Uri.joinPath(rootDir, 'out'), vscode.Uri.joinPath(rootDir, 'build'));
	return dirs;
}

async function readAux(root: vscode.Uri): Promise<{ data: AuxData; file: vscode.Uri | null }> {
	const name = path.posix.basename(root.path).replace(/\.tex$/i, '.aux');
	for (const dir of auxDirs(root)) {
		const file = vscode.Uri.joinPath(dir, name);
		const text = await readText(file);
		if (text === null) continue;
		const top = parseAux(text);
		const parts = [top];
		for (const inc of top.includes.slice(0, 200)) {
			const incText = await readText(vscode.Uri.joinPath(dir, inc));
			if (incText) parts.push(parseAux(incText));
		}
		return { data: mergeAux(parts), file };
	}
	return { data: { labels: {}, cites: {}, includes: [] }, file: null };
}

/** Runs a command; its output, or null when it is missing or fails. */
function run(command: string, args: string[], timeout: number): Promise<string | null> {
	return new Promise((resolve) => execFile(command, args, { timeout, maxBuffer: 1 << 20 }, (err, stdout) => resolve(err ? null : String(stdout))));
}

export class TexSession implements vscode.Disposable {
	private root: vscode.Uri | undefined;
	private graphicsPath: string[] = [];
	/** The `.aux` the last build wrote; its PDF and SyncTeX file sit beside it. */
	private auxFile: vscode.Uri | null = null;
	private watchers: vscode.Disposable[] = [];
	private watchedDirs = '';
	private timer: ReturnType<typeof setTimeout> | undefined;
	private disposed = false;
	/** Counts sendContext's runs, so that a run a newer one has overtaken can tell, and stop. */
	private runs = 0;

	constructor(
		private readonly document: vscode.TextDocument,
		private readonly post: (message: HostToEditorMessage) => void,
		private readonly asWebviewUri: (uri: vscode.Uri) => string,
		private readonly figureCache: vscode.Uri,
	) {}

	private rootDir(): vscode.Uri {
		return vscode.Uri.joinPath(this.root ?? this.document.uri, '..');
	}

	/**
	 * Works out the context and sends it: after every `init` (finding the root
	 * again), and when the build rewrites its files (reusing the root found).
	 */
	async sendContext(findRootAgain = true): Promise<void> {
		// A rebuild can start a run while an earlier one is still reading, and the
		// earlier one may finish last: only the latest run changes the session or posts.
		const run = ++this.runs;
		const overtaken = () => this.disposed || run !== this.runs;
		const root = !findRootAgain && this.root ? this.root : await findRoot(this.document);
		if (overtaken()) return;
		this.root = root;
		const rootText = root.toString() === this.document.uri.toString() ? this.document.getText() : ((await readText(root)) ?? '');
		const rootScan = scanTex(rootText);
		const { data, file: auxFile } = await readAux(root);
		const build = auxFile ? await vscode.workspace.fs.stat(auxFile).then((s) => String(s.mtime), () => '') : '';
		if (overtaken()) return;
		this.auxFile = auxFile;
		const rootDir = this.rootDir();
		const docDir = vscode.Uri.joinPath(this.document.uri, '..');
		this.graphicsPath = graphicsPathOf(rootText, rootScan);

		// Bibliography: the files the root (or this file) names; failing that, any .bib beside the root.
		const bib: Record<string, BibEntry> = {};
		const names = [...new Set([...bibFilesOf(rootText, rootScan), ...bibFilesOf(this.document.getText())])];
		const bibUris: vscode.Uri[] = [];
		for (const name of names) {
			for (const base of [rootDir, docDir]) {
				const uri = vscode.Uri.joinPath(base, name);
				if (await exists(uri)) {
					bibUris.push(uri);
					break;
				}
			}
		}
		if (!bibUris.length) {
			try {
				for (const [name, type] of await vscode.workspace.fs.readDirectory(rootDir)) {
					if (type === vscode.FileType.File && name.endsWith('.bib')) bibUris.push(vscode.Uri.joinPath(rootDir, name));
				}
			} catch {
				// No folder listing: no bibliography.
			}
		}
		for (const uri of bibUris) {
			const text = await readText(uri);
			if (text) Object.assign(bib, parseBib(text));
		}

		// Macros: the root's preamble, and local files it \input s there.
		const preamble = rootScan.hasPreamble ? rootText.slice(0, rootScan.bodyFrom) : '';
		let macros = extractMacros(preamble);
		for (const input of inputsOf(preamble).slice(0, 10)) {
			const file = /\.\w+$/.test(input) ? input : `${input}.tex`;
			const text = await readText(vscode.Uri.joinPath(rootDir, file));
			if (text) macros = { ...extractMacros(text), ...macros };
		}

		const context: PlusTexContext = {
			labels: data.labels,
			cites: data.cites,
			bib,
			macros,
			root: root.toString() === this.document.uri.toString() ? '' : vscode.workspace.asRelativePath(root, false),
			build,
		};
		if (overtaken()) return;
		this.post({ type: 'plusTexContext', context });
		this.watch(root);
	}

	/**
	 * Re-sends the context when the build rewrites `.aux` or a `.bib` changes:
	 * in the root's folder and every folder readAux looks in (LaTeX Workshop's
	 * outDir may lie outside it), each watched once.
	 */
	private watch(root: vscode.Uri): void {
		const dirs = outermostFolders(auxDirs(root), (dir) => dir.fsPath, process.platform === 'win32');
		const key = dirs.map((dir) => dir.toString()).join('\n');
		if (this.watchedDirs === key) return;
		this.watchers.forEach((w) => w.dispose());
		this.watchers = [];
		this.watchedDirs = key;
		const schedule = () => {
			if (this.timer) clearTimeout(this.timer);
			this.timer = setTimeout(() => void this.sendContext(false), 400);
		};
		for (const dir of dirs) {
			const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(dir, '**/*.{aux,bib}'));
			this.watchers.push(watcher, watcher.onDidChange(schedule), watcher.onDidCreate(schedule), watcher.onDidDelete(schedule));
		}
		// A root edited in another tab changes macros and \graphicspath.
		this.watchers.push(
			vscode.workspace.onDidSaveTextDocument((doc) => {
				if (this.root && doc.uri.toString() === this.root.toString() && doc.uri.toString() !== this.document.uri.toString()) schedule();
			}),
		);
	}

	/** Whether `uri` is somewhere the preview may read: the root's folder tree or a workspace folder. */
	private allowed(uri: vscode.Uri): boolean {
		const windows = process.platform === 'win32';
		const roots = [this.rootDir(), ...(vscode.workspace.workspaceFolders ?? []).map((f) => f.uri)];
		return roots.some((r) => r.scheme === uri.scheme && isPathInside(r.fsPath, uri.fsPath, windows));
	}

	/** Finds the file `\includegraphics{name}` means, beside the root (and \graphicspath), then beside this file. */
	async resolveAsset(name: string): Promise<PlusTexAsset> {
		const missing: PlusTexAsset = { status: 'missing', src: null, name };
		if (!name || name.includes('\0')) return missing;
		const bases = [this.rootDir(), vscode.Uri.joinPath(this.document.uri, '..')];
		const dirs = ['', ...this.graphicsPath];
		const hasExt = /\.[A-Za-z0-9]{2,4}$/.test(name);
		for (const base of bases) {
			for (const dir of dirs) {
				for (const ext of hasExt ? [''] : GRAPHIC_EXTS) {
					const uri = path.posix.isAbsolute(name) ? base.with({ path: name + ext }) : vscode.Uri.joinPath(base, dir, name + ext);
					if (!this.allowed(uri) || !(await exists(uri))) continue;
					const lower = uri.path.toLowerCase();
					const label = vscode.workspace.asRelativePath(uri, false);
					if (IMAGE_EXTS.some((e) => lower.endsWith(e))) return { status: 'image', src: this.asWebviewUri(uri), name: label };
					if (lower.endsWith('.pdf')) {
						const png = await this.pdfToPng(uri);
						return png ? { status: 'image', src: this.asWebviewUri(png), name: label } : { status: 'unsupported', src: null, name: label };
					}
					return { status: 'unsupported', src: null, name: label };
				}
			}
		}
		return missing;
	}

	/**
	 * A `tikzpicture` (on `lines` of this file, 1-based) as the last build drew
	 * it: SyncTeX says where those lines landed in the PDF, and pdftoppm cuts
	 * that box out (cached by PDF time and box). Nothing is compiled.
	 */
	async resolvePicture(lines: number[]): Promise<PlusTexPicture> {
		const none = (status: PlusTexPicture['status'], note: string): PlusTexPicture => ({ status, src: null, note, stale: false });
		const aux = this.auxFile;
		if (!aux || aux.scheme !== 'file' || this.document.uri.scheme !== 'file') return none('missing', 'No build of this document found (its .aux and .pdf).');
		const pdf = aux.with({ path: aux.path.replace(/\.aux$/i, '.pdf') });
		let pdfTime: number;
		try {
			pdfTime = (await vscode.workspace.fs.stat(pdf)).mtime;
		} catch {
			return none('missing', `No ${path.basename(pdf.fsPath)} beside the build's .aux.`);
		}
		const boxes: SynctexBox[] = [];
		for (const line of lines.slice(0, 4)) {
			const output = await run('synctex', ['view', '-i', `${line}:1:${this.document.uri.fsPath}`, '-o', pdf.fsPath], 10_000);
			if (output === null) return none('unsupported', 'SyncTeX (the synctex command) is needed to show pictures from the build.');
			boxes.push(...parseSynctexView(output));
			if (largestBox(boxes)) break;
		}
		const box = largestBox(boxes);
		if (!box) return none('missing', 'Not in the last build: build with SyncTeX on (LaTeX Workshop does by default).');
		const dpi = 144;
		const crop = cropOf(box, dpi);
		const key = createHash('sha1').update(`${pdf.fsPath}|${pdfTime}|${box.page}|${crop.x},${crop.y},${crop.width},${crop.height}`).digest('hex').slice(0, 16);
		const out = vscode.Uri.joinPath(this.figureCache, `tikz-${key}.png`);
		if (!(await exists(out))) {
			await vscode.workspace.fs.createDirectory(this.figureCache);
			const args = ['-png', '-r', String(dpi), '-f', String(box.page), '-l', String(box.page), '-x', String(crop.x), '-y', String(crop.y), '-W', String(crop.width), '-H', String(crop.height), '-singlefile', pdf.fsPath, out.fsPath.replace(/\.png$/, '')];
			if ((await run('pdftoppm', args, 20_000)) === null || !(await exists(out))) return none('unsupported', 'pdftoppm (poppler) is needed to show pictures from the build.');
		}
		const docTime = await vscode.workspace.fs.stat(this.document.uri).then((s) => s.mtime, () => 0);
		return {
			status: 'image',
			src: this.asWebviewUri(out),
			note: `${vscode.workspace.asRelativePath(pdf, false)}, p. ${box.page}`,
			stale: this.document.isDirty || docTime > pdfTime,
		};
	}

	/** The first page of a PDF figure as PNG (cached by path, size and time), or null without pdftoppm. */
	private async pdfToPng(pdf: vscode.Uri): Promise<vscode.Uri | null> {
		if (pdf.scheme !== 'file') return null;
		try {
			const stat = await vscode.workspace.fs.stat(pdf);
			const key = createHash('sha1').update(`${pdf.fsPath}|${stat.size}|${stat.mtime}`).digest('hex').slice(0, 16);
			const out = vscode.Uri.joinPath(this.figureCache, `${key}.png`);
			if (await exists(out)) return out;
			await vscode.workspace.fs.createDirectory(this.figureCache);
			const base = out.fsPath.replace(/\.png$/, '');
			await new Promise<void>((resolve, reject) =>
				execFile('pdftoppm', ['-png', '-r', '110', '-f', '1', '-l', '1', '-singlefile', pdf.fsPath, base], { timeout: 20_000 }, (err) =>
					err ? reject(err) : resolve(),
				),
			);
			return (await exists(out)) ? out : null;
		} catch {
			return null;
		}
	}

	/** Follows `tex:input:path` (in the Live Preview) and `tex:file:path` (in the text editor). */
	async open(href: string, beside = false): Promise<void> {
		const m = /^tex:(input|file):(.*)$/.exec(href);
		if (!m) return;
		const [, kind, target] = m;
		const names = kind === 'input' && !/\.\w+$/.test(target) ? [`${target}.tex`, target] : [target];
		const bases = [this.rootDir(), vscode.Uri.joinPath(this.document.uri, '..')];
		for (const base of bases) {
			for (const name of names) {
				const uri = vscode.Uri.joinPath(base, name);
				if (!(await exists(uri))) continue;
				const column = beside ? vscode.ViewColumn.Beside : undefined;
				if (kind === 'input' && /\.tex$/i.test(uri.path)) await vscode.commands.executeCommand('vscode.openWith', uri, VIEW_TYPE, column);
				else await vscode.commands.executeCommand('vscode.open', uri, column);
				return;
			}
		}
		void vscode.window.showWarningMessage(vscode.l10n.t('Not found: {0}', target));
	}

	dispose(): void {
		this.disposed = true;
		if (this.timer) clearTimeout(this.timer);
		this.watchers.forEach((w) => w.dispose());
	}
}

// The TexSession of each editor session, for the message router.
const sessions = new WeakMap<object, TexSession>();

export function registerTexSession(owner: object, session: TexSession): vscode.Disposable {
	sessions.set(owner, session);
	return new vscode.Disposable(() => {
		sessions.delete(owner);
		session.dispose();
	});
}

export function texSessionOf(owner: object): TexSession | undefined {
	return sessions.get(owner);
}
