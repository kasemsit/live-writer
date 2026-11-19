import type { EditorView } from '@codemirror/view';
import type { HostToEditorMessage, PlusQuartoProject } from '../../shared/messages';
import { citeTerms, type CiteFormat } from '../../shared/plusCitations';
import { QUARTO_LABELS } from '../../shared/plusQuarto';
import { blockRevealChanged } from '../cmUtils';
import { postPlus } from './hostRequests';

/**
 * md-live-preview-plus: what this document takes from its Quarto project,
 * sent by the host (src/editor/plus/quartoProject.ts) on request and again
 * whenever `_quarto.yml` or a bibliography changes.
 *
 * Module state rather than editor state: table cells and hover cards draw
 * citations through the inline renderer, which has no editor state to read.
 */

let project: PlusQuartoProject = { labels: {}, citations: null };
let format: CiteFormat | null = null;
let asked = false;

/** A word the preview draws (`crossref-fig-title`, `callout-tip-title`, …): the project's, else Quarto's default. */
export function quartoLabel(key: string): string | undefined {
	return project.labels[key] ?? QUARTO_LABELS[key];
}

/** How `[@key]` reads in this document; null when citations link to `@key` notes instead. */
export function citationFormat(): CiteFormat | null {
	return format;
}

/** Asks the host, once, to send the project now and on every change. */
export function watchQuartoProject(): void {
	if (asked) return;
	asked = true;
	postPlus({ type: 'plusQuartoWatch' });
}

const listeners = new Set<(view: EditorView) => void>();

/** Runs `fn` after each new project, for drawings an editor rebuild does not redo. */
export function onQuartoProject(fn: (view: EditorView) => void): void {
	listeners.add(fn);
}

/** Handles the host's project message. Returns true when the message was one. */
export function handleQuartoHostMessage(view: EditorView | undefined, message: HostToEditorMessage): boolean {
	if (message.type !== 'plusQuartoProject') return false;
	project = message.project;
	const c = project.citations;
	format = c ? { style: c.style, terms: citeTerms(c.lang), bib: c.bib } : null;
	if (view) {
		// Figures (livePreviewPlugin), callouts, references and citations all rebuild on this effect.
		view.dispatch({ effects: blockRevealChanged.of(null) });
		for (const fn of listeners) fn(view);
	}
	return true;
}
