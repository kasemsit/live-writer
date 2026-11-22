/**
 * Where a source line landed in the last build's PDF,
 * from `synctex view` — how the LaTeX Live Preview shows a `tikzpicture` as
 * the build drew it, without compiling anything (src/editor/features/tex.ts).
 */

/** A box in the PDF, in big points from the page's top left; `v` is its baseline. */
export interface SynctexBox {
	page: number;
	h: number;
	v: number;
	W: number;
	H: number;
}

/** The boxes `synctex view` printed, in order. */
export function parseSynctexView(output: string): SynctexBox[] {
	const boxes: SynctexBox[] = [];
	for (const block of output.split(/^Output:/m).slice(1)) {
		const field = (name: string) => {
			const m = new RegExp(`^${name}:(-?[\\d.]+)`, 'm').exec(block);
			return m ? Number(m[1]) : NaN;
		};
		const box = { page: field('Page'), h: field('h'), v: field('v'), W: field('W'), H: field('H') };
		if (Object.values(box).every(Number.isFinite)) boxes.push(box);
	}
	return boxes;
}

/**
 * The picture's box among those found for its lines: the largest. A line
 * inside a `tikzpicture` maps to the box of the whole picture; a stray tiny
 * box (a node's text) is never the largest. Null when nothing has an area.
 */
export function largestBox(boxes: readonly SynctexBox[]): SynctexBox | null {
	let best: SynctexBox | null = null;
	for (const b of boxes) {
		if (b.W < 2 || b.H < 2) continue;
		if (!best || b.W * b.H > best.W * best.H) best = b;
	}
	return best;
}

/**
 * The `pdftoppm` crop for a box at `dpi`, in pixels: a little margin all
 * round, and some below the baseline, which SyncTeX's box does not include.
 */
export function cropOf(box: SynctexBox, dpi: number, margin = 3): { x: number; y: number; width: number; height: number } {
	const px = (bp: number) => Math.round((bp * dpi) / 72);
	const left = Math.max(0, box.h - margin);
	const top = Math.max(0, box.v - box.H - margin);
	return { x: px(left), y: px(top), width: px(box.W + 2 * margin), height: px(box.H + 2 * margin + 2) };
}
