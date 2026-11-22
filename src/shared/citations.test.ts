import { describe, expect, it } from 'vitest';
import { parseBib } from './bib';
import {
	citeStyleOf,
	citeTerms,
	citeText,
	findCiteGroups,
	findNarrativeCitations,
	formatCiteGroup,
	formatNarrative,
	parseCiteGroup,
	type CiteFormat,
} from './citations';

// Entries from a real Quarto book's references.bib; the expected strings are
// what that book's rendered HTML prints (`lang: th`, `csl: apa.csl`).
const BIB = parseBib(String.raw`
@misc{chen2015,
  author       = {Chen, Daqing},
  title        = {Online Retail [Data set]},
  howpublished = {UCI Machine Learning Repository},
  year         = {2015},
  doi          = {10.24432/C5BW33}
}
@article{hormby2010,
  author  = {Hormby, Sharon and Morrison, Julia and Dave, Prashant and Meyers, Michele and Tenca, Tim},
  title   = {Marriott International Increases Revenue by Implementing a Group Pricing Optimizer},
  journal = {Interfaces},
  year    = {2010}
}
@article{wei2022,
  author  = {Wei, Jason and Wang, Xuezhi and Schuurmans, Dale and others},
  title   = {Chain-of-Thought Prompting Elicits Reasoning in Large Language Models},
  year    = {2022}
}
@misc{techsauce2026,
  author       = {{Techsauce}},
  title        = {10 ปริญญาที่ AI กำลังทำให้ล้าสมัยในประเทศไทย},
  year         = {2026},
  url          = {https://techsauce.co/ai/10-degrees-ai-making-redundant-thailand}
}
@misc{acca_analytics,
  author       = {{Association of Chartered Certified Accountants}},
  title        = {Data Analytics and the Auditor},
  url          = {https://www.accaglobal.com/gb/en/student/x%20y.html}
}
@book{lee2019,
  author = {Lee, Ann and Park, Bo},
  title  = {Two Authors},
  year   = {2019}
}
`);

const APA_TH: CiteFormat = { style: 'apa', terms: citeTerms('th'), bib: BIB };
const APA_EN: CiteFormat = { style: 'apa', terms: citeTerms('en-US'), bib: BIB };
const CHICAGO: CiteFormat = { style: 'chicago', terms: citeTerms(undefined), bib: BIB };

const group = (inner: string, format: CiteFormat) => citeText(formatCiteGroup(parseCiteGroup(inner)!, format));

describe('Quarto citations as citeproc prints them', () => {
	it('matches a rendered lang: th APA book', () => {
		expect(group('@chen2015', APA_TH)).toBe('(Chen, 2015)');
		expect(group('@hormby2010', APA_TH)).toBe('(Hormby และคณะ, 2010)');
		expect(group('@wei2022', APA_TH)).toBe('(Wei และคณะ, 2022)');
		expect(group('@techsauce2026', APA_TH)).toBe('(Techsauce, 2026)');
		expect(group('@acca_analytics', APA_TH)).toBe('(Association of Chartered Certified Accountants, ม.ป.ป.)');
	});

	it('APA in English: & between two authors, et al. from three', () => {
		expect(group('@lee2019', APA_EN)).toBe('(Lee & Park, 2019)');
		expect(group('@hormby2010', APA_EN)).toBe('(Hormby et al., 2010)');
		// citeproc's APA uses & in the text too.
		expect(citeText(formatNarrative('lee2019', APA_EN))).toBe('Lee & Park (2019)');
		expect(group('@acca_analytics', APA_EN)).toBe('(Association of Chartered Certified Accountants, n.d.)');
	});

	it('Chicago author-date, Quarto’s default: no comma before the year', () => {
		expect(group('@chen2015', CHICAGO)).toBe('(Chen 2015)');
		expect(group('@lee2019', CHICAGO)).toBe('(Lee and Park 2019)');
		expect(group('@hormby2010', CHICAGO)).toBe('(Hormby et al. 2010)');
	});

	it('several works, prefixes, locators and a suppressed author', () => {
		expect(group('see @chen2015, p. 3; @lee2019', APA_EN)).toBe('(see Chen, 2015, p. 3; Lee & Park, 2019)');
		expect(group('-@chen2015', APA_EN)).toBe('(2015)');
		expect(group('ดู @chen2015 หน้า 4', APA_TH)).toBe('(ดู Chen, 2015, หน้า 4)');
		expect(group('@chen2015, 33', APA_TH)).toBe('(Chen, 2015, น. 33)');
		expect(group('@chen2015, 33-35', APA_EN)).toBe('(Chen, 2015, pp. 33–35)');
		expect(group('@chen2015, 33', CHICAGO)).toBe('(Chen 2015, 33)');
	});

	it('marks a key the bibliography does not hold, as citeproc does', () => {
		const parts = formatCiteGroup(parseCiteGroup('@chen2015; @nosuch')!, APA_EN);
		expect(citeText(parts)).toBe('(Chen, 2015; nosuch?)');
		expect(parts.filter((p) => p.missing).map((p) => p.key)).toEqual(['nosuch']);
	});

	it('a numeric style keeps the keys: its numbers depend on the whole book', () => {
		expect(group('@chen2015; @lee2019', { ...APA_EN, style: 'numeric' })).toBe('[chen2015; lee2019]');
	});
});

describe('finding Quarto citations', () => {
	it('groups that cite works, not cross-references or links', () => {
		const text = 'As shown [@chen2015; @lee2019, p. 2], see [@fig-a] and [@x](https://x.org) or [text].';
		expect(findCiteGroups(text).map((g) => text.slice(g.from, g.to))).toEqual(['[@chen2015; @lee2019, p. 2]']);
	});

	it('bare @key in the text only when the bibliography holds it', () => {
		const known = (k: string) => k in BIB;
		const text = '@chen2015 found it; mail me@example.com, @someone, @fig-x, [@lee2019] and `@wei2022`.';
		expect(findNarrativeCitations(text, known).map((c) => c.key)).toEqual(['chen2015', 'wei2022']);
	});

	it('a part with no key is not a citation group', () => {
		expect(parseCiteGroup('@a; just text')).toBeNull();
	});
});

describe('the style a csl: file names', () => {
	it('reads the file name', () => {
		expect(citeStyleOf(undefined)).toBe('chicago');
		expect(citeStyleOf('apa.csl')).toBe('apa');
		expect(citeStyleOf('styles/apa-6th-edition.csl')).toBe('apa');
		expect(citeStyleOf('chicago-author-date.csl')).toBe('chicago');
		expect(citeStyleOf('ieee.csl')).toBe('numeric');
		expect(citeStyleOf('harvard-cite-them-right.csl')).toBe('apa');
	});
});
