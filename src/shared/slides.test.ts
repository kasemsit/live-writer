import { describe, expect, it } from 'vitest';
import { isDarkColour, slideDeck } from './slides';

const deck = (text: string) => slideDeck(text.split('\n'));

const DOC = [
	'---', // 0
	'title: "Machine Learning"',
	'subtitle: "261405"',
	'author: "K. T."',
	'format:',
	'  revealjs:',
	'    slide-number: c/t',
	'title-slide-attributes:',
	'  data-background-color: "#7a1f2b"',
	'---', // 9
	'',
	'## Roadmap {.smaller}', // 11
	'',
	'::: {.notes}',
	'## not a slide inside a div',
	':::',
	'',
	'# 1 · Why now? {background-color="#7a1f2b"}', // 17
	'',
	'## Traditional vs. ML', // 19
	'',
	'```markdown',
	'## not a slide inside code',
	'```',
	'### a level-3 heading is content',
	'',
	'---', // 26
	'',
	'Untitled slide.', // 28
	'',
].join('\n');

describe('a Quarto presentation as its slides', () => {
	it('reads the title slide from the front matter', () => {
		expect(deck(DOC)?.titleSlide).toEqual({
			title: 'Machine Learning',
			subtitle: '261405',
			author: 'K. T.',
			institute: '',
			date: '',
			background: '#7a1f2b',
		});
	});

	it('splits at headings up to slide-level and at rules, outside code and divs', () => {
		const d = deck(DOC)!;
		expect(d.format).toBe('revealjs');
		expect(d.frontMatterEnd).toBe(9);
		expect(d.slides).toEqual([
			{ from: 11, to: 15, kind: 'slide', title: 'Roadmap', background: null, rule: false, number: 2 },
			{ from: 17, to: 17, kind: 'section', title: '1 · Why now?', background: '#7a1f2b', rule: false, number: 3 },
			{ from: 19, to: 24, kind: 'slide', title: 'Traditional vs. ML', background: null, rule: false, number: 4 },
			{ from: 26, to: 28, kind: 'slide', title: '', background: null, rule: true, number: 5 },
		]);
		expect(d.total).toBe(5);
	});

	it('follows slide-level', () => {
		const d = deck('---\nformat: revealjs\nslide-level: 3\n---\n# A\n## B\n### C\ntext')!;
		expect(d.slides.map((s) => [s.kind, s.title])).toEqual([
			['section', 'A'],
			['section', 'B'],
			['slide', 'C'],
		]);
		expect(d.titleSlide).toBeNull();
		expect(d.slides[0].number).toBe(1);
	});

	it('makes text before the first heading a slide of its own', () => {
		expect(deck('---\nformat: revealjs\n---\n\nIntro text.\n\n## A\nx')!.slides.map((s) => [s.from, s.to, s.title])).toEqual([
			[4, 4, ''],
			[6, 7, 'A'],
		]);
	});

	it('is null for documents that are not presentations', () => {
		expect(deck('---\nformat: html\n---\n## A')).toBeNull();
		expect(deck('---\nformat:\n  html: default\n  revealjs: default\n---\n## A')).toBeNull();
		expect(deck('## A\n## B')).toBeNull();
		expect(deck('---\nformat: [revealjs\n---\n')).toBeNull();
		expect(deck('---\nformat: beamer\n---\n## A')?.format).toBe('beamer');
	});

	it('tells dark backgrounds from light ones', () => {
		expect(isDarkColour('#7a1f2b')).toBe(true);
		expect(isDarkColour('#fff')).toBe(false);
		expect(isDarkColour('#f0e68c')).toBe(false);
		expect(isDarkColour('navy')).toBe(true);
	});
});
