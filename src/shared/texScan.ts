/**
 * Reading LaTeX source, one module per job —
 *
 * - texScanner.ts: the scanner (comments, math, verbatim, environments,
 *   commands), brace groups and command arguments, lookups over a scan;
 * - texHeadings.ts: sectioning commands, for the outline;
 * - texText.ts: symbols, accents and ligatures, and LaTeX as plain text;
 * - texMacros.ts: macro definitions, for KaTeX;
 * - texProject.ts: the root, inputs, bibliographies and graphics path.
 *
 * This module only re-exports what code outside the LaTeX preview imports
 * from here (upstream's MarkdownLivePreviewProvider for the outline, the
 * right-click menu, bib.ts), so those files keep their imports. The
 * modules above import one another directly, never this one. The scanner
 * cannot live here: the headings need it, so re-exporting them from its own
 * module would be an import cycle.
 */

export { extractTexHeadings } from './texHeadings';
export { texToPlain } from './texText';
