import { describe, expect, it } from 'vitest';
import { nestListItems, parseMarkdownBlocks, type MdListItem } from './markdownBlocks';

describe('the block structure of Markdown shown outside the editor', () => {
	it('reads headings, paragraphs, code, math, tables and quotes', () => {
		const text = [
			'# Title ##',
			'one',
			'two ^para',
			'',
			'```py',
			'x = 1',
			'```',
			'$$',
			'E = mc^2',
			'$$',
			'| a | b \\| c |',
			'|---|:-:|',
			'| 1 | 2 |',
			'> [!tip]',
			'> inside',
		].join('\n');
		expect(parseMarkdownBlocks(text)).toEqual([
			{ kind: 'heading', level: 1, text: 'Title' },
			{ kind: 'paragraph', lines: ['one', 'two'] },
			{ kind: 'code', info: 'py', text: 'x = 1' },
			{ kind: 'math', source: '$$\nE = mc^2\n$$', tex: 'E = mc^2' },
			{ kind: 'table', rows: [['a', 'b \\| c'], ['1', '2']] },
			{ kind: 'quote', callout: { type: 'tip', title: 'Tip' }, children: [{ kind: 'paragraph', lines: ['inside'] }] },
		]);
	});

	it('leaves out block ids and notes to the writer', () => {
		expect(parseMarkdownBlocks('a\n^id\n<!-- note\nstill -->\nb')).toEqual([
			{ kind: 'paragraph', lines: ['a'] },
			{ kind: 'paragraph', lines: ['b'] },
		]);
	});

	it('reads list items with task boxes and continuation lines', () => {
		const [list] = parseMarkdownBlocks('- [ ] open\n  more\n- [x] done\n  1. sub');
		expect(list).toEqual({
			kind: 'list',
			items: [
				{ indent: 0, marker: '-', ordered: false, task: ' ', text: 'open', more: ['more'] },
				{ indent: 0, marker: '-', ordered: false, task: 'x', text: 'done', more: [] },
				{ indent: 2, marker: '1.', ordered: true, task: null, text: 'sub', more: [] },
			],
		});
	});

	it('nests deeper items, and starts a new list when the marker kind changes', () => {
		const item = (indent: number, marker: string): MdListItem => ({ indent, marker, ordered: /\d/.test(marker), task: null, text: marker, more: [] });
		const tree = nestListItems([item(0, '-'), item(2, '1.'), item(2, '2.'), item(0, '-'), item(0, '1.')]);
		expect(tree.map((l) => [l.ordered, l.items.map((i) => i.item.text)])).toEqual([
			[false, ['-', '-']],
			[true, ['1.']],
		]);
		expect(tree[0].items[0].children[0].items.map((i) => i.item.text)).toEqual(['1.', '2.']);
	});
});
