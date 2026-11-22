import * as vscode from 'vscode';
import type { HostToEditorMessage, PlusQuartoProject } from '../../shared/messages';
import { parseBib, type BibEntry } from '../../shared/bib';
import { labelsFromQuartoYaml, quartoCitationPlan } from '../../shared/quarto';
import { readText } from './files';
import type { PlusSession } from './wikiOpen';

/**
 * md-live-preview-plus: what a document takes from its Quarto project.
 *
 * - The labels the nearest `_quarto.yml` sets (`crossref-fig-title`, …), for
 *   any document under it.
 * - For a `.qmd`: the bibliography, CSL style and language its citations are
 *   printed with — its own front matter over the project's. A `.md` keeps
 *   linking `[@key]` to the `@key` note, as in a notes vault.
 *
 * Sent when the editor asks, and again whenever `_quarto.yml`, a bibliography
 * file or the document's front matter changes.
 */

export function isQuartoDocument(document: vscode.TextDocument): boolean {
	return document.languageId === 'quarto' || /\.qmd$/i.test(document.uri.path);
}

/** The `_quarto.yml` nearest above `document`, searching no higher than its workspace folder. */
async function findProjectFile(document: vscode.Uri): Promise<vscode.Uri | null> {
	const root = vscode.workspace.getWorkspaceFolder(document)?.uri;
	if (!root) return null;
	for (let dir = vscode.Uri.joinPath(document, '..'); ; dir = vscode.Uri.joinPath(dir, '..')) {
		const file = vscode.Uri.joinPath(dir, '_quarto.yml');
		try {
			await vscode.workspace.fs.stat(file);
			return file;
		} catch {
			// Not here; look one folder up.
		}
		if (dir.path === root.path || dir.path.length <= root.path.length) return null;
	}
}

/** The project as the document sees it, and the files to watch for changes. */
export async function readQuartoProject(document: vscode.TextDocument): Promise<{ project: PlusQuartoProject; watched: vscode.Uri[] }> {
	const projectFile = await findProjectFile(document.uri);
	const yaml = projectFile ? ((await readText(projectFile)) ?? '') : '';
	const labels = labelsFromQuartoYaml(yaml);
	const watched = projectFile ? [projectFile] : [];
	if (!isQuartoDocument(document)) return { project: { labels, citations: null, quarto: false }, watched };

	const plan = quartoCitationPlan(yaml, document.getText());
	if (!plan) return { project: { labels, citations: null, quarto: true }, watched };
	const docDir = vscode.Uri.joinPath(document.uri, '..');
	const base = plan.base === 'project' && projectFile ? vscode.Uri.joinPath(projectFile, '..') : docDir;

	const bib: Record<string, BibEntry> = {};
	for (const name of plan.files) {
		const uri = vscode.Uri.joinPath(base, name);
		watched.push(uri);
		const text = await readText(uri);
		if (text) Object.assign(bib, parseBib(text));
	}
	return { project: { labels, citations: { style: plan.style, lang: plan.lang, bib }, quarto: true }, watched };
}

const watching = new WeakMap<PlusSession, vscode.Disposable>();

/** Sends the project to the editor now, and again when one of its files changes. */
export function watchQuartoProject(session: PlusSession, post: (message: HostToEditorMessage) => void): void {
	watching.get(session)?.dispose();
	let disposed = false;
	let run = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let watchers: vscode.Disposable[] = [];
	const schedule = () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => void send(), 400);
	};
	const send = async () => {
		const mine = ++run;
		const document = session.getDocument();
		const { project, watched } = await readQuartoProject(document);
		// A slower, older read must not overwrite a newer one.
		if (disposed || mine !== run) return;
		post({ type: 'plusQuartoProject', project });
		watchers.forEach((w) => w.dispose());
		watchers = watched.map((uri) => {
			const name = uri.path.slice(uri.path.lastIndexOf('/') + 1);
			const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.joinPath(uri, '..'), name));
			const subs = [watcher.onDidChange(schedule), watcher.onDidCreate(schedule), watcher.onDidDelete(schedule)];
			return new vscode.Disposable(() => [watcher, ...subs].forEach((d) => d.dispose()));
		});
	};
	// The front matter is in the document itself: a saved edit there may name another bibliography.
	const saved = isQuartoDocument(session.getDocument())
		? vscode.workspace.onDidSaveTextDocument((doc) => doc.uri.toString() === session.getDocument().uri.toString() && schedule())
		: undefined;
	watching.set(
		session,
		new vscode.Disposable(() => {
			disposed = true;
			if (timer) clearTimeout(timer);
			watchers.forEach((w) => w.dispose());
			saved?.dispose();
			watching.delete(session);
		}),
	);
	void send();
}

export function stopWatchingQuartoProject(session: PlusSession): void {
	watching.get(session)?.dispose();
}
