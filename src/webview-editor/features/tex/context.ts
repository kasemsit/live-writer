import { type EditorState, StateEffect, StateField } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { HostToEditorMessage, TexAsset, TexContext, TexPicture } from '../../../shared/messages';
import { readArgs, scanTex, type TexScan } from '../../../shared/texScanner';
import { request } from '../hostRequests';

/**
 * What the LaTeX Live Preview knows beyond the file
 * itself, sent by the host (src/editor/features/tex.ts): the numbers the last
 * build gave labels and citations, the bibliography, the root file's macros.
 * Kept in editor state so a new context redraws whatever depends on it.
 */

/** The `build` of the context in place before the host's first one: nothing has been read yet. */
export const NO_BUILD_YET = 'waiting';

export const EMPTY_CONTEXT: TexContext = { labels: {}, cites: {}, bib: {}, macros: {}, root: '', build: NO_BUILD_YET };

export const setTexContext = StateEffect.define<TexContext>();

export const texContextField = StateField.define<TexContext>({
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

const ownLabels = new WeakMap<TexScan, Set<string>>();

/**
 * Labels defined in this file (outside comments and verbatim, in math too):
 * for telling "not built yet" from "undefined", and for completion.
 */
export function fileLabels(state: EditorState): Set<string> {
	const scan = state.field(texScanField);
	let set = ownLabels.get(scan);
	if (!set) {
		const text = state.doc.toString();
		const keys: string[] = [];
		for (const cmd of scan.commands) {
			if (cmd.name !== 'label') continue;
			const arg = readArgs(text, cmd.to, 'm')?.args[0];
			if (arg) keys.push(text.slice(arg.from, arg.to).trim());
		}
		for (const m of scan.maths) for (const l of text.slice(m.innerFrom, m.innerTo).matchAll(/\\label\s*\{([^{}]*)\}/g)) keys.push(l[1].trim());
		// An empty `\label{}` (as just typed, with its closing brace put in) names nothing.
		set = new Set(keys.filter(Boolean));
		ownLabels.set(scan, set);
	}
	return set;
}

// ── Requests to the host ────────────────────────────────────────────────────

const assets = new Map<string, Promise<TexAsset>>();

const MISSING = (path: string): TexAsset => ({ status: 'missing', src: null, name: path });

/**
 * A loadable URI for `\includegraphics{path}`, resolved by the host the way
 * LaTeX would (beside the root file, `\graphicspath`, the usual extensions).
 * Cached until the next context, which a rebuild sends.
 */
export function resolveTexAsset(path: string): Promise<TexAsset> {
	let found = assets.get(path);
	if (!found) {
		// A PDF figure is converted to PNG first, which can take a while.
		found = request<TexAsset>((requestId) => ({ type: 'texAsset', requestId, path }), MISSING(path), 20_000);
		assets.set(path, found);
		void found.then((asset) => asset.status === 'missing' && assets.delete(path));
	}
	return found;
}

const pictures = new Map<string, Promise<TexPicture>>();

/**
 * The picture on `lines` (1-based): the last build's drawing, cut from its
 * PDF by the host, or the picture compiled on its own when the build is older. Cached until the next context, which a rebuild sends.
 */
export function resolveTexPicture(lines: number[], build: string, source = ''): Promise<TexPicture> {
	// The source is part of the key: an edited picture is drawn again (on its own when the build is older).
	const key = `${build}|${lines.join(',')}|${source}`;
	let found = pictures.get(key);
	if (!found) {
		const none: TexPicture = { status: 'missing', src: null, note: 'The host did not answer.', stale: false };
		found = request<TexPicture>((requestId) => ({ type: 'texPicture', requestId, lines, source }), none, 60_000);
		pictures.set(key, found);
	}
	return found;
}

/** Handles the host's LaTeX context. Returns true when the message was one. (Replies go through hostRequests.) */
export function handleTexHostMessage(view: EditorView | undefined, message: HostToEditorMessage): boolean {
	if (message.type === 'texContext') {
		assets.clear();
		pictures.clear();
		view?.dispatch({ effects: setTexContext.of(message.context) });
		return true;
	}
	return false;
}
