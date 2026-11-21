# md-live-preview-plus — changes

Each `## <version>` section is used as the GitHub release notes by `plus/release.sh`.

## 1.1.0

- **Insert Citation from Zotero** (Ctrl+Alt+C, Cmd+Alt+C on a Mac, or right-click). Zotero's citation picker opens (Better BibTeX's *cite as you write*); the works you pick go in at the caret as the document's own syntax: `[@a; @b]` in Markdown and Quarto, `\cite{a,b}` in LaTeX. Needs Zotero running with Better BibTeX.
- The extension-host side now has unit tests, against an in-memory stand-in for VS Code: Zotero lookups and their fallbacks, the Quarto project and its watchers, the settings carried over from the former name, the citation picker, Paraphrase with Claude, and TikZ pictures cut from the build. Each was checked to fail when the behaviour it guards is broken.

## 1.0.0

**Live Writer, under its own name throughout.** Install this release once by hand (the zip's installer); it replaces the old extension.

- The extension id is now `kasemsit.live-writer` (it was `local.markdown-live-preview-editor-claude`). The installer removes the old one.
- Settings are `liveWriter.*` (they were `mdLivePreview.*`), and so are the commands. Settings you made under the old names are copied over the first time Live Writer starts. Keybindings you bound to old command ids need the new ids.
- The repository is github.com/kasemsit/live-writer; the old address redirects there, and the update check follows it.
- Nothing else changes in how it works.

## 0.4.17

- **New name: Live Writer** (formerly md-live-preview-plus), since it now writes Markdown, LaTeX and Quarto, not only previews Markdown. It is the same extension: settings, commands and keybindings keep working, and it updates in place.

## 0.4.16

- **Paraphrase with Claude**, in the right-click menu on a selection (beside *Ask Claude About the Selection*). Claude Code rewrites the passage — same language, meaning, terms, numbers, citations and LaTeX/Markdown markup — and a card shows the result with **Replace**, **Copy** and **Close**. Replace is one edit, undone with Ctrl+Z.
  - It runs `claude -p` with no tools, no saved session and none of your settings or hooks, in a temporary folder; it needs Claude Code installed and signed in.
- **Font setting:** `mdLivePreview.plus.fontFamily` sets the font of the text (CSS `font-family`, e.g. `Sarabun, sans-serif`); empty keeps the theme's. Code and formulas keep their own.

## 0.4.15

- **Citations open their paper in Zotero.** Rest the pointer on a citation — `[@key]` in a Markdown note or a Quarto file, `\cite{key}` in LaTeX — for a card with its entry, **Open PDF** (in Zotero's reader, where your annotations are) and **Show in Zotero**. Right-click a citation for **Open PDF in Zotero**.
  - The key is looked up in the Zotero running on this computer: its local API (Zotero 7 and later, which know each item's citation key), else Better BibTeX.
  - When Zotero is closed, or a note's key differs from Zotero's, the `zotero_key` / `pdf_key` in the vault's `@key` reference note are used; opening the link starts Zotero.
  - A key Zotero does not hold, or an item without a PDF, says so on the card.
  - Only `zotero://open-pdf/…` and `zotero://select/…` links are opened.
- On Linux, `zotero://` links need Zotero registered as their handler; the README says how.
- The Quarto and LaTeX citation tooltips became this card.

## 0.4.14

- **LaTeX Live Preview: TikZ pictures are drawn.** A `tikzpicture` (also `tikzcd`, `pgfpicture`, `circuitikz`, and pgfplots axes inside them) shows as your last build drew it.
  - SyncTeX finds where the picture landed in the build's PDF, and `pdftoppm` cuts that box out at its printed size. Nothing is compiled, as for `\ref` numbers.
  - Its code comes back while the caret is in it; a click on the picture puts the caret there.
  - A picture the file has changed since carries a *last build* tag; it is redrawn when you build again.
  - With no build (or no `synctex` command) the code stays, with a note saying what is missing.
  - Checked on a paper's five pictures (flowcharts, a pgfplots plot, a two-column architecture diagram): each is cut whole.

## 0.4.13

**Quarto books in Live Preview**, with citations and cross-references as Quarto prints them, and fixes.

- **Quarto `.qmd` files** open in Live Preview and look like the rendered book.
  - Callouts (`::: {.callout-note}` … `:::`) are coloured boxes with their fences hidden, titled by their first heading, `title="…"` or their type. `icon=false` and `appearance="simple"`/`"minimal"` are followed.
  - `![caption](img.png){#fig-id width=80%}` is a sized, captioned figure, numbered per file as Quarto numbers a book chapter's figures.
  - `@fig-id` reads *Figure 2* and `@sec-id` the heading's text; a click jumps to it. An id with nothing to point at reads `?fig-id` in red, as Quarto prints it.
  - **Citations read as the book prints them.** `[@chen2015]` reads *(Chen, 2015)*, `[see @a, p. 3; @b]` and `[-@a]` too, and an in-text `@chen2015` reads *Chen (2015)*. Entries come from the `.bib` files named by `bibliography:` in `_quarto.yml` or the file's front matter; the style follows `csl:` (APA, or Quarto's default Chicago author-date), and `lang: th` gives *และคณะ* and *ม.ป.ป.* as Quarto does. Hover a citation to read its entry; a key the bibliography lacks reads `key?` in red.
    - Locators, several works and in-text `@key [p. 33]` follow citeproc too: *(Chen, 2015, p. 33)*, *(Chen, 2015; Lee & Park, 2019)*, *(Smith, 2019, 2020)*, *Chen (2015, p. 33)*.
    - Checked against Quarto's own citeproc on 176 cases in APA and Chicago, English and Thai: all match but one kind, the *2015a*/*2015b* that tells apart two works by one author in one year.
    - Checked against a real Thai book: every citation (13) and cross-reference (128) matches its rendered HTML.
  - The words come from the project's `_quarto.yml` (`crossref-fig-title`, `callout-note-title`, …), and follow it when it changes; so do the bibliography files.
  - `{#sec-id}` after a heading is hidden; callout titles are not listed in the Outline.
  - **Flags what Quarto reads differently from how it looks.** A heading straight after a line of text, with no blank line between, is part of that paragraph in Pandoc: Quarto prints it as `## …`, and an image in that paragraph is not numbered. Only a `.qmd` is flagged: a Markdown note follows CommonMark, where such a heading is a heading.
- The source of each of these shows again while the caret is on its line.
- In a `.md` note, `[@key]` still links to the vault's `@key` note, as before.

**Fixes**

- A `[^1]: …` line inside a fenced code block was drawn as a footnote, and could take the place of the real definition; Renumber Footnotes could renumber labels only the code defined.
- Footnote references and block ids now redraw when a table switches between drawn and code mode.
- LaTeX: a rebuild that writes the `.aux` to LaTeX Workshop's `outDir` outside the root's folder is now noticed, and an older read of the build can no longer replace a newer one.
- LaTeX: labels are completed after every reference command the preview draws (`\Vref` and `\subref` were missing), and labels that are commented out or inside verbatim are no longer offered.

The fork's own code was reorganised on the way, with no change in behaviour: helpers shared instead of copied, one channel to the extension host, the LaTeX scanner split by job.

## 0.4.12

- **LaTeX Live Preview.** A `.tex` file opens in the Live Preview (*Open With → Live Preview*, or the preview icon in the title bar) and is drawn the way Overleaf's Visual Editor draws it. As with Markdown, the source comes back wherever the caret is.
  - **Drawn:** section headings, `\textbf` / `\emph` and the other text styles, math with KaTeX (with the document's `\newcommand` macros), lists with their markers, `abstract`, figures and tables in a frame, captions, `tabular` with booktabs rules and `\multicolumn`, `\includegraphics` images, footnotes, links, `~ -- --- `` ''` and accents. Comments are tinted as notes. The preamble folds into one line.
  - **Real numbers from your last build:** `\ref`, `\eqref`, `\cite`, captions and equations show the numbers in the root's `.aux` (`[3]`, `Fig. 2`, `(4)`), and update when you rebuild. A reference the build does not know is marked red. Hovering a citation shows its `.bib` entry.
  - **Multi-file projects:** the root is found by `% !TEX root`, by `\documentclass`, or by the nearby file that `\input`s this one. `\input{…}` is a link that opens the file in the Live Preview (right-click → *Open Link to the Side*).
  - **PDF figures** are shown as their first page when `pdftoppm` (poppler) is installed.
  - **Editing:** Ctrl/Cmd+B and +I wrap in `\textbf{}` / `\textit{}`, Ctrl/Cmd+/ comments lines out, Enter after an `\item` starts the next one. Completion offers labels after `\ref{`, citation keys after `\cite{`, environments after `\begin{` (with the `\end`), and commands.
  - Nothing is compiled: the preview reads what LaTeX Workshop, latexmk or Overleaf last wrote. Claude still gets the exact selected source with its line numbers.

## 0.4.11

**Fixes a bug that put edits in the wrong place in files with Windows line endings (CRLF).** Please update.

- **The bug was in the upstream editor.** In a CRLF file, every edit made in the preview landed one character further off for each line above it: typing, Renumber Footnotes, table edits and the rest. Changes arriving from disk were placed off the other way. Files with LF line endings were never affected.
  - **Symptom:** numbers or text appearing in the middle of sentences, worse further down the file.
  - **To repair a damaged file:** press Ctrl+Z in the preview if it is still open, or restore the previous version from the Timeline view (VS Code's local history).
- **Renumber Footnotes**:
  - it now also renumbers footnotes inside a table shown as source;
  - it parses the whole file first, so text in a code block far below stays untouched;
  - it stops, with a message, when a reference without a definition would be captured by a renumbered footnote.
- Code highlighting in fenced blocks was offset in CRLF files too; fixed.

## 0.4.10

- **Tracked changes from outside the editor.** When an open note changes on disk (Claude writing it, a git checkout, another program), the Live Preview shows what changed on the rendered page.
  - Insertions are green and deletions are struck through in red, word by word, Thai included.
  - Each change has ✓ (keep) and ✗ (undo it).
  - A bar shows the count, with **Next**, **Accept all** and **Reject all**.
  - Undoing is an ordinary edit, so it reaches the file and Ctrl+Z works.
  - Your own typing, in the preview or in a text editor, is not marked.
  - Turn it off with `mdLivePreview.plus.trackExternalChanges`.

## 0.4.9

- **Text size**: Larger Text, Smaller Text and Reset Text Size in the right-click menu.
  - The size is the setting `mdLivePreview.plus.textScale`, so it is remembered next time and applies to every open preview.
  - It scales the preview's base size, which is your VS Code editor font size and at least 15px; headings, tables and formulas follow.
- **Less empty space**:
  - A blank line next to a table, a display formula or a code block collapses, since those blocks have their own spacing.
  - A blank line between paragraphs stays: it is the paragraph spacing.
  - The caret's line opens to full height, and the arrow keys stop on it.
- **A one-line `$$…$$` formula** no longer takes three lines' height. It went from 84 px to about 35.
- **Tables**: a `|` inside `$…$` no longer splits a cell, so `| $|B_m|/n$ |` keeps its table.
- **`[text]`** is a link only when the document defines `[text]: url`, as in CommonMark and Obsidian. Before, `[0.8, 1.0]` or `[ฎีกา 1689/2518]` showed as an empty link with its brackets hidden.

## 0.4.8

- **Image embeds** `![[name.png]]` render as images, as in Obsidian:
  - the file is found by name anywhere in the workspace, so attachments kept in their own folder load;
  - `![[name.png|300]]` sets the width, `![[name.png|300x200]]` width and height;
  - with duplicate names, the file at the written path wins, then one in the note's own folder, then the shortest path. Write part of the path to choose, e.g. `![[Folder/name.png]]`;
  - a missing file says so; the caret on the line shows the source.
- **Underline**: Ctrl/Cmd+U wraps the selection in `<u>…</u>`, or unwraps it. Markdown has no underline; Obsidian, Pandoc and Word exports use the tag. The preview hides the tags and underlines the text, in tables too.
- **Search Google** and **Search Google Scholar** in the right-click menu, for the selected text.

## 0.4.7

**A right-click menu** in the Live Preview. It is VS Code's own menu, and it shows only the items that fit what was clicked:

- **Anywhere**:
  - **Copy Link to This Block**: copies `[[Note#^id]]`. A paragraph or list item without a block id gets one; a quote, callout, table or code block gets its id on its own line after the block, as Obsidian does. A heading copies `[[Note#Heading]]`, or its block id if it has one.
  - **Copy as Rich Text**: the selection, or the clicked block, as HTML for Word, Google Docs or e-mail. Headings, lists, tables, bold and links survive. Wikilinks become their labels, and `<!-- … -->` notes and block ids are left out.
  - **Add REVIEW Comment**: inserts `<!-- REVIEW "selected text": … -->` after the block and puts the caret in it.
  - **Open as Text at This Line**, **Open in Obsidian**.
- **With a selection**: **Ask Claude About the Selection** focuses Claude Code's prompt box; the selection is already attached.
- **On a link or citation**: **Open Link to the Side**.
- **On a formula**: **Copy TeX**.
- **On a table cell**: **Insert Row Above/Below**, **Insert Column Left/Right**, **Delete Row**, **Delete Column**, **Sort Table by This Column**, **Copy Table as Tab-Separated Text** (pastes into Excel or Sheets as cells).
- **In a document with footnotes**: **Renumber Footnotes in Order** relabels every footnote with the number it is shown as.

Every item is also a command, so it can have a keyboard shortcut. From the command palette it acts on the caret.

## 0.4.6

- **Math**, rendered with KaTeX, as Obsidian and Pandoc write it:
  - `$…$` inline;
  - `$$…$$` on one line;
  - `$$` blocks over several lines, which may follow a line of text directly.
- **Editing math**: click a formula, or move the caret into it, to edit its TeX.
- **Math is part of the parser**, so `$a_i$ and $b_j$` no longer turns into italics between the two formulas.
  - Pandoc's rules keep money as text: `$5 and $10` is not math.
- **Math renders in table cells, footnote cards and link previews too.**
- **KaTeX loads only when a document has math.** It ships in the extension; nothing is fetched from the internet.

## 0.4.5

- **Backlinks view** in the Markdown Live Preview sidebar: the notes that link to the one you are reading, each with the line that does it. Click a line to open that note there.
  - Pandoc citations count: a draft citing `[@key]` is listed under the reference note `@key.md`.
  - Works for the active Live Preview or an ordinary Markdown editor, and follows saved changes on disk.
- **Pandoc citations** (`[@key]`, `[@a; @b, p. 3]`) in drafts:
  - each key links to its `@key` reference note: hover to read it, click to open it;
  - a key with no note is drawn faint, so a typo shows before the document is built.
- **Selections inside rendered tables now reach Claude**, as the cells' Markdown source with line numbers. Before, Claude received nothing for them.

## 0.4.4

- **Hover preview of wikilinks**: rest the pointer on `[[note#^ma-32]]` to read that block in a card without leaving the note.
  - For a heading, or a block id on a heading as in `Laws/`, the card shows the whole section.
  - The card stays open while the pointer is on it, so a long section can be scrolled. Its title opens the note.
- **Links to missing notes** are shown faint with a dashed underline, as in Obsidian.
- **Foldable callouts**: `> [!type]-` starts folded and `> [!type]+` starts open. The chevron after the title folds or opens either.
- **HTML comments** (`<!-- … -->`) are tinted as notes to the writer, on their own lines or inside a paragraph.
- **Headings** in the Thai theme share one colour at every level, darker at the top. Before, only level 3 was coloured.
- **The Claude bridge**:
  - A notice in Claude Code says what was sent with each prompt.
  - A status bar item shows what Claude will get next. Click it to stop sending.
  - A selection is sent in full once per session. While it stays the same, later prompts carry a one-line reminder instead, so the conversation no longer grows with every prompt.
  - A selection over 4,000 characters is sent as its head and tail plus its line range.
  - Selecting text in an ordinary editor, or closing the preview, stops sending the old selection.
  - **Run the installer again** to get the new hook.

## 0.4.3

Rebuilt as a fork of the upstream source (0.4.0) instead of a patch applied to the
published bundle. Everything from 0.4.0-plus.2 is kept, and:

- **Wikilink completion**:
  - `[[` offers the notes in the workspace. A bare name is used where it is unique, a path otherwise.
  - `[[note#` offers that note's headings, and `[[note#^` its block ids.
- **Footnotes**:
  - `[^` offers the existing footnotes, plus *new footnote*.
  - **Insert Footnote** (`Ctrl+Alt+6`, or `Cmd+Alt+6` on macOS) adds the next number at the cursor and its definition at the end of the file.
- **Block ids** (`^ma-32`) are dimmed.
- **In table code mode** a wikilink shows its full `[[…]]` source.
- **A callout continues around a table** without a gap. A table in a plain quote takes the quote's colours.
- **Update notice**: once a day the extension checks GitHub Releases and offers the newer version. Turn it off with `mdLivePreview.plus.checkForUpdates`.
- **New setting** `mdLivePreview.plus.shareSelectionWithClaude`. The selection file is written only if `~/.claude` exists.
- **Versions now increase with every release**, so VS Code installs a new one over the old without `--force`.
