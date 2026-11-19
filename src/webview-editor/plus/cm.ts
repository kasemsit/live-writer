import { EditorView, type ViewUpdate } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
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

/** True when a table or block switched between drawn and source in this update. */
export function revealChanged(update: ViewUpdate): boolean {
	return update.transactions.some((tr) => tr.effects.some((e) => e.is(blockRevealChanged)));
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
