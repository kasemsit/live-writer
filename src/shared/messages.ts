import type { HeadingItem } from './headings';
import type { BibEntry } from './plusTexAux';

/** md-live-preview-plus: which editor the webview builds for a document. */
export type EditorLang = 'markdown' | 'latex';

export interface TextChange {
	from: number;
	to: number;
	insert: string;
}

export interface CodeToken {
	from: number;
	to: number;
	style: string;
}

export interface CodeBlockTokens {
	from: number;
	to: number;
	tokens: CodeToken[];
}

export type HostToEditorMessage =
	// `baseUri` is the webview-loadable URI (with a trailing slash) of the
	// folder containing the document, used to resolve relative image paths
	// (e.g. `assets/foo.png`) to something the webview is actually allowed to load.
	// plus: `lang` picks the editor — Markdown (the default) or the LaTeX Live Preview.
	| { type: 'init'; text: string; version: number; css: string; codeTheme: string; baseUri: string; lang?: EditorLang }
	| { type: 'externalUpdate'; changes: TextChange[]; version: number }
	| { type: 'ackEdit'; version: number }
	| { type: 'codeTokens'; blocks: CodeBlockTokens[] }
	| { type: 'applyCss'; css: string }
	| { type: 'jumpToLine'; line: number }
	// Reply to `readDrawioFile`. `text` is the file's contents, or `error` says
	// why it could not be read; exactly one of the two is set. `requestId`
	// matches the reply to the widget that asked, since several diagrams in one
	// document can have requests in flight at the same time.
	| { type: 'drawioFile'; requestId: number; text?: string; error?: string }
	| { type: 'setCursor'; pos: number }
	| PlusHostToEditorMessage;

export type EditorToHostMessage =
	| { type: 'ready' }
	| { type: 'edit'; baseVersion: number; changes: TextChange[] }
	| { type: 'undo' }
	| { type: 'redo' }
	| { type: 'openLink'; href: string }
	| { type: 'pasteImage'; atPos: number; mimeType: string; dataBase64: string; needsOwnParagraph: boolean }
	// A `![](diagram.drawio)` reference: the webview cannot read workspace files
	// itself, and an <img> cannot render mxGraph XML, so the host reads the file
	// and sends its text back for the widget to parse. `src` is the raw, relative
	// path exactly as written in the Markdown; the host resolves it.
	| { type: 'readDrawioFile'; requestId: number; src: string }
	| PlusEditorToHostMessage;

// ── md-live-preview-plus ────────────────────────────────────────────────────

/** A note offered by wikilink completion: `name` is the file name without extension, `path` workspace-relative. */
export interface PlusNote {
	name: string;
	path: string;
}

/** A link target inside a note: a heading (`#Heading`) or a block id (`#^id`). */
export interface PlusAnchor {
	kind: 'heading' | 'block';
	/** Heading text, or the block id without its `^`. */
	text: string;
	level?: number;
}

/** What a wikilink's hover card shows. `text` is Markdown cut from the target note. */
export interface PlusPreview {
	title: string;
	text: string;
	/** `missing`: no such note; `anchor-missing`: the note exists, the heading/block does not. */
	status: 'ok' | 'missing' | 'anchor-missing' | 'not-markdown';
	truncated: boolean;
}

/**
 * Context-menu commands the editor webview carries out itself, on the spot that
 * was right-clicked (or the caret, when run from the command palette).
 */
export type PlusCommand =
	| 'copyBlockLink'
	| 'addReviewComment'
	| 'copyRichText'
	| 'openAsTextHere'
	| 'openLinkBeside'
	| 'copyTex'
	| 'searchGoogle'
	| 'searchScholar'
	| 'renumberFootnotes'
	| 'table.insertRowAbove'
	| 'table.insertRowBelow'
	| 'table.insertColumnLeft'
	| 'table.insertColumnRight'
	| 'table.deleteRow'
	| 'table.deleteColumn'
	| 'table.sortAscending'
	| 'table.sortDescending'
	| 'table.copyTsv';

export type PlusHostToEditorMessage =
	| { type: 'plusNotes'; requestId: number; notes: PlusNote[] }
	| { type: 'plusPreviewResult'; requestId: number; preview: PlusPreview }
	// `src` is a webview-loadable URI, or null when no such file exists.
	| { type: 'plusEmbedResult'; requestId: number; src: string | null }
	// The labels the nearest `_quarto.yml` sets (`crossref-fig-title`, …); empty when there is none.
	| { type: 'plusQuartoLabelsResult'; requestId: number; labels: Record<string, string> }
	// The reader's text size, a factor over the theme's (setting mdLivePreview.plus.textScale).
	| { type: 'plusTextScale'; scale: number }
	// The next externalUpdate came from disk (Claude, git, …): show it as tracked changes.
	| { type: 'plusTrackNext' }
	| { type: 'plusAnchors'; requestId: number; anchors: PlusAnchor[] }
	| { type: 'plusInsertFootnote' }
	// `range` (document offsets) overrides the selection — used by tests and by
	// callers that already know what to act on.
	| { type: 'plusRun'; command: PlusCommand; range?: { from: number; to: number } }
	// LaTeX: what the last build and the bibliography say (see PlusTexContext).
	| { type: 'plusTexContext'; context: PlusTexContext }
	| { type: 'plusTexAssetResult'; requestId: number; asset: PlusTexAsset };

/**
 * md-live-preview-plus: what the LaTeX Live Preview needs beyond the file:
 * the numbers the last build gave labels and citations (from the root's
 * `.aux`), the bibliography entries, and the root preamble's macros.
 */
export interface PlusTexContext {
	labels: Record<string, string>;
	cites: Record<string, string>;
	bib: Record<string, BibEntry>;
	/** KaTeX macros: `\name` → body with `#1`… */
	macros: Record<string, string>;
	/** The root file, workspace-relative ('' when the document is its own root). */
	root: string;
}

/** An `\includegraphics` target: a URI the webview may load, or why there is none. */
export interface PlusTexAsset {
	status: 'image' | 'missing' | 'unsupported';
	src: string | null;
	/** The file as found (or the path as written, when missing). */
	name: string;
}

export type PlusEditorToHostMessage =
	// The editor selection, as exact Markdown source with its line numbers;
	// `text` is empty when nothing is selected. Written to a file a Claude Code
	// hook reads (see src/editor/plus/selectionFile.ts).
	| { type: 'plusSelection'; text: string; from?: number; to?: number; startLine?: number; endLine?: number }
	| { type: 'plusListNotes'; requestId: number }
	// `target` is the wikilink target before `#`; empty means the current document.
	| { type: 'plusListAnchors'; requestId: number; target: string }
	// `target` is everything after `wiki:` — `note#anchor`.
	| { type: 'plusPreview'; requestId: number; target: string }
	// `![[image.png]]`: find the file by name and give back a URI the webview may load.
	| { type: 'plusResolveEmbed'; requestId: number; target: string }
	| { type: 'plusQuartoLabels'; requestId: number }
	// What a context-menu command needs the host for: the clipboard, opening
	// files, telling the user something.
	| { type: 'plusDo'; action: 'copy'; text: string; notice: string }
	| { type: 'plusDo'; action: 'copyBlockLink'; anchor: string }
	| { type: 'plusDo'; action: 'openAsText'; line: number }
	| { type: 'plusDo'; action: 'openBeside'; href: string }
	| { type: 'plusDo'; action: 'openUrl'; url: string }
	| { type: 'plusDo'; action: 'notify'; message: string; error?: boolean }
	// LaTeX: find the file an `\includegraphics{path}` means.
	| { type: 'plusTexAsset'; requestId: number; path: string };

export interface StyleEntry {
	id: string;
	name: string;
	enabled: boolean;
	/** Raw CSS content, used by the sidebar to render a live preview thumbnail. */
	css: string;
}

/** The extension settings the sidebar surfaces and can change. */
export interface SidebarSettings {
	defaultEditor: string;
	codeTheme: string;
}

/** Which VS Code theme is active, so previews gate `body.vscode-*` rules correctly. */
export type ThemeKind = 'vscode-light' | 'vscode-dark' | 'vscode-high-contrast';

export type HostToSidebarMessage = {
	type: 'init';
	styles: StyleEntry[];
	settings: SidebarSettings;
	themeKind: ThemeKind;
};

export type SidebarToHostMessage =
	| { type: 'ready' }
	| { type: 'toggle'; id: string; enabled: boolean }
	| { type: 'newStyle' }
	| { type: 'openStyle'; id: string }
	| { type: 'duplicateStyle'; id: string }
	| { type: 'renameStyle'; id: string }
	| { type: 'deleteStyle'; id: string }
	| { type: 'setSetting'; key: keyof SidebarSettings; value: string };

// Live CSS-theme preview panel (opened beside the CSS file while editing it).
export type HostToPreviewMessage =
	| { type: 'update'; css: string; themeKind: ThemeKind; name: string }
	// Glow the preview elements matching the selector of the rule under the cursor
	// (null clears the highlight).
	| { type: 'highlight'; selector: string | null };
export type PreviewToHostMessage = { type: 'ready' };

// Outline (heading list) sidebar view.
export type HostToOutlineMessage =
	| { type: 'update'; headings: HeadingItem[] }
	// No Markdown Live Preview panel is currently active (none open, or focus
	// moved away from any of them).
	| { type: 'noDocument' };

export type OutlineToHostMessage = { type: 'ready' } | { type: 'jumpToHeading'; line: number };
