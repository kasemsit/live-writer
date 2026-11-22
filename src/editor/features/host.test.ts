import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import * as vscode from 'vscode';
import { fake, workspace as fakeWorkspace } from '../../test-support/vscode';

// The extension-host side, against the in-memory `vscode` (src/test-support/vscode.ts).
// External programs (claude, synctex, pdftoppm) are replaced per test.
const proc = vi.hoisted(() => ({
	spawn: null as null | ((cmd: string, args: string[], opts: { cwd?: string }) => unknown),
	execFile: null as null | ((cmd: string, args: string[]) => { err: Error | null; stdout: string }),
}));
vi.mock('node:child_process', () => ({
	spawn: (cmd: string, args: string[], opts: { cwd?: string }) => proc.spawn!(cmd, args, opts),
	execFile: (cmd: string, args: string[], _opts: unknown, cb: (err: Error | null, stdout: string) => void) => {
		const r = proc.execFile!(cmd, args);
		setTimeout(() => cb(r.err, r.stdout), 0);
	},
}));

import { zoteroLinks } from './zotero';
import { readQuartoProject, stopWatchingQuartoProject, watchQuartoProject } from './quartoProject';
import { migrateSettings } from './migrate';
import { caywUrl, pickCitation } from './cite';
import { paraphrase } from './paraphrase';
import { TexSession } from './tex';
import { showInPdf } from './showInPdf';

const folder = (path: string) => ({ uri: vscode.Uri.file(path), name: 'ws', index: 0 });
const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 403, json: async () => body, text: async () => String(body) });

beforeEach(() => {
	fake.reset();
	vi.unstubAllGlobals();
});
afterEach(() => vi.useRealTimers());

describe('zoteroLinks', () => {
	const doc = vscode.Uri.file('/ws/paper.md');

	it('finds the item by citation key in Zotero’s local API, and its PDF', async () => {
		vi.stubGlobal('fetch', async (url: string) =>
			url.includes('/children')
				? json([{ key: 'WRGRQ66N', data: { itemType: 'attachment', contentType: 'application/pdf' } }])
				: json([{ key: '3FFMRC3X', data: { itemType: 'conferencePaper', citationKey: 'abhijeet2024' } }]),
		);
		expect(await zoteroLinks(doc, 'abhijeet2024')).toEqual({
			pdf: 'zotero://open-pdf/library/items/WRGRQ66N',
			item: 'zotero://select/library/items/3FFMRC3X',
			note: '',
		});
	});

	it('falls back to the keys a vault note records when Zotero does not know the key', async () => {
		workspaceWith('/vault');
		fake.file('/vault/References/@short2023.md', '---\nzotero_key: 4UR8D7SA\npdf_key: GAFX6F8J\n---\n');
		vi.stubGlobal('fetch', async (url: string) => (url.includes('better-bibtex') ? json({ error: { message: 'short2023 not found' } }) : json([])));
		expect(await zoteroLinks(vscode.Uri.file('/vault/Papers/x.md'), 'short2023')).toEqual({
			pdf: 'zotero://open-pdf/library/items/GAFX6F8J',
			item: 'zotero://select/library/items/4UR8D7SA',
			note: '',
		});
	});

	it('says whether Zotero is not running or simply lacks the key', async () => {
		vi.stubGlobal('fetch', async () => {
			throw new Error('ECONNREFUSED');
		});
		expect((await zoteroLinks(doc, 'x2020')).note).toMatch(/not running/);
		vi.stubGlobal('fetch', async () => json([]));
		expect((await zoteroLinks(doc, 'x2020')).note).toBe('x2020 is not in your Zotero library.');
	});
});

function workspaceWith(path: string) {
	fakeWorkspace.workspaceFolders = [folder(path)];
}

describe('Quarto project', () => {
	beforeEach(() => {
		workspaceWith('/ws');
		fake.file('/ws/_quarto.yml', 'lang: th\ncsl: apa.csl\nbibliography: refs.bib\nlanguage:\n  crossref-fig-title: "รูปที่"\n');
		fake.file('/ws/refs.bib', '@misc{chen2015, author = {Chen, Daqing}, title = {Online Retail}, year = {2015}}');
	});

	it('a .qmd takes labels, bibliography, style and language from _quarto.yml', async () => {
		const { project, watched } = await readQuartoProject(fake.document('/ws/ch/a.qmd', '# A', 'quarto') as never);
		expect(project.quarto).toBe(true);
		expect(project.labels['crossref-fig-title']).toBe('รูปที่');
		expect(project.citations?.style).toBe('apa');
		expect(project.citations?.lang).toBe('th');
		expect(Object.keys(project.citations!.bib)).toEqual(['chen2015']);
		expect(watched.map((u) => u.path)).toEqual(['/ws/_quarto.yml', '/ws/refs.bib']);
	});

	it('a Markdown note gets the labels only, and no Pandoc rules', async () => {
		const { project } = await readQuartoProject(fake.document('/ws/notes/n.md', '# N') as never);
		expect(project).toMatchObject({ citations: null, quarto: false });
		expect(project.labels['crossref-fig-title']).toBe('รูปที่');
	});

	it('sends the project again when a watched file changes, and stops when the session closes', async () => {
		vi.useFakeTimers();
		const doc = fake.document('/ws/ch/a.qmd', '# A', 'quarto');
		const session = { getDocument: () => doc } as never;
		const posted: unknown[] = [];
		watchQuartoProject(session, (m) => posted.push(m));
		await vi.waitFor(() => expect(posted).toHaveLength(1));
		fake.file('/ws/refs.bib', '@misc{lee2019, author = {Lee, Ann}, title = {T}, year = {2019}}');
		fake.change('/ws/refs.bib');
		await vi.advanceTimersByTimeAsync(450);
		await vi.waitFor(() => expect(posted).toHaveLength(2));
		expect(Object.keys((posted[1] as { project: { citations: { bib: object } } }).project.citations.bib)).toEqual(['lee2019']);
		stopWatchingQuartoProject(session);
		expect(fake.watchers.filter((w) => !w.disposed)).toHaveLength(0);
		expect(fake.saveListeners).toHaveLength(0);
	});
});

describe('migrateSettings', () => {
	it('copies settings made under the former name, without overwriting new ones', async () => {
		fake.settings.set(`${vscode.ConfigurationTarget.Global}:mdLivePreview.plus.fontFamily`, 'Sarabun');
		fake.settings.set(`${vscode.ConfigurationTarget.Global}:mdLivePreview.plus.textScale`, 1.2);
		fake.settings.set(`${vscode.ConfigurationTarget.Global}:liveWriter.plus.textScale`, 1.45);
		await migrateSettings();
		expect(fake.settings.get(`${vscode.ConfigurationTarget.Global}:liveWriter.plus.fontFamily`)).toBe('Sarabun');
		expect(fake.settings.get(`${vscode.ConfigurationTarget.Global}:liveWriter.plus.textScale`)).toBe(1.45);
	});
});

describe('Insert Citation from Zotero', () => {
	it('asks Better BibTeX for Pandoc citations, or for \\cite in LaTeX', async () => {
		expect(caywUrl(vscode.Uri.file('/p/a.qmd'))).toMatch(/format=pandoc&brackets=1$/);
		expect(caywUrl(vscode.Uri.file('/p/a.md'))).toMatch(/format=pandoc&brackets=1$/);
		expect(caywUrl(vscode.Uri.file('/p/main.tex'))).toMatch(/format=latex$/);
		vi.stubGlobal('fetch', async () => ({ ok: true, text: async () => '[@a; @b]\n' }));
		expect(await pickCitation(vscode.Uri.file('/p/a.md'))).toBe('[@a; @b]');
	});
});

describe('paraphrase', () => {
	function child(stdout: string, code: number, stderr = '') {
		const c = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: { end: vi.fn() }, kill: vi.fn() });
		setTimeout(() => {
			if (stdout) c.stdout.emit('data', stdout);
			if (stderr) c.stderr.emit('data', stderr);
			c.emit('close', code);
		}, 0);
		return c;
	}

	it('runs claude -p with no tools, no session and no user settings, outside any project', async () => {
		let seen: { args: string[]; cwd?: string } | null = null;
		proc.spawn = (_cmd, args, opts) => {
			seen = { args, cwd: opts.cwd };
			return child('Another approach.\n', 0);
		};
		expect(await paraphrase('An alternative.')).toEqual({ text: 'Another approach.', error: '' });
		const { args, cwd } = seen!;
		expect(args.slice(0, 3)).toEqual(['-p', '--tools', '']);
		expect(args).toContain('--no-session-persistence');
		expect(args[args.indexOf('--setting-sources') + 1]).toBe('project');
		expect(cwd).toBe((await import('node:os')).tmpdir());
	});

	it('each mode gives its own instruction, and liveWriter.plus.claudeModel picks the model', async () => {
		let args: string[] = [];
		proc.spawn = (_cmd, a) => {
			args = a;
			return child('แปลแล้ว', 0);
		};
		fake.settings.set(`${vscode.ConfigurationTarget.Global}:liveWriter.plus.claudeModel`, 'sonnet');
		await paraphrase('Text.', 'toThai');
		const prompt = args[args.indexOf('--system-prompt') + 1];
		expect(prompt).toMatch(/^Translate the passage into formal academic Thai\./);
		expect(prompt).toMatch(/citations such as \[@key\]/);
		expect(args.slice(-2)).toEqual(['--model', 'sonnet']);
		fake.settings.set(`${vscode.ConfigurationTarget.Global}:liveWriter.plus.claudeModel`, 'sonnet; rm -rf ~');
		await paraphrase('Text.', 'tighten');
		expect(args).not.toContain('--model');
		expect(args[args.indexOf('--system-prompt') + 1]).toMatch(/^Make the passage shorter/);
	});

	it('reports a failure instead of inserting nothing', async () => {
		proc.spawn = () => child('', 1, 'Not logged in');
		expect(await paraphrase('x')).toEqual({ text: '', error: 'Not logged in' });
	});
});

describe('TikZ pictures from the last build', () => {
	const SYNCTEX = 'SyncTeX result begin\nOutput:/ws/main.pdf\nPage:8\nx:43\ny:424\nh:43.44\nv:424.53\nW:488.69\nH:239.24\nbefore:\nSyncTeX result end\n';

	function session() {
		workspaceWith('/ws');
		const doc = fake.document('/ws/tikz/arch.tex', '\\begin{tikzpicture}\n\\draw;\n\\end{tikzpicture}', 'latex');
		const s = new TexSession(doc as never, () => undefined, (u) => `webview:${u.path}`, vscode.Uri.file('/cache'));
		return s;
	}

	it('cuts the box SyncTeX gives out of the build’s PDF', async () => {
		fake.file('/ws/main.pdf', '%PDF', 5000);
		fake.file('/ws/tikz/arch.tex', '', 4000);
		const calls: string[][] = [];
		proc.execFile = (cmd, args) => {
			calls.push([cmd, ...args]);
			if (cmd === 'pdftoppm') fake.file(`${args[args.length - 1]}.png`, 'png');
			return { err: null, stdout: cmd === 'synctex' ? SYNCTEX : '' };
		};
		const s = session();
		(s as unknown as { auxFile: vscode.Uri }).auxFile = vscode.Uri.file('/ws/main.aux');
		const picture = await s.resolvePicture([2, 1]);
		expect(picture).toMatchObject({ status: 'image', note: 'main.pdf, p. 8', stale: false });
		expect(picture.src).toMatch(/^webview:\/cache\/tikz-[0-9a-f]{16}\.png$/);
		expect(calls[0].slice(0, 4)).toEqual(['synctex', 'view', '-i', '2:1:/ws/tikz/arch.tex']);
		const crop = calls.find((c) => c[0] === 'pdftoppm')!;
		expect(crop.slice(crop.indexOf('-f'), crop.indexOf('-f') + 4)).toEqual(['-f', '8', '-l', '8']);
	});

	it('says what is missing: a build, or the synctex command', async () => {
		const s = session();
		expect((await s.resolvePicture([2])).status).toBe('missing');
		fake.file('/ws/main.pdf', '%PDF');
		(s as unknown as { auxFile: vscode.Uri }).auxFile = vscode.Uri.file('/ws/main.aux');
		proc.execFile = () => ({ err: Object.assign(new Error('spawn synctex ENOENT'), { code: 'ENOENT' }), stdout: '' });
		expect(await s.resolvePicture([2])).toMatchObject({ status: 'unsupported', note: expect.stringMatching(/synctex/) });
	});

	it('marks a picture the file changed after', async () => {
		fake.file('/ws/main.pdf', '%PDF', 1000);
		fake.file('/ws/tikz/arch.tex', '', 9000);
		proc.execFile = (cmd, args) => {
			if (cmd === 'pdftoppm') fake.file(`${args[args.length - 1]}.png`, 'png');
			return { err: null, stdout: cmd === 'synctex' ? SYNCTEX : '' };
		};
		const s = session();
		(s as unknown as { auxFile: vscode.Uri }).auxFile = vscode.Uri.file('/ws/main.aux');
		expect((await s.resolvePicture([2])).stale).toBe(true);
	});
});

describe('Show in PDF', () => {
	it('starts LaTeX Workshop\'s SyncTeX search from the line, then closes the momentary text tab', async () => {
		fake.commandList = ['latex-workshop.synctexto'];
		const doc = fake.document('/ws/sections/intro.tex', 'a\nb\nc', 'latex');
		await showInPdf(doc as never, 3);
		expect(fake.shown[0]).toMatchObject({ path: '/ws/sections/intro.tex', options: { viewColumn: 1, preview: true } });
		expect(fake.executed).toEqual([['latex-workshop.synctexto', 2, '/ws/sections/intro.tex'], ['workbench.action.closeActiveEditor']]);
	});

	it('says LaTeX Workshop is needed when it is not installed', async () => {
		await showInPdf(fake.document('/ws/a.tex', 'x', 'latex') as never, 1);
		expect(fake.shown).toHaveLength(0);
		expect(fake.warnings[0]).toMatch(/LaTeX Workshop/);
	});
});
