import type { EditorView } from '@codemirror/view';
import { placeCardAt } from './cm';
import { sendToHost, request } from './hostRequests';
import { REWRITE_MODES, type RewriteMode } from '../../shared/rewrite';

/**
 * Rewrite with Claude (right-click on a selection).
 * The host has Claude Code, or the mode's own command, rewrite the passage (src/editor/features/paraphrase.ts);
 * a card under the selection shows the result to replace the passage with, or
 * to copy. Replacing is an ordinary edit, undone as one.
 */

let open: { card: HTMLElement; close: () => void } | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	node.className = cls;
	if (text) node.textContent = text;
	return node;
}

export function paraphraseSelection(view: EditorView, range?: { from: number; to: number }, mode: RewriteMode = 'polish', engine: 'claude' | 'command' = 'claude'): void {
	const { from, to } = range ?? view.state.selection.main;
	if (from === to) return;
	open?.close();
	const source = view.state.sliceDoc(from, to);

	const card = el('div', 'mlp-link-preview mlp-paraphrase-card');
	const label = REWRITE_MODES[mode].label;
	const head = el('div', 'mlp-lp-title', label);
	const body = el('div', 'mlp-paraphrase-text', 'Rewriting the passage…');
	// A warning the engine printed while succeeding (liveWriter.plus.rewriteCommands).
	const note = el('div', 'mlp-paraphrase-note');
	const actions = el('div', 'mlp-zotero-row');
	card.append(head, body, note, actions);
	document.body.appendChild(card);
	const at = view.coordsAtPos(to) ?? view.coordsAtPos(from);
	if (at) placeCardAt(card, at);

	const onPress = (event: MouseEvent) => {
		if (!card.contains(event.target as Node)) close();
	};
	const onKey = (event: KeyboardEvent) => {
		if (event.key === 'Escape') close();
	};
	const close = () => {
		card.remove();
		document.removeEventListener('mousedown', onPress, true);
		document.removeEventListener('keydown', onKey, true);
		if (open?.card === card) open = null;
	};
	document.addEventListener('mousedown', onPress, true);
	document.addEventListener('keydown', onKey, true);
	open = { card, close };

	const button = (label: string, run: () => void) => {
		const b = el('button', 'mlp-zotero-btn', label);
		b.type = 'button';
		b.addEventListener('mousedown', (event) => {
			if (event.button !== 0) return;
			event.preventDefault();
			event.stopPropagation();
			run();
		});
		return b;
	};

	const none = { text: '', error: 'No answer in time.', engine: '', note: '' };
	// A configured command may take up to five minutes.
	void request<{ text: string; error: string; engine: string; note: string }>((requestId) => ({ type: 'rewrite', requestId, text: source, mode, engine }), none, 320_000).then((result) => {
		if (!card.isConnected) return;
		if (result.engine) head.textContent = `${label} with ${result.engine}`;
		note.textContent = result.note;
		if (!result.text) {
			body.textContent = result.error;
			body.classList.add('mlp-paraphrase-error');
			actions.append(button('Close', close));
			return;
		}
		body.textContent = result.text;
		actions.append(
			button('Replace', () => {
				// The passage was edited while Claude worked: replacing would lose that edit.
				if (view.state.sliceDoc(from, to) !== source) {
					body.textContent = 'The passage changed while it was being rewritten; copy the rewrite instead.';
					return;
				}
				view.dispatch({ changes: { from, to, insert: result.text }, selection: { anchor: from, head: from + result.text.length } });
				close();
				view.focus();
			}),
			button('Copy', () => {
				sendToHost({ type: 'hostAction', action: 'copy', text: result.text, notice: 'Copied.' });
				close();
			}),
			button('Close', close),
		);
		if (at) placeCardAt(card, at);
	});
}
