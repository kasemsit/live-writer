import { BLOCK_ID_LINE, TRAILING_BLOCK_ID } from './anchors';
import { splitTableRow } from './wikilinks';

/**
 * The block structure of a piece of Markdown, for the places that show
 * Markdown outside the editor: the link preview card and Copy as Rich Text.
 * Each draws these blocks its own way; inline Markdown inside them is left as
 * text for the caller's inline renderer.
 *
 * Block ids (`^id`, on their own line or ending one) and notes to the writer
 * (`<!-- … -->` starting a line) are left out.
 */

export interface MdListItem {
	/** Leading spaces: deeper items nest under the item above. */
	indent: number;
	/** `-`, `*`, `+`, `1.` or `1)`. */
	marker: string;
	ordered: boolean;
	/** `' '` for `[ ]`, `'x'` for `[x]`, null for no box. */
	task: ' ' | 'x' | null;
	text: string;
	/** Indented lines continuing the item. */
	more: string[];
}

export type MdBlock =
	| { kind: 'heading'; level: number; text: string }
	| { kind: 'paragraph'; lines: string[] }
	| { kind: 'code'; info: string; text: string }
	| { kind: 'math'; tex: string; source: string }
	| { kind: 'quote'; callout: { type: string; title: string } | null; children: MdBlock[] }
	| { kind: 'table'; rows: string[][] }
	| { kind: 'list'; items: MdListItem[] };

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?(\s*:?-+:?\s*\|)+(\s*:?-+:?\s*)?\s*$/;
const CALLOUT_HEAD = /^\[!([A-Za-z][\w-]*)\][+-]?\s*(.*)$/;

const withoutId = (text: string) => text.replace(TRAILING_BLOCK_ID, '');

export function parseMarkdownBlocks(text: string): MdBlock[] {
	return parseLines(text.split('\n'));
}

function parseLines(lines: string[]): MdBlock[] {
	const blocks: MdBlock[] = [];
	let para: string[] | null = null;
	const push = (block: MdBlock) => {
		blocks.push(block);
		para = null;
	};
	for (let i = 0; i < lines.length; ) {
		const line = lines[i];
		if (!line.trim() || BLOCK_ID_LINE.test(line)) {
			para = null;
			i++;
			continue;
		}
		if (/^\s*<!--/.test(line)) {
			while (i < lines.length && !lines[i].includes('-->')) i++;
			i++;
			para = null;
			continue;
		}
		if (/^\s*(```|~~~)/.test(line)) {
			const fence = line.trim().slice(0, 3);
			let end = i + 1;
			while (end < lines.length && !lines[end].trim().startsWith(fence)) end++;
			push({ kind: 'code', info: line.trim().slice(3).trim(), text: lines.slice(i + 1, end).join('\n') });
			i = end + 1;
			continue;
		}
		if (/^\s*\$\$/.test(line)) {
			// Display math: one line, or $$ lines around it.
			let end = i;
			if (!/\$\$.*\$\$\s*$/.test(line.trim())) {
				end = i + 1;
				while (end < lines.length && !/\$\$\s*$/.test(lines[end])) end++;
			}
			const source = lines.slice(i, end + 1).join('\n').trim();
			push({ kind: 'math', source, tex: source.replace(/^\$\$/, '').replace(/\$\$$/, '').trim() });
			i = end + 1;
			continue;
		}
		const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
		if (h) {
			push({ kind: 'heading', level: h[1].length, text: withoutId(h[2]) });
			i++;
			continue;
		}
		if (/^\s*>/.test(line)) {
			const body: string[] = [];
			while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>[ \t]?/, ''));
			const head = CALLOUT_HEAD.exec(body[0] ?? '');
			if (head) body.shift();
			const callout = head ? { type: head[1], title: head[2] || head[1].charAt(0).toUpperCase() + head[1].slice(1) } : null;
			push({ kind: 'quote', callout, children: parseLines(body) });
			continue;
		}
		if (/^\s*\|/.test(line)) {
			const rows: string[][] = [];
			while (i < lines.length && /^\s*\|/.test(lines[i])) {
				const row = lines[i++];
				if (!TABLE_SEPARATOR.test(row)) rows.push(splitTableRow(row.trim()));
			}
			push({ kind: 'table', rows });
			continue;
		}
		if (LIST_ITEM.test(line)) {
			const items: MdListItem[] = [];
			while (i < lines.length) {
				const m = LIST_ITEM.exec(lines[i]);
				if (m) {
					const task = m[3] ? (m[3] === ' ' ? ' ' : 'x') : null;
					items.push({ indent: m[1].length, marker: m[2], ordered: /\d/.test(m[2]), task, text: withoutId(m[4]), more: [] });
					i++;
				} else if (items.length && /^\s+\S/.test(lines[i]) && !BLOCK_ID_LINE.test(lines[i])) {
					items[items.length - 1].more.push(withoutId(lines[i].trim()));
					i++;
				} else break;
			}
			push({ kind: 'list', items });
			continue;
		}
		if (para) para.push(withoutId(line.trim()));
		else {
			const block: MdBlock = { kind: 'paragraph', lines: [withoutId(line.trim())] };
			blocks.push(block);
			para = block.lines;
		}
		i++;
	}
	return blocks;
}

/** The items of a list as a tree: deeper items under the item above, and a change of marker kind starts a new list. */
export interface MdListNode {
	ordered: boolean;
	items: { item: MdListItem; children: MdListNode[] }[];
}

export function nestListItems(items: MdListItem[]): MdListNode[] {
	const roots: MdListNode[] = [];
	const stack: { indent: number; list: MdListNode; owner: MdListNode[] }[] = [];
	let last: { item: MdListItem; children: MdListNode[] } | null = null;
	for (const item of items) {
		while (stack.length && item.indent < stack[stack.length - 1].indent) stack.pop();
		const top = stack[stack.length - 1];
		if (top && item.indent === top.indent && item.ordered !== top.list.ordered) {
			stack.pop();
			const list: MdListNode = { ordered: item.ordered, items: [] };
			top.owner.push(list);
			stack.push({ indent: item.indent, list, owner: top.owner });
		} else if (!top || item.indent > top.indent) {
			const list: MdListNode = { ordered: item.ordered, items: [] };
			const owner = top && last ? last.children : roots;
			owner.push(list);
			stack.push({ indent: item.indent, list, owner });
		}
		last = { item, children: [] };
		stack[stack.length - 1].list.items.push(last);
	}
	return roots;
}
