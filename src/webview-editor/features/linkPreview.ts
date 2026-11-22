import { type EditorView, ViewPlugin } from '@codemirror/view';
import { placeCard } from './cm';
import { zoteroRow } from './zotero';
import type { Extension } from '@codemirror/state';
import type { NotePreview } from '../../shared/messages';
import { renderInlineInto } from '../tableCellInline';
import { cellInlineHooks } from '../livePreviewPlugin';
import { previewLink } from './hostRequests';
import { parseMarkdownBlocks, type MdBlock } from '../../shared/markdownBlocks';
import { calloutStyle } from './callouts';
import { renderMathInto } from './math';

/**
 * Hover preview for wikilinks, like Obsidian's page preview: resting the
 * pointer on `[[note#^ma-32]]` shows that block — for a heading, its whole
 * section — in a card, without leaving the note. The card stays open while the
 * pointer is on it, so a long section can be scrolled; its title opens the note.
 */

const SHOW_DELAY_MS = 350;
const HIDE_DELAY_MS = 250;
const CACHE_MS = 15_000;

const inline = (el: HTMLElement, text: string) => renderInlineInto(el, text, cellInlineHooks);

/**
 * The card's block renderer: headings, paragraphs (line breaks kept, as
 * Obsidian shows them), lists, quotes and callouts, tables, code and display
 * math, from the structure Copy as Rich Text also uses. Inline Markdown goes
 * through the same renderer table cells use.
 */
export function renderMarkdownBlocks(parent: HTMLElement, text: string): void {
	renderBlocks(parent, parseMarkdownBlocks(text));
}

function renderBlocks(parent: HTMLElement, blocks: MdBlock[]): void {
	const add = (tag: string, cls: string) => {
		const el = document.createElement(tag);
		el.className = cls;
		return parent.appendChild(el);
	};
	const line = (into: HTMLElement, text: string) => inline(into.appendChild(document.createElement('span')), text);
	for (const block of blocks) {
		switch (block.kind) {
			case 'heading':
				inline(add('div', `mlp-lp-h mlp-lp-h${block.level}`), block.text);
				break;
			case 'paragraph': {
				const p = add('p', 'mlp-lp-p');
				block.lines.forEach((text, i) => {
					if (i) p.appendChild(document.createElement('br'));
					line(p, text);
				});
				break;
			}
			case 'code':
				add('pre', 'mlp-lp-code').textContent = block.text;
				break;
			case 'math':
				renderMathInto(add('div', 'mlp-math mlp-math-display'), block.tex, true);
				break;
			case 'quote': {
				const box = add('div', 'mlp-lp-quote');
				if (block.callout) {
					box.classList.add('mlp-lp-callout', `mlp-co-${calloutStyle(block.callout.type).colour}`);
					const title = document.createElement('div');
					title.className = 'mlp-lp-callout-title';
					inline(title, block.callout.title);
					box.appendChild(title);
				}
				renderBlocks(box, block.children);
				break;
			}
			case 'table': {
				const table = add('table', 'mlp-lp-table') as HTMLTableElement;
				block.rows.forEach((row, r) => {
					const tr = table.insertRow();
					for (const cell of row) inline(tr.appendChild(document.createElement(r ? 'td' : 'th')), cell);
				});
				break;
			}
			case 'list':
				// Flat rows, indented by depth: a card has no room for real list margins.
				for (const item of block.items) {
					const row = add('div', 'mlp-lp-li');
					row.style.paddingLeft = `${1.1 + item.indent * 0.5}em`;
					const mark = row.appendChild(document.createElement('span'));
					mark.className = 'mlp-lp-li-mark';
					mark.textContent = item.ordered ? item.marker : '•';
					const content = row.appendChild(document.createElement('span'));
					if (item.task) content.append(item.task === ' ' ? '☐ ' : '☑ ');
					inline(content, item.text);
					for (const more of item.more) {
						content.appendChild(document.createElement('br'));
						inline(content, more);
					}
				}
				break;
		}
	}
}

const STATUS_NOTE: Record<NotePreview['status'], string> = {
	ok: '',
	missing: 'No note by this name in the workspace.',
	'anchor-missing': 'Heading or block not found; showing the start of the note.',
	'not-markdown': '',
};

export function linkPreviewExtension(onOpen: (href: string) => void): Extension {
	return ViewPlugin.fromClass(
		class {
			private card: HTMLElement | null = null;
			private shownHref = '';
			private hovered: HTMLElement | null = null;
			private showTimer: ReturnType<typeof setTimeout> | undefined;
			private hideTimer: ReturnType<typeof setTimeout> | undefined;
			private readonly cache = new Map<string, { at: number; preview: NotePreview }>();

			private readonly onOver = (event: MouseEvent) => {
				const link = (event.target as HTMLElement | null)?.closest?.('.mlp-wikilink') as HTMLElement | null;
				if (!link || link.closest('.mlp-fn-pop')) return;
				clearTimeout(this.hideTimer);
				this.hovered = link;
				if (this.card && link.dataset.href === this.shownHref) return;
				clearTimeout(this.showTimer);
				this.showTimer = setTimeout(() => void this.open(link), SHOW_DELAY_MS);
			};
			private readonly onOut = (event: MouseEvent) => {
				const link = (event.target as HTMLElement | null)?.closest?.('.mlp-wikilink');
				if (!link || link.contains(event.relatedTarget as Node | null)) return;
				this.hovered = null;
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
				this.shownHref = '';
			}

			private async fetch(target: string): Promise<NotePreview | null> {
				const hit = this.cache.get(target);
				if (hit && Date.now() - hit.at < CACHE_MS) return hit.preview;
				const preview = await previewLink(target);
				if (preview) this.cache.set(target, { at: Date.now(), preview });
				return preview;
			}

			private async open(link: HTMLElement) {
				const href = link.dataset.href ?? '';
				if (!href.startsWith('wiki:')) return;
				const preview = await this.fetch(href.slice('wiki:'.length));
				// The pointer moved on while the host was reading the file.
				if (!preview || this.hovered !== link || !link.isConnected) return;
				this.hide();
				const card = this.render(href, preview);
				document.body.appendChild(card);
				this.card = card;
				this.shownHref = href;
				placeCard(card, link);
			}

			private render(href: string, preview: NotePreview): HTMLElement {
				const card = document.createElement('div');
				card.className = `mlp-link-preview mlp-lp-${preview.status}`;
				const title = document.createElement('div');
				title.className = 'mlp-lp-title';
				title.textContent = preview.title;
				title.title = 'Open';
				title.addEventListener('mousedown', (event) => {
					if (event.button !== 0) return;
					event.preventDefault();
					this.hide();
					onOpen(href);
				});
				card.appendChild(title);
				if (STATUS_NOTE[preview.status]) {
					const note = document.createElement('div');
					note.className = 'mlp-lp-status';
					note.textContent = STATUS_NOTE[preview.status];
					card.appendChild(note);
				}
				const body = document.createElement('div');
				body.className = 'mlp-lp-body';
				if (preview.status === 'not-markdown') body.textContent = preview.text;
				else renderMarkdownBlocks(body, preview.text);
				if (preview.truncated) {
					const more = document.createElement('div');
					more.className = 'mlp-lp-more';
					more.textContent = '…';
					body.appendChild(more);
				}
				if (body.childNodes.length) card.appendChild(body);
				// Links inside the card open too.
				body.addEventListener('mousedown', (event) => {
					const inner = (event.target as HTMLElement).closest('.mlp-wikilink') as HTMLElement | null;
					if (!inner || event.button !== 0) return;
					event.preventDefault();
					this.hide();
					onOpen(inner.dataset.href ?? '');
				});
				// A citation `[@key]` links to its reference note; the paper itself is in Zotero.
				if (href.startsWith('wiki:@')) card.appendChild(zoteroRow(href.slice('wiki:@'.length), () => this.hide()));
				card.addEventListener('mouseenter', () => clearTimeout(this.hideTimer));
				card.addEventListener('mouseleave', () => this.scheduleHide());
				return card;
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
}
