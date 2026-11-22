import { EditorView, type ViewUpdate } from '@codemirror/view';
import type { EditorState, StateEffectType } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import { blockRevealChanged, isBlockRevealed } from '../cmUtils';

/**
 * md-live-preview-plus: editor helpers the plus features share — where the
 * document shows as source, and taking the reader to a spot.
 */

const SOURCE_NODES = /^(FencedCode|CodeBlock|InlineCode|HTMLBlock|CommentBlock|InlineMath|BlockMath)$/;

/**
 * True where Markdown is shown as source rather than rendered: code, raw HTML,
 * and a table switched to code mode. A rendered table is not source — its
 * widget renders cell links itself through `renderInlineInto`.
 */
export function inSourceContext(state: EditorState, pos: number): boolean {
	for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
		if (SOURCE_NODES.test(node.name)) return true;
		if (node.name === 'Table') return isBlockRevealed(state.doc.lineAt(node.from).from);
	}
	return false;
}

/**
 * True when a table or block switched between drawn and source in this update
 * (which also signals a new Quarto project), or it carries one of `also`.
 */
export function revealChanged(update: ViewUpdate, ...also: StateEffectType<unknown>[]): boolean {
	return update.transactions.some((tr) => tr.effects.some((e) => e.is(blockRevealChanged) || also.some((t) => e.is(t))));
}

/** True inside a table switched to code mode (shown as source). */
export function inRevealedTable(state: EditorState, pos: number): boolean {
	for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
		if (node.name === 'Table') return isBlockRevealed(state.doc.lineAt(node.from).from);
	}
	return false;
}

/** Scrolls `pos` to the middle of the editor and briefly highlights its line. */
export function jumpTo(view: EditorView, pos: number): void {
	view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
	let tries = 0;
	const flash = () => {
		try {
			const scroller = view.scrollDOM;
			const block = view.lineBlockAt(pos);
			const box = scroller.getBoundingClientRect();
			const top = block.top + view.documentTop - box.top + scroller.scrollTop;
			const offset = top - scroller.scrollTop;
			if (offset < -5 || offset > scroller.clientHeight) {
				if (++tries < 12) setTimeout(flash, 90);
				return;
			}
			if (getComputedStyle(scroller).position === 'static') scroller.style.position = 'relative';
			const mark = document.createElement('div');
			mark.className = 'mlp-fn-flashbox';
			mark.style.top = `${top}px`;
			mark.style.height = `${block.height}px`;
			scroller.appendChild(mark);
			setTimeout(() => mark.remove(), 1500);
		} catch {
			if (++tries < 12) setTimeout(flash, 90);
		}
	};
	setTimeout(flash, 60);
}

/** Puts a floating card under `anchor`, or above it when there is no room below, inside the window. */
export function placeCard(card: HTMLElement, anchor: HTMLElement): void {
	placeCardAt(card, anchor.getBoundingClientRect());
}

/**
 * Puts a floating card by a screen rectangle (an element's, or a position's
 * from coordsAtPos), inside the window: below it, moving above when only
 * there it fits; or, with `above`, above it unless it does not fit there.
 * `shift` moves it sideways.
 */
export function placeCardAt(card: HTMLElement, r: { left: number; top: number; bottom: number }, { above = false, shift = 0 } = {}): void {
	const vw = document.documentElement.clientWidth;
	const vh = document.documentElement.clientHeight;
	const w = card.offsetWidth;
	const h = card.offsetHeight;
	card.style.left = `${Math.max(8, Math.min(r.left + shift, vw - w - 8))}px`;
	const below = r.bottom + 6;
	const over = r.top - h - 6;
	const fitsBelow = below + h <= vh - 8;
	const fitsAbove = over >= 8;
	card.style.top = `${(above ? fitsAbove : !fitsBelow && fitsAbove) ? over : below}px`;
}
