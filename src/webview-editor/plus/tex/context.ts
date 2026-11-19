import { StateEffect, StateField } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { HostToEditorMessage, PlusEditorToHostMessage, PlusTexAsset, PlusTexContext } from '../../../shared/messages';
import { scanTex, type TexScan } from '../../../shared/plusTexScan';

/**
 * md-live-preview-plus: what the LaTeX Live Preview knows beyond the file
 * itself, sent by the host (src/editor/plus/tex.ts): the numbers the last
 * build gave labels and citations, the bibliography, the root file's macros.
 * Kept in editor state so a new context redraws whatever depends on it.
 */

export const EMPTY_CONTEXT: PlusTexContext = { labels: {}, cites: {}, bib: {}, macros: {}, root: '' };

export const setTexContext = StateEffect.define<PlusTexContext>();

export const texContextField = StateField.define<PlusTexContext>({
	create: () => EMPTY_CONTEXT,
	update(value, tr) {
		for (const e of tr.effects) if (e.is(setTexContext)) return e.value;
		return value;
	},
});

/** The scan of the current document, redone on every change (it is linear and fast). */
export const texScanField = StateField.define<TexScan>({
	create: (state) => scanTex(state.doc.toString()),
	update: (value, tr) => (tr.docChanged ? scanTex(tr.state.doc.toString()) : value),
});

// ── Requests to the host ────────────────────────────────────────────────────

let post: (message: PlusEditorToHostMessage) => void = () => undefined;
let nextId = 1;
const waiting = new Map<number, (asset: PlusTexAsset) => void>();
const assets = new Map<string, Promise<PlusTexAsset>>();

export function setTexPoster(poster: (message: PlusEditorToHostMessage) => void): void {
	post = poster;
}

const MISSING = (path: string): PlusTexAsset => ({ status: 'missing', src: null, name: path });

/**
 * A loadable URI for `\includegraphics{path}`, resolved by the host the way
 * LaTeX would (beside the root file, `\graphicspath`, the usual extensions).
 * Cached until the next context, which a rebuild sends.
 */
export function resolveTexAsset(path: string): Promise<PlusTexAsset> {
	let found = assets.get(path);
	if (!found) {
		const requestId = nextId++;
		found = new Promise<PlusTexAsset>((resolve) => {
			const timer = setTimeout(() => {
				waiting.delete(requestId);
				resolve(MISSING(path));
			}, 20_000);
			waiting.set(requestId, (asset) => {
				clearTimeout(timer);
				resolve(asset);
			});
			post({ type: 'plusTexAsset', requestId, path });
		});
		assets.set(path, found);
		void found.then((asset) => asset.status === 'missing' && assets.delete(path));
	}
	return found;
}

/** Handles the host's LaTeX messages. Returns true when the message was one. */
export function handleTexHostMessage(view: EditorView | undefined, message: HostToEditorMessage): boolean {
	if (message.type === 'plusTexAssetResult') {
		const resolve = waiting.get(message.requestId);
		waiting.delete(message.requestId);
		resolve?.(message.asset);
		return true;
	}
	if (message.type === 'plusTexContext') {
		assets.clear();
		view?.dispatch({ effects: setTexContext.of(message.context) });
		return true;
	}
	return false;
}
