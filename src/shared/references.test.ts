import { describe, expect, it } from 'vitest';
import { parseBib } from './bib';
import { formatReference, referenceText, sentenceCase, sortReferences } from './references';

// Entries from the 269382 book's references.bib; each expected string is what
// Quarto's citeproc (apa.csl) printed in _book/chapters/bibliography.html.
const BIB = String.raw`
@book{anderson2020,
  author    = {Anderson, David R. and Sweeney, Dennis J. and Williams, Thomas A. and Camm, Jeffrey D. and Cochran, James J.},
  title     = {Statistics for Business \& Economics},
  edition   = {14},
  publisher = {Cengage Learning},
  year      = {2020}
}
@article{anscombe1973,
  author  = {Anscombe, Francis J.},
  title   = {Graphs in Statistical Analysis},
  journal = {The American Statistician},
  volume  = {27},
  number  = {1},
  pages   = {17--21},
  year    = {1973}
}
@article{brown2020,
  author  = {Brown, Tom B. and Mann, Benjamin and Ryder, Nick and others},
  title   = {Language Models Are Few-Shot Learners},
  journal = {Advances in Neural Information Processing Systems},
  volume  = {33},
  pages   = {1877--1901},
  year    = {2020}
}
@inproceedings{hummer2019,
  author    = {Hummer, Waldemar and Muthusamy, Vinod and Rausch, Thomas and Dube, Parijat and El Maghraoui, Kaoutar and Murthi, Anupama and Oum, Punleuk},
  title     = {{ModelOps}: Cloud-Based Lifecycle Management for Reliable and Trusted {AI}},
  booktitle = {2019 IEEE International Conference on Cloud Engineering (IC2E)},
  pages     = {113--120},
  year      = {2019}
}
@misc{chen2015,
  author       = {Chen, Daqing},
  title        = {Online Retail [Data set]},
  howpublished = {UCI Machine Learning Repository},
  year         = {2015},
  doi          = {10.24432/C5BW33}
}
@misc{informs2016ups,
  author       = {{INFORMS}},
  title        = {{UPS} On-Road Integrated Optimization and Navigation ({ORION})},
  howpublished = {O.R. \& Analytics Success Stories; 2016 Franz Edelman Award},
  year         = {2016},
  url          = {https://www.informs.org/Impact/O.R.-Analytics-Success-Stories/UPS}
}
`;

const EXPECTED: Record<string, string> = {
	anderson2020: 'Anderson, D. R., Sweeney, D. J., Williams, T. A., Camm, J. D., & Cochran, J. J. (2020). Statistics for business & economics (14th ed.). Cengage Learning.',
	anscombe1973: 'Anscombe, F. J. (1973). Graphs in statistical analysis. The American Statistician, 27(1), 17–21.',
	brown2020: 'Brown, T. B., Mann, B., Ryder, N., et al. (2020). Language models are few-shot learners. Advances in Neural Information Processing Systems, 33, 1877–1901.',
	hummer2019:
		'Hummer, W., Muthusamy, V., Rausch, T., Dube, P., El Maghraoui, K., Murthi, A., & Oum, P. (2019). ModelOps: Cloud-based lifecycle management for reliable and trusted AI. 2019 IEEE International Conference on Cloud Engineering (IC2E), 113–120.',
	chen2015: 'Chen, D. (2015). Online retail [data set]. UCI Machine Learning Repository. https://doi.org/10.24432/C5BW33',
	informs2016ups:
		'INFORMS. (2016). UPS on-road integrated optimization and navigation (ORION). O.R. & Analytics Success Stories; 2016 Franz Edelman Award. https://www.informs.org/Impact/O.R.-Analytics-Success-Stories/UPS',
};

describe('the APA reference list', () => {
	const bib = parseBib(BIB);

	for (const [key, text] of Object.entries(EXPECTED)) {
		it(`prints ${key} as citeproc does`, () => {
			expect(referenceText(formatReference(bib[key]))).toBe(text);
		});
	}

	it('italicises the container and volume of an article, the title of a book', () => {
		const italic = (key: string) => formatReference(bib[key]).filter((p) => p.italic).map((p) => p.text.trim());
		expect(italic('anscombe1973')).toEqual(['The American Statistician', '27']);
		expect(italic('anderson2020')[0]).toBe('Statistics for business & economics');
	});

	it('links the DOI and the URL', () => {
		expect(formatReference(bib.chen2015).find((p) => p.href)?.href).toBe('https://doi.org/10.24432/C5BW33');
		expect(formatReference(bib.informs2016ups).find((p) => p.href)?.href).toContain('informs.org');
	});

	it('sorts by author, then year, and drops duplicates', () => {
		expect(sortReferences(['informs2016ups', 'hummer2019', 'anscombe1973', 'anderson2020', 'hummer2019', 'missing'], bib)).toEqual([
			'anderson2020',
			'anscombe1973',
			'hummer2019',
			'informs2016ups',
		]);
	});

	it('sentence-cases a title but keeps protected words and acronyms', () => {
		expect(sentenceCase('{ModelOps}: Cloud-Based Lifecycle Management for {AI}')).toBe('ModelOps: Cloud-based lifecycle management for AI');
	});
});
