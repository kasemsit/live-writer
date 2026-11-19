import type { BibEntry } from './plusBib';
import type { CiteStyle } from './plusCitations';

/**
 * md-live-preview-plus: the messages this fork adds between the editor webview
 * and the extension host. messages.ts (upstream's) re-exports them and joins
 * the two unions into its own.
 */

/** Which editor the webview builds for a document. */
export type EditorLang = 'markdown' | 'latex';

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
	// Quarto: what the document takes from its project; sent again when a project file changes.
	| { type: 'plusQuartoProject'; project: PlusQuartoProject }
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

/**
 * What a document takes from its Quarto project: the nearest `_quarto.yml`
 * and, for a `.qmd`, its own front matter.
 */
export interface PlusQuartoProject {
	/** The words the project sets (`crossref-fig-title`, `callout-note-title`, …); Quarto's defaults fill the rest. */
	labels: Record<string, string>;
	/**
	 * How `[@key]` reads in a `.qmd` with a bibliography. Null otherwise: a
	 * citation then links to the `@key` note, as in a notes vault.
	 */
	citations: { style: CiteStyle; lang: string; bib: Record<string, BibEntry> } | null;
	/**
	 * The document is a `.qmd`, so Pandoc's rules hold: a heading needs a blank
	 * line before it. A Markdown note follows CommonMark, where it does not.
	 */
	quarto: boolean;
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
	// Quarto: send this document's project (plusQuartoProject) now and on every change.
	| { type: 'plusQuartoWatch' }
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
