import { Decoration, type DecorationSet, EditorView, type LayerMarker, ViewPlugin, type ViewUpdate, WidgetType, layer } from '@codemirror/view';
import { Prec, StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { cursorTouchesRange } from '../cmUtils';
import { blockReplacedLines, cellInlineHooks } from '../livePreviewPlugin';
import { renderInlineInto } from '../tableCellInline';
import { isDarkColour, PAUSE, slideDeck, type SlideDeck, type TitleSlide } from '../../shared/slides';

/**
 * A Quarto presentation (`format: revealjs`, `beamer`, `pptx`) drawn as its
 * slides: each slide a card with its number (`3 / 42`), the front matter's
 * title slide first, a section slide filled with its `background-color`, and
 * `. . .` shown as a pause. The text stays one editable document.
 *
 * The cards are a layer behind the text, not line decorations: a line that a
 * table or `$$` widget replaces must carry no line decoration (see
 * blockReplacedLines), and a slide may hold either.
 */

/** Space above each card, inside its number widget; the card starts below it. */
const GAP = 26;
/** How far the card reaches past the text column on each side. */
const INSET = 14;
/** Space between a card's last line and its bottom edge. */
const BOTTOM = 14;

const deckField = StateField.define<SlideDeck | null>({
	create: (state) => slideDeck(state.doc.toJSON()),
	update: (deck, tr) => (tr.docChanged ? slideDeck(tr.state.doc.toJSON()) : deck),
});

/** The number above a card: `3 / 42`. The card's top edge is GAP below the widget's top. */
class SlideHeadWidget extends WidgetType {
	constructor(
		readonly number: number,
		readonly total: number,
		readonly section: boolean,
	) {
		super();
	}
	eq(other: SlideHeadWidget): boolean {
		return other.number === this.number && other.total === this.total && other.section === this.section;
	}
	toDOM(): HTMLElement {
		const head = document.createElement('div');
		head.className = 'mlp-slide-head';
		head.style.paddingTop = `${GAP}px`;
		const num = head.appendChild(document.createElement('span'));
		num.className = 'mlp-slide-num';
		num.textContent = `${this.number} / ${this.total}`;
		return head;
	}
	get estimatedHeight(): number {
		return GAP + 22;
	}
	ignoreEvent(): boolean {
		return false;
	}
}

/** The title slide, from the front matter: a card of its own. */
class TitleSlideWidget extends WidgetType {
	private readonly signature: string;
	constructor(
		readonly slide: TitleSlide,
		readonly total: number,
	) {
		super();
		this.signature = JSON.stringify([slide, total]);
	}
	eq(other: TitleSlideWidget): boolean {
		return other.signature === this.signature;
	}
	toDOM(): HTMLElement {
		const wrap = document.createElement('div');
		wrap.className = 'mlp-slide-titlewrap';
		wrap.style.paddingTop = `${GAP}px`;
		const card = wrap.appendChild(document.createElement('div'));
		card.className = 'mlp-slide-titlecard';
		card.style.marginInline = `-${INSET}px`;
		if (this.slide.background) {
			card.style.background = this.slide.background;
			if (isDarkColour(this.slide.background)) card.classList.add('mlp-slide-dark');
		}
		const num = card.appendChild(document.createElement('span'));
		num.className = 'mlp-slide-num';
		num.textContent = `1 / ${this.total}`;
		const add = (cls: string, text: string) => {
			if (!text) return;
			const el = card.appendChild(document.createElement('div'));
			el.className = cls;
			renderInlineInto(el, text, cellInlineHooks);
		};
		add('mlp-slide-title', this.slide.title);
		add('mlp-slide-subtitle', this.slide.subtitle);
		add('mlp-slide-author', this.slide.author);
		add('mlp-slide-institute', this.slide.institute);
		add('mlp-slide-date', this.slide.date);
		return wrap;
	}
	ignoreEvent(): boolean {
		return false;
	}
}

class PauseWidget extends WidgetType {
	eq(): boolean {
		return true;
	}
	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.className = 'mlp-slide-pause';
		span.textContent = 'pause';
		span.title = '. . . — the rest of the slide appears on the next click';
		return span;
	}
	ignoreEvent(): boolean {
		return false;
	}
}

function blocks(state: EditorState): DecorationSet {
	const deck = state.field(deckField);
	if (!deck) return Decoration.none;
	const { doc } = state;
	const out: Range<Decoration>[] = [];
	if (deck.titleSlide) {
		const widget = new TitleSlideWidget(deck.titleSlide, deck.total);
		const after = deck.frontMatterEnd + 2;
		out.push(
			after <= doc.lines
				? Decoration.widget({ widget, block: true, side: -2 }).range(doc.line(after).from)
				: Decoration.widget({ widget, block: true, side: 1 }).range(doc.length),
		);
	}
	for (const slide of deck.slides) {
		const widget = new SlideHeadWidget(slide.number, deck.total, slide.kind === 'section');
		out.push(Decoration.widget({ widget, block: true, side: -1 }).range(doc.line(slide.from + 1).from));
	}
	return Decoration.set(out, true);
}

// Block widgets must come from the state, not from a view plugin.
const blockField = StateField.define<DecorationSet>({
	create: blocks,
	update: (value, tr) => (tr.state.field(deckField) !== tr.startState.field(deckField) ? blocks(tr.state) : value),
	provide: (f) => EditorView.decorations.from(f),
});

const hidden = Decoration.replace({});
const pauseLine = Decoration.line({ class: 'mlp-slide-pause-line' });

/** What changes with the caret: rules and pauses show as source when it is on them; dark slides get light text. */
function inline(view: EditorView): DecorationSet {
	const { state } = view;
	const deck = state.field(deckField);
	if (!deck) return Decoration.none;
	const { doc } = state;
	const out: Range<Decoration>[] = [];
	let replaced: Set<number> | null = null;
	for (const { from, to } of view.visibleRanges) {
		const first = doc.lineAt(from).number - 1;
		const last = doc.lineAt(to).number - 1;
		for (const slide of deck.slides) {
			if (slide.to < first || slide.from > last) continue;
			const line = doc.line(slide.from + 1);
			if (slide.rule && !cursorTouchesRange(state, line.from, line.to)) out.push(hidden.range(line.from, line.to));
			const dark = slide.background && isDarkColour(slide.background);
			if (slide.kind !== 'section' && !dark) continue;
			replaced ??= blockReplacedLines(state, syntaxTree(state).topNode);
			const cls = `${slide.kind === 'section' ? 'mlp-slide-section' : ''}${dark ? ' mlp-slide-dark' : ''}`.trim();
			for (let n = Math.max(slide.from, first); n <= Math.min(slide.to, last); n++) {
				if (!replaced.has(n + 1)) out.push(Decoration.line({ class: cls }).range(doc.line(n + 1).from));
			}
		}
		for (let n = first; n <= last; n++) {
			const line = doc.line(n + 1);
			if (!PAUSE.test(line.text)) continue;
			out.push(pauseLine.range(line.from));
			if (!cursorTouchesRange(state, line.from, line.to)) out.push(Decoration.replace({ widget: new PauseWidget() }).range(line.from, line.to));
		}
	}
	return Decoration.set(out, true);
}

const inlinePlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) {
			this.decorations = inline(view);
		}
		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged || update.selectionSet) this.decorations = inline(update.view);
		}
	},
	{ decorations: (v) => v.decorations },
);

/** One card behind a slide's text. */
class SlideCard implements LayerMarker {
	constructor(
		readonly left: number,
		readonly top: number,
		readonly width: number,
		readonly height: number,
		readonly background: string | null,
	) {}
	eq(other: SlideCard): boolean {
		return (
			other.left === this.left && other.top === this.top && other.width === this.width && other.height === this.height && other.background === this.background
		);
	}
	draw(): HTMLElement {
		const el = document.createElement('div');
		this.place(el);
		return el;
	}
	update(dom: HTMLElement, prev: LayerMarker): boolean {
		if (!(prev instanceof SlideCard)) return false;
		this.place(dom);
		return true;
	}
	private place(el: HTMLElement): void {
		el.className = `mlp-slide-card${this.background ? ' mlp-slide-filled' : ''}`;
		el.style.left = `${this.left}px`;
		el.style.top = `${this.top}px`;
		el.style.width = `${this.width}px`;
		el.style.height = `${this.height}px`;
		el.style.background = this.background ?? '';
	}
}

function cards(view: EditorView): LayerMarker[] {
	const deck = view.state.field(deckField, false);
	if (!deck || !deck.slides.length) return [];
	const { doc } = view.state;
	const scroller = view.scrollDOM.getBoundingClientRect();
	const baseLeft = scroller.left - view.scrollDOM.scrollLeft;
	const baseTop = scroller.top - view.scrollDOM.scrollTop;
	const content = view.contentDOM.getBoundingClientRect();
	const style = getComputedStyle(view.contentDOM);
	const padLeft = parseFloat(style.paddingLeft) || 0;
	const padRight = parseFloat(style.paddingRight) || 0;
	const left = content.left - baseLeft + padLeft - INSET;
	const width = content.width - padLeft - padRight + 2 * INSET;
	const offset = view.documentTop - baseTop;
	const { from: viewFrom, to: viewTo } = view.viewport;
	const out: LayerMarker[] = [];
	for (const slide of deck.slides) {
		const start = doc.line(slide.from + 1).from;
		const end = doc.line(slide.to + 1).to;
		if (end < viewFrom || start > viewTo) continue;
		const first = view.lineBlockAt(start);
		const parts = Array.isArray(first.type) ? (first.type as readonly { top: number; widget: WidgetType | null }[]) : [];
		const head = parts.find((b) => b.widget instanceof SlideHeadWidget);
		const top = head ? head.top + GAP : first.top - 6;
		const bottom = view.lineBlockAt(end).bottom + BOTTOM;
		out.push(new SlideCard(left, offset + top, width, Math.max(0, bottom - top), slide.background));
	}
	return out;
}

// Lowest precedence: drawn beneath the selection layer, which comes earlier in the order.
const cardLayer = Prec.lowest(
	layer({
		above: false,
		class: 'mlp-slide-layer',
		markers: cards,
		update: (update) => update.docChanged || update.viewportChanged || update.geometryChanged,
	}),
);

export const slidesExtension: Extension = [deckField, blockField, inlinePlugin, cardLayer];
