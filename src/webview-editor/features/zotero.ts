import { type EditorView, ViewPlugin } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { ZoteroLinks } from '../../shared/messages';
import { placeCard } from './cm';
import { sendToHost, request } from './hostRequests';

/**
 * A cited paper, one click from its PDF in Zotero.
 *
 * - A pointer resting on a Quarto citation or a LaTeX `\cite` opens a card
 *   with each work's entry and *Open PDF* / *Show in Zotero* (a vault note's
 *   `[@key]` gets the same row in its link card, linkPreview.ts).
 * - Right-click → *Open PDF in Zotero* does it from any citation.
 *
 * Citation elements carry `data-citekeys` (comma-separated) and
 * `data-citedesc` (one entry per line); the host finds the links
 * (src/editor/features/zotero.ts).
 */

/** The right-click menu's context for a citation, and for a citation that is also a link. */
export const CITE_CONTEXT = JSON.stringify({ mlpCite: true });
export const CITE_LINK_CONTEXT = JSON.stringify({ mlpLink: true, mlpCite: true });

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; links: Promise<ZoteroLinks> }>();

/** The Zotero links for a citation key, asked of the host and kept for a minute (a PDF may be added meanwhile). */
export function zoteroLinks(key: string): Promise<ZoteroLinks> {
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.links;
	const none: ZoteroLinks = { pdf: null, item: null, note: 'Zotero did not answer.' };
	const links = request<ZoteroLinks>((requestId) => ({ type: 'zoteroLinks', requestId, key }), none, 6000);
	cache.set(key, { at: Date.now(), links });
	return links;
}

export function openInZotero(url: string): void {
	sendToHost({ type: 'hostAction', action: 'openZotero', url });
}

function button(label: string, url: string, done?: () => void): HTMLElement {
	const b = document.createElement('button');
	b.type = 'button';
	b.className = 'mlp-zotero-btn';
	b.textContent = label;
	b.addEventListener('mousedown', (event) => {
		if (event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		openInZotero(url);
		done?.();
	});
	return b;
}

/** *Open PDF* and *Show in Zotero* for one key, or why there are none; filled in when the host answers. */
export function zoteroRow(key: string, done?: () => void): HTMLElement {
	const row = document.createElement('div');
	row.className = 'mlp-zotero-row';
	const note = (text: string) => {
		const span = document.createElement('span');
		span.className = 'mlp-zotero-note';
		span.textContent = text;
		return span;
	};
	row.appendChild(note('Zotero…'));
	void zoteroLinks(key).then((links) => {
		row.replaceChildren();
		if (links.pdf) row.appendChild(button('Open PDF', links.pdf, done));
		if (links.item) row.appendChild(button('Show in Zotero', links.item, done));
		if (links.note) row.appendChild(note(links.note));
	});
	return row;
}

/** The keys a citation element stands for, and each one's entry. */
export function citeKeysOf(el: HTMLElement): { key: string; desc: string }[] {
	const keys = (el.dataset.citekeys ?? '').split(',').filter(Boolean);
	const descs = (el.dataset.citedesc ?? '').split('\n');
	return keys.map((key, i) => ({ key, desc: descs[i] || key }));
}

const CITATION = '.mlp-qcite, .mlp-tex-cite';
const SHOW_DELAY_MS = 350;
const HIDE_DELAY_MS = 250;

/** The card over a Quarto or LaTeX citation the pointer rests on. */
export const citeCardExtension: Extension = ViewPlugin.fromClass(
	class {
		private card: HTMLElement | null = null;
		private anchor: HTMLElement | null = null;
		private showTimer: ReturnType<typeof setTimeout> | undefined;
		private hideTimer: ReturnType<typeof setTimeout> | undefined;

		private readonly onOver = (event: MouseEvent) => {
			const el = (event.target as HTMLElement | null)?.closest?.(CITATION) as HTMLElement | null;
			if (!el?.dataset.citekeys) return;
			clearTimeout(this.hideTimer);
			if (this.card && this.anchor === el) return;
			clearTimeout(this.showTimer);
			this.showTimer = setTimeout(() => this.open(el), SHOW_DELAY_MS);
		};
		private readonly onOut = (event: MouseEvent) => {
			const el = (event.target as HTMLElement | null)?.closest?.(CITATION);
			if (!el || el.contains(event.relatedTarget as Node | null)) return;
			clearTimeout(this.showTimer);
			this.scheduleHide();
		};
		private readonly onPress = (event: MouseEvent) => {
			if (this.card && !this.card.contains(event.target as Node)) this.hide();
		};
		private readonly onScroll = () => this.hide();

		constructor(private readonly view: EditorView) {
			view.dom.addEventListener('mouseover', this.onOver);
			view.dom.addEventListener('mouseout', this.onOut);
			view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });
			document.addEventListener('mousedown', this.onPress, true);
		}

		private scheduleHide() {
			clearTimeout(this.hideTimer);
			this.hideTimer = setTimeout(() => this.hide(), HIDE_DELAY_MS);
		}

		private hide() {
			clearTimeout(this.showTimer);
			clearTimeout(this.hideTimer);
			this.card?.remove();
			this.card = null;
			this.anchor = null;
		}

		private open(el: HTMLElement) {
			if (!el.isConnected) return;
			this.hide();
			const card = document.createElement('div');
			card.className = 'mlp-link-preview mlp-cite-card';
			for (const { key, desc } of citeKeysOf(el)) {
				const entry = document.createElement('div');
				entry.className = 'mlp-cite-entry';
				const text = document.createElement('div');
				text.className = 'mlp-cite-desc';
				text.textContent = desc;
				entry.append(text, zoteroRow(key, () => this.hide()));
				card.appendChild(entry);
			}
			card.addEventListener('mouseenter', () => clearTimeout(this.hideTimer));
			card.addEventListener('mouseleave', () => this.scheduleHide());
			document.body.appendChild(card);
			placeCard(card, el);
			this.card = card;
			this.anchor = el;
		}

		destroy() {
			this.hide();
			this.view.dom.removeEventListener('mouseover', this.onOver);
			this.view.dom.removeEventListener('mouseout', this.onOut);
			this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
			document.removeEventListener('mousedown', this.onPress, true);
		}
	},
);
