# md-live-preview-plus — changes

Each `## <version>` section is used as the GitHub release notes by `plus/release.sh`.

## 1.10.0

- **Quarto presentations show as slides.** A `.qmd` whose front matter says `format: revealjs` (or `beamer`, `pptx`) is drawn slide by slide: each slide a card numbered as the deck numbers it (`3 / 88`), the title slide from the front matter (title, subtitle, author, institute, date, and `title-slide-attributes` background), and section slides filled with their `background-color`. Slides split where Quarto splits them: at headings up to `slide-level` (2 unless set) and at horizontal rules, never inside code or fenced divs. On three lecture decks the slide count, order and kind match Quarto's own HTML exactly (88, 50 and 51 slides). The text stays one editable document.
- `. . .` shows as a *pause* line, and `::: {.notes}` as speaker notes, labelled and set apart.

## 1.9.2

- **Ctrl+F (Cmd+F) always opens the search box** in a Live Writer tab, also when the focus is not in the text: just after opening a file, or after clicking the Outline or the tab. Before, the key reached Live Writer only from inside the text.

## 1.9.1

- **Tables: words stay whole.** A short column beside long ones was squeezed to one character, so `B0` drew as `B` over `0` and *Corresponding* broke mid-word. Cells inherited the editor's break-anywhere wrapping; they now break between words only, and a URL too long for any column still wraps.

## 1.9.0

- **Page width you can change.** Right-click → *Wider Page* / *Narrower Page* / *Reset Page Width*, or the setting `liveWriter.plus.pageWidth` (in em of the text; `0` keeps the theme's). It is remembered and applies to every open preview, and it follows Larger / Smaller Text.
- The Thai/English theme's column is wider by default: 56em (about 100 Latin characters), up from 48em.

## 1.8.0

**The Thai/English reading theme, redrawn for reading.**

- Its own colours in light and dark themes: heading levels in four hues (blue, teal, amber, violet), links in blue, `[@key]` citations in green, inline code in coral, bold a shade darker (light) or brighter (dark) than the text. Dark mode uses a warm off-white instead of grey, for less glare. High-contrast themes keep VS Code's own colours.
- Larger text: 17px, or the editor font size + 3px, where the theme's size used to lose to the editor's 15px floor. *Larger Text* / *Smaller Text* still scale it.
- A reading column of about 80 characters instead of the whole window, and slightly more line spacing for Thai.
- Plain quotes are a neutral card, so they no longer look like a *note* callout.

## 1.7.0

- **Live Writer opens `.md`, `.markdown`, `.qmd` and `.tex` files by default** on every machine it is installed on, with no setting to make. `liveWriter.defaultEditor` now defaults to `livePreview` and covers all four types; set it to `prompt` to keep the text editor as the default, or `default` to always use it. The extension starts with VS Code so the association is in place before the first file is opened.
- **New title-bar icons.** *Open with Live Preview* is a pencil, no longer the same icon as VS Code's own Markdown preview; *View PDF* is a PDF file, no longer the same icon as LaTeX Workshop's.

## 1.6.0

- **LaTeX: build from Live Writer.** A ▶ button on the editor's title bar, **Ctrl+Alt+B** (Cmd+Alt+B on a Mac) or right-click → *Build LaTeX* builds with LaTeX Workshop's default recipe (`latex-workshop.latex.recipe.default`, e.g. the last one used). The button beside it, **Ctrl+Alt+Shift+B** or *Build LaTeX with Recipe…* asks which recipe (xelatex, pdflatex, latexmk …, as your LaTeX Workshop settings list them). **Ctrl+Alt+V** or *View PDF* (in the title bar's `…` menu) opens the PDF in its viewer. The build is LaTeX Workshop's own, with its problems list and viewer refresh; the file shows as text for a moment while it starts, as with Show in PDF.
- A text tab Live Writer opens for a moment is never taken for a jump back from the PDF.

## 1.5.1

One Markdown reader instead of two: the link preview card and Copy as Rich Text now read blocks with the same code (`src/shared/markdownBlocks.ts`) and only draw them differently. On 248 notes from the vault, each produces what it did before, except:

- **Link preview card:** `^block-id` lines and `<!-- notes -->` are left out, as Copy as Rich Text already did; a list item's indented continuation lines stay in the item instead of becoming a separate paragraph; `[ ]` and `[x]` show as ☐ and ☑.
- **Copy as Rich Text:** a numbered list right after a bulleted one (or the reverse) is pasted as a list of its own, not merged into the one above.

## 1.5.0

- **LaTeX: back from the PDF.** Ctrl+click in LaTeX Workshop's PDF viewer (its inverse search) now shows the line in the Live Writer tab of that file instead of opening the file as text; a text tab opened only for the jump is closed. Turn off with `liveWriter.plus.inverseSearch`.
- **LaTeX: TikZ pictures without a build.** A picture no current build has drawn (a new one, or one edited since) is compiled on its own: the `standalone` class with the root preamble's packages, TikZ libraries, colours, styles and macros (page layout, hyperref and the bibliography left out), by pdflatex, or xelatex when the preamble loads fontspec. Each version is compiled once and cached. If the compile fails, the last build's drawing stays, marked *last build*, and the note names the log. Turn off with `liveWriter.plus.tikzCompile`.
- **Quarto: the reference list.** `::: {#refs}` shows the bibliography as the book prints it, in APA: hanging indent, italic titles and journals, linked DOIs. It lists every entry with `nocite: '@*'`, otherwise the entries the file cites plus any `nocite:` names. On the 269382 book, all 48 entries match Quarto's own HTML, in order and character for character.

## 1.4.0

- **LaTeX: Show in PDF** (Ctrl+Alt+J, Cmd+Alt+J on a Mac, or right-click). The line under the caret, or the one you right-clicked, is shown in the build's PDF by LaTeX Workshop's viewer through SyncTeX, the same forward search it does from its own editor. LaTeX Workshop starts that search only from a text editor, so the file shows as text for a moment in the same tab group before Live Writer comes back. Needs LaTeX Workshop and a build with SyncTeX (its default).

## 1.3.0

Two features taken from t-shoot's Markdown Live Preview Editor (0.5.0 and 0.6.0, MIT), fitted to Live Writer.

- **Fold heading sections.** A chevron appears beside a heading under the pointer; it folds the section, nested headings included, and a `…` stands in its place to expand it. Ctrl+Shift+[ and Ctrl+Shift+] fold and unfold at the caret. Search and Outline jumps open a folded section; the file is never changed. Callouts keep their own folding beside it.
- **The Outline follows the caret.** The heading you are under is marked in the Outline view and kept in sight, in Markdown, Quarto and LaTeX alike.
- Not taken: t-shoot's newer table-cell editing (it would replace Live Writer's own tables, with wikilinks, quotes and math in cells) and his CRLF rework (Live Writer has its own, tested).

## 1.2.1

Housekeeping; nothing changes in how Live Writer works.

- The code is one project: features in `features/` folders, modules named for what they do (`bib.ts`, `citations.ts`, `quarto.ts`, …), messages and functions without the old `plus` prefix, and the markers that kept changes apart from t-shoot's code removed. Files the former upstream project needed are gone.
- The update notice and the update check say Live Writer.
- Two end-to-end tests that failed only under load now wait for focus and layout.

## 1.2.0

- **Rewrite with Claude**, a submenu on a selection (it replaces *Paraphrase with Claude*): **Paraphrase**, **Tighten** (shorter, dropping no claim, number or hedge), **More Formal**, **Translate to English** and **Translate to Thai** (technical terms rendered as each literature names them, the same way each time). Every mode keeps the meaning, numbers, citations and LaTeX/Markdown markup; the card says which mode it ran.
- **`liveWriter.plus.claudeModel`**: the model these use (`sonnet`, `opus`, or a full name); empty keeps Claude Code's default.

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
