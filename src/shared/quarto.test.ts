import { describe, it, expect } from 'vitest';
import {
	XREF,
	calloutTitleLine,
	calloutType,
	findFencedDivs,
	joinedHeadingLines,
	labelsFromQuartoYaml,
	parseAttrs,
	quartoCitationPlan,
	quartoOutline,
	scanCrossRefs,
} from './quarto';
import { extractHeadings } from './headings';

describe('Pandoc attribute blocks', () => {
	it('reads id, classes and key=value pairs, quoted or not', () => {
		const attrs = parseAttrs('#fig-a .wide width=80% fig-pos="H" title=\'A b\'');
		expect(attrs.id).toBe('fig-a');
		expect(attrs.classes).toEqual(['wide']);
		expect(attrs.kv).toEqual({ width: '80%', 'fig-pos': 'H', title: 'A b' });
	});

	it('reads `-` as .unnumbered', () => {
		expect(parseAttrs('#sec-x -').classes).toEqual(['unnumbered']);
	});
});

describe('fenced divs', () => {
	it('pairs fences, innermost first to close, and skips fences inside code', () => {
		const lines = [
			'::: {.callout-note icon=false}', // 0
			'## Title', // 1
			'```', // 2
			':::', // 3 — code, not a fence
			'```', // 4
			'::: {layout-ncol=2}', // 5
			'body', // 6
			':::', // 7
			':::', // 8
		];
		const divs = findFencedDivs(lines);
		expect(divs.map((d) => [d.open, d.close])).toEqual([
			[0, 8],
			[5, 7],
		]);
		expect(calloutType(divs[0].attrs)).toBe('note');
		expect(divs[0].attrs.kv.icon).toBe('false');
		expect(calloutType(divs[1].attrs)).toBeNull();
	});

	it('takes a bare word after the colons as a class', () => {
		expect(findFencedDivs(['::: warning', 'x', ':::'])[0].attrs.classes).toEqual(['warning']);
	});

	it('does not make a div of a fence never closed', () => {
		expect(findFencedDivs(['::: {.callout-tip}', 'still typing'])).toEqual([]);
	});

	it('finds the title heading only when it is the first block', () => {
		const lines = ['::: {.callout-tip}', '', '## Title', 'body', ':::', '::: {.callout-tip}', 'text', '## Not a title', ':::'];
		const [first, second] = findFencedDivs(lines);
		expect(calloutTitleLine(lines, first)).toBe(2);
		expect(calloutTitleLine(lines, second)).toBeNull();
	});

	it('leaves the title to title="…" when it is given', () => {
		const lines = ['::: {.callout-tip title="Given"}', '## Heading', ':::'];
		expect(calloutTitleLine(lines, findFencedDivs(lines)[0])).toBeNull();
	});
});

describe('cross-references', () => {
	const lines = [
		'## 9.3 Example {#sec-example}', // 0
		'', // 1
		'See @fig-a and @fig-b, mail me@fig-x.com, cite [@fig-c].', // 2
		'', // 3
		'![First *caption*](a.png){#fig-a width=80%}', // 4
		'', // 5
		'```', // 6
		'![In code](c.png){#fig-code}', // 7
		'```', // 8
		'', // 9
		'![Second](b.png){#fig-b}', // 10
		'## 9.4 Next', // 11 — joins the image's paragraph in Pandoc
	];

	it('numbers each figure alone in its paragraph, in file order', () => {
		const refs = scanCrossRefs(lines);
		expect([...refs.figures]).toEqual([['fig-a', { number: 1, line: 4, caption: 'First *caption*' }]]);
		expect(refs.joined.get('fig-b')).toEqual({ line: 10, with: 11 });
		expect(refs.sections.get('sec-example')).toEqual({ line: 0, text: '9.3 Example' });
	});

	it('finds @id references, but not an e-mail address or a bracketed citation', () => {
		expect([...lines[2].matchAll(XREF)].map((m) => m[1])).toEqual(['fig-a', 'fig-b']);
	});

	it('flags a heading straight after paragraph text', () => {
		expect([...joinedHeadingLines(lines)]).toEqual([11]);
		expect(joinedHeadingLines(['# Title', '## Sub', '::: {.callout-note}', '## Title', ':::', '- item', '## After a list'])).toEqual(
			new Set(),
		);
	});
});

describe('Quarto project labels', () => {
	it('reads crossref and callout labels from _quarto.yml, quoted or not', () => {
		const yaml = [
			'lang: th',
			'language:',
			'  crossref-fig-title: "รูปที่"   # Thai',
			"  callout-tip-title: 'เคล็ดลับ'",
			'  crossref-unknown-key: ignored',
			'crossref:',
			'  chapters: false',
		].join('\n');
		expect(labelsFromQuartoYaml(yaml)).toEqual({ 'crossref-fig-title': 'รูปที่', 'callout-tip-title': 'เคล็ดลับ' });
	});
});

describe('outline of a Quarto document', () => {
	it('drops callout titles and {#id} blocks', () => {
		const text = ['# Chapter', '::: {.callout-note}', '## Objectives', ':::', '## 1.1 Part {#sec-part}'].join('\n');
		expect(quartoOutline(extractHeadings(text), text).map((h) => [h.line, h.text])).toEqual([
			[1, 'Chapter'],
			[5, '1.1 Part'],
		]);
	});
});

describe('quartoCitationPlan', () => {
	const PROJECT = 'project:\n  type: book\nlang: th\nbibliography: references.bib\ncsl: apa.csl\n';

	it('takes the bibliography, style and language from _quarto.yml', () => {
		expect(quartoCitationPlan(PROJECT, '# Chapter\n')).toEqual({ files: ['references.bib'], base: 'project', style: 'apa', lang: 'th', nocite: [] });
	});

	it('front matter overrides the project, and names files beside the document', () => {
		const doc = '---\ntitle: x\nbibliography:\n  - a.bib\n  - b.bib\nlang: en\n---\n\nText';
		expect(quartoCitationPlan(PROJECT, doc)).toEqual({ files: ['a.bib', 'b.bib'], base: 'document', style: 'apa', lang: 'en', nocite: [] });
	});

	it('collects nocite keys from the project and the document', () => {
		const project = `${PROJECT}\nnocite: |\n  @*\n`;
		expect(quartoCitationPlan(project, '# C\n')?.nocite).toEqual(['*']);
		const doc = '---\nnocite: |\n  @a, @b\n---\n# C\n';
		expect(quartoCitationPlan(PROJECT, doc)?.nocite).toEqual(['a', 'b']);
	});

	it('Quarto’s default style is Chicago author-date; no .bib means no plan', () => {
		expect(quartoCitationPlan('bibliography: refs.bib\n', '')?.style).toBe('chicago');
		expect(quartoCitationPlan('title: x\n', 'text')).toBeNull();
		expect(quartoCitationPlan('bibliography: refs.json\n', '')).toBeNull();
		expect(quartoCitationPlan(': not yaml [', '')).toBeNull();
	});
});
