import { renderInlineInto } from '../tableCellInline';
import { TRAILING_BLOCK_ID } from '../../shared/anchors';
import { nestListItems, parseMarkdownBlocks, type MdBlock, type MdListNode } from '../../shared/markdownBlocks';
import { cellInlineHooks } from '../livePreviewPlugin';

/**
 * Markdown → HTML for pasting into Word, Google Docs or an e-mail ("Copy as
 * Rich Text"). The tags are the plain semantic ones those programs map to
 * their own styles — h1–h6, p, ul/ol, blockquote, table — with no classes.
 *
 * What only means something inside the vault is reduced to its text: a
 * wikilink to its label, a citation to `[@key]`, a footnote reference to its
 * number, math to its TeX. Notes to the writer (`<!-- … -->`) and block ids are
 * left out.
 */

function clean(root: HTMLElement): void {
	for (const fn of Array.from(root.querySelectorAll('.mlp-fn'))) {
		const sup = document.createElement('sup');
		sup.textContent = fn.querySelector('.mlp-fn-ref')?.textContent ?? '';
		fn.replaceWith(sup);
	}
	for (const m of Array.from(root.querySelectorAll<HTMLElement>('[data-mlp-tex]'))) {
		m.replaceWith(document.createTextNode(`$${m.dataset.mlpTex}$`));
	}
	for (const a of Array.from(root.querySelectorAll('.mlp-wikilink'))) a.replaceWith(document.createTextNode(a.textContent ?? ''));
	for (const g of Array.from(root.querySelectorAll('.mlp-cite-group'))) g.replaceWith(document.createTextNode(g.textContent ?? ''));
	for (const a of Array.from(root.querySelectorAll('a[data-href]'))) {
		const href = a.getAttribute('data-href') ?? '';
		if (/^[a-z][a-z0-9+.-]*:/i.test(href)) a.setAttribute('href', href);
		else a.replaceWith(...Array.from(a.childNodes));
	}
	for (const img of Array.from(root.querySelectorAll('img'))) img.replaceWith(document.createTextNode(img.getAttribute('alt') ?? ''));
	for (const el of Array.from(root.querySelectorAll('*'))) {
		for (const attr of Array.from(el.attributes)) {
			if (attr.name === 'class' || attr.name === 'title' || attr.name.startsWith('data-')) el.removeAttribute(attr.name);
		}
	}
}

function inline(parent: HTMLElement, text: string): void {
	const span = document.createElement('span');
	renderInlineInto(span, text.replace(TRAILING_BLOCK_ID, ''), cellInlineHooks);
	clean(span);
	parent.append(...Array.from(span.childNodes));
}

function renderList(parent: HTMLElement, list: MdListNode): void {
	const el = document.createElement(list.ordered ? 'ol' : 'ul');
	for (const { item, children } of list.items) {
		const li = document.createElement('li');
		if (item.task) li.append(item.task === ' ' ? '☐ ' : '☑ ');
		inline(li, item.text);
		for (const line of item.more) {
			li.appendChild(document.createElement('br'));
			inline(li, line);
		}
		for (const child of children) renderList(li, child);
		el.appendChild(li);
	}
	parent.appendChild(el);
}

function renderBlocks(parent: HTMLElement, blocks: MdBlock[]): void {
	const add = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] => parent.appendChild(document.createElement(tag));
	for (const block of blocks) {
		switch (block.kind) {
			case 'heading':
				inline(add(`h${block.level}` as 'h1'), block.text);
				break;
			case 'paragraph': {
				const p = add('p');
				block.lines.forEach((line, i) => {
					if (i) p.appendChild(document.createElement('br'));
					inline(p, line);
				});
				break;
			}
			case 'code':
				add('pre').appendChild(document.createElement('code')).textContent = block.text;
				break;
			case 'math':
				add('p').textContent = block.source;
				break;
			case 'quote': {
				const quote = add('blockquote');
				if (block.callout) {
					const strong = document.createElement('strong');
					inline(strong, block.callout.title);
					quote.appendChild(document.createElement('p')).appendChild(strong);
				}
				renderBlocks(quote, block.children);
				break;
			}
			case 'table': {
				const table = add('table');
				table.setAttribute('border', '1');
				table.style.borderCollapse = 'collapse';
				block.rows.forEach((row, r) => {
					const tr = table.insertRow();
					for (const cell of row) inline(tr.appendChild(document.createElement(r ? 'td' : 'th')), cell);
				});
				break;
			}
			case 'list':
				for (const list of nestListItems(block.items)) renderList(parent, list);
				break;
		}
	}
}

export function markdownToHtml(markdown: string): string {
	const root = document.createElement('div');
	renderBlocks(root, parseMarkdownBlocks(markdown));
	return root.innerHTML;
}

/** The text a program receives when it takes only plain text from the clipboard. */
export function htmlToText(html: string): string {
	const root = document.createElement('div');
	root.innerHTML = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|h\d|li|tr|blockquote|pre)>/gi, '$&\n');
	for (const cell of Array.from(root.querySelectorAll('td, th'))) cell.append('\t');
	return (root.textContent ?? '').replace(/\t\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
