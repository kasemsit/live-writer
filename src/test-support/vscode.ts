/**
 * A small in-memory stand-in for the `vscode` module, for unit tests of the
 * extension-host code (vitest aliases `vscode` to this file). It keeps files,
 * settings, watchers and listeners in memory, and `fake` lets a test set them
 * up and look at what the code under test did.
 */

import * as posix from 'node:path/posix';

export class Uri {
	constructor(
		readonly scheme: string,
		readonly path: string,
		private readonly raw?: string,
	) {}
	static file(p: string): Uri {
		return new Uri('file', posix.normalize(p));
	}
	static parse(s: string): Uri {
		const m = /^([a-z][\w+.-]*):\/\/(.*)$/i.exec(s);
		return m ? new Uri(m[1], `/${m[2]}`, s) : Uri.file(s);
	}
	static joinPath(base: Uri, ...parts: string[]): Uri {
		return new Uri(base.scheme, posix.join(base.path, ...parts));
	}
	get fsPath(): string {
		return this.path;
	}
	with(change: { path?: string; scheme?: string }): Uri {
		return new Uri(change.scheme ?? this.scheme, change.path ?? this.path);
	}
	toString(): string {
		return this.raw ?? `${this.scheme}://${this.path}`;
	}
}

export class Disposable {
	constructor(private readonly fn?: () => void) {}
	dispose(): void {
		this.fn?.();
	}
}

export class EventEmitter<T> {
	private listeners: ((value: T) => void)[] = [];
	event = (listener: (value: T) => void): Disposable => {
		this.listeners.push(listener);
		return new Disposable(() => (this.listeners = this.listeners.filter((l) => l !== listener)));
	};
	fire(value: T): void {
		this.listeners.forEach((l) => l(value));
	}
}

export class Position {
	constructor(
		readonly line: number,
		readonly character: number,
	) {}
}

export class Range {
	constructor(
		readonly start: Position,
		readonly end: Position,
	) {}
}

export class TabInputText {
	constructor(readonly uri: Uri) {}
}
export class TabInputWebview {
	constructor(readonly viewType: string) {}
}
export class TabInputCustom {
	constructor(
		readonly uri: Uri,
		readonly viewType: string,
	) {}
}

type Handler<T> = (value: T) => void;
function event<T>(list: Handler<T>[]) {
	return (h: Handler<T>) => {
		list.push(h);
		return new Disposable(() => list.splice(list.indexOf(h), 1));
	};
}

export class RelativePattern {
	constructor(
		readonly base: Uri,
		readonly pattern: string,
	) {}
}

export enum FileType {
	File = 1,
	Directory = 2,
}

export enum ConfigurationTarget {
	Global = 1,
	Workspace = 2,
	WorkspaceFolder = 3,
}

export enum ProgressLocation {
	Window = 10,
}

type Listener = () => void;

interface FakeWatcher {
	pattern: RelativePattern;
	listeners: Listener[];
	disposed: boolean;
}

interface FakeDocument {
	uri: Uri;
	languageId: string;
	isDirty: boolean;
	getText(): string;
}

/** What tests set up and inspect. */
export const fake = {
	files: new Map<string, { text: string; mtime: number }>(),
	settings: new Map<string, unknown>(), // `${target}:${section}.${key}`
	watchers: [] as FakeWatcher[],
	saveListeners: [] as ((doc: FakeDocument) => void)[],
	opened: [] as string[],
	executed: [] as unknown[][],
	shown: [] as { path: string; options: unknown }[],
	commandList: [] as string[],
	tabs: [] as { input: unknown; group?: unknown }[],
	activeTab: undefined as { input: unknown } | undefined,
	closed: [] as unknown[],
	tabListeners: [] as Handler<{ opened: unknown[]; closed: unknown[]; changed: unknown[] }>[],
	groupListeners: [] as Handler<unknown>[],
	selectionListeners: [] as Handler<unknown>[],
	warnings: [] as string[],
	reset(): void {
		this.files.clear();
		this.settings.clear();
		this.watchers = [];
		this.saveListeners = [];
		this.opened = [];
		this.executed = [];
		this.shown = [];
		this.commandList = [];
		this.tabs = [];
		this.activeTab = undefined;
		this.closed = [];
		// Emptied in place: the events hold on to these arrays.
		this.tabListeners.length = 0;
		this.groupListeners.length = 0;
		this.selectionListeners.length = 0;
		window.activeTextEditor = undefined;
		this.warnings = [];
		workspace.workspaceFolders = [];
		workspace.textDocuments = [];
	},
	file(path: string, text: string, mtime = 1000): void {
		this.files.set(posix.normalize(path), { text, mtime });
	},
	document(path: string, text: string, languageId = 'markdown', isDirty = false): FakeDocument {
		return { uri: Uri.file(path), languageId, isDirty, getText: () => text };
	},
	/** Fires the change listeners of every live watcher on `path`. */
	change(path: string): void {
		for (const w of this.watchers) {
			if (!w.disposed && posix.join(w.pattern.base.path, w.pattern.pattern) === posix.normalize(path)) w.listeners.forEach((l) => l());
		}
	},
};

function notFound(uri: Uri): Error {
	return Object.assign(new Error(`ENOENT ${uri.path}`), { code: 'FileNotFound' });
}

function setting(target: ConfigurationTarget, section: string, key: string): unknown {
	return fake.settings.get(`${target}:${section}.${key}`);
}

export const workspace = {
	workspaceFolders: [] as { uri: Uri; name: string; index: number }[],
	textDocuments: [] as FakeDocument[],
	getWorkspaceFolder(uri: Uri) {
		return workspace.workspaceFolders.find((f) => uri.path === f.uri.path || uri.path.startsWith(`${f.uri.path}/`));
	},
	asRelativePath(uri: Uri): string {
		const folder = workspace.getWorkspaceFolder(uri);
		return folder ? posix.relative(folder.uri.path, uri.path) : uri.path;
	},
	async findFiles(glob: string): Promise<Uri[]> {
		const name = glob.replace(/^\*\*\//, '').replace(/\\/g, '');
		return [...fake.files.keys()].filter((p) => posix.basename(p) === name).map((p) => Uri.file(p));
	},
	fs: {
		async stat(uri: Uri) {
			const f = fake.files.get(uri.path);
			if (f) return { type: FileType.File, size: f.text.length, mtime: f.mtime, ctime: 0 };
			if ([...fake.files.keys()].some((p) => p.startsWith(`${uri.path}/`))) return { type: FileType.Directory, size: 0, mtime: 0, ctime: 0 };
			throw notFound(uri);
		},
		async readFile(uri: Uri): Promise<Uint8Array> {
			const f = fake.files.get(uri.path);
			if (!f) throw notFound(uri);
			return new TextEncoder().encode(f.text);
		},
		async readDirectory(uri: Uri): Promise<[string, FileType][]> {
			const names = new Set<string>();
			for (const p of fake.files.keys()) if (posix.dirname(p) === uri.path) names.add(posix.basename(p));
			return [...names].map((n) => [n, FileType.File]);
		},
		async createDirectory(): Promise<void> {},
		async writeFile(uri: Uri, content: Uint8Array): Promise<void> {
			fake.files.set(uri.path, { text: new TextDecoder().decode(content), mtime: Date.now() });
		},
	},
	getConfiguration(section: string) {
		return {
			get<T>(key: string, fallback?: T): T {
				return (setting(ConfigurationTarget.Global, section, key) as T) ?? (fallback as T);
			},
			inspect(key: string) {
				return {
					key: `${section}.${key}`,
					globalValue: setting(ConfigurationTarget.Global, section, key),
					workspaceValue: setting(ConfigurationTarget.Workspace, section, key),
					workspaceFolderValue: setting(ConfigurationTarget.WorkspaceFolder, section, key),
				};
			},
			async update(key: string, value: unknown, target: ConfigurationTarget): Promise<void> {
				fake.settings.set(`${target}:${section}.${key}`, value);
			},
		};
	},
	createFileSystemWatcher(pattern: RelativePattern) {
		const w: FakeWatcher = { pattern, listeners: [], disposed: false };
		fake.watchers.push(w);
		const on = (l: Listener) => {
			w.listeners.push(l);
			return new Disposable();
		};
		return { onDidChange: on, onDidCreate: on, onDidDelete: on, dispose: () => (w.disposed = true) };
	},
	onDidSaveTextDocument(l: (doc: FakeDocument) => void): Disposable {
		fake.saveListeners.push(l);
		return new Disposable(() => (fake.saveListeners = fake.saveListeners.filter((x) => x !== l)));
	},
};

export const window = {
	activeTextEditor: undefined as unknown,
	tabGroups: {
		get activeTabGroup() {
			return { viewColumn: 1, activeTab: fake.activeTab, tabs: fake.tabs };
		},
		get all() {
			return [{ viewColumn: 1, tabs: fake.tabs }];
		},
		onDidChangeTabs: event(fake.tabListeners),
		onDidChangeTabGroups: event(fake.groupListeners),
		async close(tabs: unknown): Promise<boolean> {
			fake.closed.push(tabs);
			return true;
		},
	},
	onDidChangeTextEditorSelection: event(fake.selectionListeners),
	async showTextDocument(document: FakeDocument, options: unknown) {
		fake.shown.push({ path: document.uri.path, options });
		const editor = { document };
		window.activeTextEditor = editor;
		return editor;
	},
	async showWarningMessage(message: string): Promise<undefined> {
		fake.warnings.push(message);
		return undefined;
	},
	setStatusBarMessage(): Disposable {
		return new Disposable();
	},
	async withProgress<T>(_options: unknown, task: () => Promise<T>): Promise<T> {
		return task();
	},
};

export const env = {
	async openExternal(uri: Uri): Promise<boolean> {
		fake.opened.push(uri.toString());
		return true;
	},
};

export const commands = {
	registered: new Map<string, (...args: unknown[]) => unknown>(),
	registerCommand(id: string, fn: (...args: unknown[]) => unknown): Disposable {
		commands.registered.set(id, fn);
		return new Disposable(() => commands.registered.delete(id));
	},
	async executeCommand(...args: unknown[]): Promise<undefined> {
		fake.executed.push(args);
		if (args[0] === 'workbench.action.closeActiveEditor') window.activeTextEditor = undefined;
		return undefined;
	},
	async getCommands(): Promise<string[]> {
		return fake.commandList;
	},
};
