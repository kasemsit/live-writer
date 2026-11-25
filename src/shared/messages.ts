import type { HeadingItem } from './headings';
import type { BibEntry } from './bib';
import type { CiteStyle } from './citations';
import type { RewriteMode } from './rewrite';


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
	// `lang` picks the editor — Markdown (the default) or the LaTeX Live Preview.
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
	| FeatureHostToEditorMessage;

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
	| FeatureEditorToHostMessage;

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
	| { type: 'noDocument' }
	// The line (1-based) the caret is on in the active editor: the outline marks its heading.
	| { type: 'activeLine'; line: number };

export type OutlineToHostMessage = { type: 'ready' } | { type: 'jumpToHeading'; line: number };

// ── Live Writer: messages for its own features ─────────────────────────────


/** Which editor the webview builds for a document. */
export type EditorLang = 'markdown' | 'latex';

/** A note offered by wikilink completion: `name` is the file name without extension, `path` workspace-relative. */
export interface NoteEntry {
	name: string;
	path: string;
}

/** A link target inside a note: a heading (`#Heading`) or a block id (`#^id`). */
export interface NoteAnchor {
	kind: 'heading' | 'block';
	/** Heading text, or the block id without its `^`. */
	text: string;
	level?: number;
}

/** What a wikilink's hover card shows. `text` is Markdown cut from the target note. */
export interface NotePreview {
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
export type MenuCommand =
	| 'find'
	| 'copyBlockLink'
	| 'addReviewComment'
	| 'copyRichText'
	| 'openAsTextHere'
	| 'openLinkBeside'
	| 'openInZotero'
	| 'showInPdf'
	| 'paraphrase'
	| 'rewrite.tighten'
	| 'rewrite.formal'
	| 'rewrite.toEnglish'
	| 'rewrite.toThai'
	| 'command.polish'
	| 'command.tighten'
	| 'command.formal'
	| 'command.toEnglish'
	| 'command.toThai'
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

export type FeatureHostToEditorMessage =
	| { type: 'notes'; requestId: number; notes: NoteEntry[] }
	| { type: 'linkPreviewResult'; requestId: number; preview: NotePreview }
	// `src` is a webview-loadable URI, or null when no such file exists.
	| { type: 'embedResult'; requestId: number; src: string | null }
	// Quarto: what the document takes from its project; sent again when a project file changes.
	| { type: 'quartoProject'; project: QuartoProject }
	// The reader's text size, a factor over the theme's (setting liveWriter.plus.textScale).
	// `fontFamily` (setting liveWriter.plus.fontFamily) replaces the theme's text font; '' keeps it.
	// `pageWidth` (setting liveWriter.plus.pageWidth) is the reading column in em; 0 keeps the theme's.
	| { type: 'textScale'; scale: number; fontFamily?: string; pageWidth?: number }
	// The next externalUpdate came from disk (Claude, git, …): show it as tracked changes.
	| { type: 'trackNext' }
	| { type: 'anchors'; requestId: number; anchors: NoteAnchor[] }
	| { type: 'insertFootnote' }
	// Text to put in place of the selection (a citation picked in Zotero).
	| { type: 'insertText'; text: string }
	// `range` (document offsets) overrides the selection — used by tests and by
	// callers that already know what to act on.
	| { type: 'runCommand'; command: MenuCommand; range?: { from: number; to: number } }
	// LaTeX: what the last build and the bibliography say (see TexContext).
	| { type: 'texContext'; context: TexContext }
	| { type: 'texAssetResult'; requestId: number; asset: TexAsset }
	| { type: 'texPictureResult'; requestId: number; picture: TexPicture }
	| { type: 'zoteroLinksResult'; requestId: number; links: ZoteroLinks }
	| { type: 'rewriteResult'; requestId: number; text: string; error: string; engine?: string; note?: string };

/**
 * What the LaTeX Live Preview needs beyond the file:
 * the numbers the last build gave labels and citations (from the root's
 * `.aux`), the bibliography entries, and the root preamble's macros.
 */
export interface TexContext {
	labels: Record<string, string>;
	cites: Record<string, string>;
	bib: Record<string, BibEntry>;
	/** KaTeX macros: `\name` → body with `#1`… */
	macros: Record<string, string>;
	/** The root file, workspace-relative ('' when the document is its own root). */
	root: string;
	/** When the last build wrote its `.aux` ('' without one): a new value redraws what came from the build. */
	build: string;
}

/**
 * What a document takes from its Quarto project: the nearest `_quarto.yml`
 * and, for a `.qmd`, its own front matter.
 */
export interface QuartoProject {
	/** The words the project sets (`crossref-fig-title`, `callout-note-title`, …); Quarto's defaults fill the rest. */
	labels: Record<string, string>;
	/**
	 * How `[@key]` reads in a `.qmd` with a bibliography. Null otherwise: a
	 * citation then links to the `@key` note, as in a notes vault.
	 */
	citations: { style: CiteStyle; lang: string; bib: Record<string, BibEntry>; nocite?: string[] } | null;
	/**
	 * The document is a `.qmd`, so Pandoc's rules hold: a heading needs a blank
	 * line before it. A Markdown note follows CommonMark, where it does not.
	 */
	quarto: boolean;
}

/** An `\includegraphics` target: a URI the webview may load, or why there is none. */
/** Where a cited paper is in Zotero: zotero:// links to its PDF and to the item, or why there are none. */
export interface ZoteroLinks {
	pdf: string | null;
	item: string | null;
	note: string;
}

/** A `tikzpicture` as the last build drew it, cut from its PDF by SyncTeX, or why there is none. */
export interface TexPicture {
	status: 'image' | 'missing' | 'unsupported';
	src: string | null;
	/** Where it came from (`main.pdf, p. 8`), or what is missing. */
	note: string;
	/** The file changed after that build: the picture may be out of date. */
	stale: boolean;
}

export interface TexAsset {
	status: 'image' | 'missing' | 'unsupported';
	src: string | null;
	/** The file as found (or the path as written, when missing). */
	name: string;
}

export type FeatureEditorToHostMessage =
	// The editor selection, as exact Markdown source with its line numbers;
	// `text` is empty when nothing is selected. Written to a file a Claude Code
	// hook reads (see src/editor/features/selectionFile.ts).
	| { type: 'selection'; text: string; from?: number; to?: number; startLine?: number; endLine?: number }
	| { type: 'listNotes'; requestId: number }
	// `target` is the wikilink target before `#`; empty means the current document.
	| { type: 'listAnchors'; requestId: number; target: string }
	// `target` is everything after `wiki:` — `note#anchor`.
	| { type: 'linkPreview'; requestId: number; target: string }
	// `![[image.png]]`: find the file by name and give back a URI the webview may load.
	| { type: 'resolveEmbed'; requestId: number; target: string }
	// Quarto: send this document's project (quartoProject) now and on every change.
	| { type: 'quartoWatch' }
	// The caret's line (1-based), for the outline's current heading.
	| { type: 'cursorLine'; line: number }
	// What a context-menu command needs the host for: the clipboard, opening
	// files, telling the user something.
	| { type: 'hostAction'; action: 'copy'; text: string; notice: string }
	| { type: 'hostAction'; action: 'copyBlockLink'; anchor: string }
	| { type: 'hostAction'; action: 'openAsText'; line: number }
	| { type: 'hostAction'; action: 'openBeside'; href: string }
	| { type: 'hostAction'; action: 'openUrl'; url: string }
	// A zotero:// link (shared/zotero.ts ZOTERO_LINK): a PDF in Zotero's reader or an item in the library.
	| { type: 'hostAction'; action: 'openZotero'; url: string }
	// LaTeX: this line (1-based) of the document, shown in the build's PDF.
	| { type: 'hostAction'; action: 'showInPdf'; line: number }
	| { type: 'hostAction'; action: 'notify'; message: string; error?: boolean }
	// LaTeX: find the file an `\includegraphics{path}` means.
	| { type: 'texAsset'; requestId: number; path: string }
	// LaTeX: the last build's drawing of the picture on these lines (1-based) of this file.
	| { type: 'texPicture'; requestId: number; lines: number[]; source?: string }
	// The Zotero links for a citation key.
	| { type: 'zoteroLinks'; requestId: number; key: string }
	// Paraphrase with Claude: the selected source, rewritten by Claude Code.
	| { type: 'rewrite'; requestId: number; text: string; mode?: RewriteMode; engine?: 'claude' | 'command' };
