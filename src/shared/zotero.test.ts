import { describe, expect, it } from 'vitest';
import { ZOTERO_LINK, itemKeyFor, itemLink, keysFromNote, pdfKeyFromBetterBibtex, pdfKeyOf, pdfLink } from './zotero';

// Shapes as Zotero 9's local API and Better BibTeX returned them.
const SEARCH = [
	{ key: 'WRGRQ66N', data: { itemType: 'attachment', contentType: 'application/pdf', parentItem: '3FFMRC3X' } },
	{ key: '3FFMRC3X', data: { itemType: 'conferencePaper', citationKey: 'abhijeetConvexityOptimalControl2024' } },
];

describe('Zotero links', () => {
	it('finds the item by its citation key, not an attachment or a near match', () => {
		expect(itemKeyFor(SEARCH, 'abhijeetConvexityOptimalControl2024')).toBe('3FFMRC3X');
		expect(itemKeyFor(SEARCH, 'abhijeetConvexity')).toBeNull();
		expect(itemKeyFor({ message: 'no' }, 'x')).toBeNull();
	});

	it('takes the first PDF among the children', () => {
		const children = [
			{ key: 'NOTE0001', data: { itemType: 'note' } },
			{ key: 'HTML0001', data: { itemType: 'attachment', contentType: 'text/html' } },
			{ key: 'WRGRQ66N', data: { itemType: 'attachment', contentType: 'application/pdf' } },
		];
		expect(pdfKeyOf(children)).toBe('WRGRQ66N');
		expect(pdfKeyOf([children[0]])).toBeNull();
	});

	it('reads the PDF Better BibTeX lists', () => {
		const result = [{ open: 'zotero://open-pdf/library/items/WRGRQ66N', path: '/home/u/Zotero/storage/WRGRQ66N/paper.pdf' }];
		expect(pdfKeyFromBetterBibtex(result)).toBe('WRGRQ66N');
		expect(pdfKeyFromBetterBibtex([{ open: 'zotero://open-pdf/library/items/AAAA1111', path: '/x/page.html' }])).toBeNull();
	});

	it('reads the keys a reference note records', () => {
		const note = '---\ntitle: "X"\nzotero_key: 3FFMRC3X\npdf_key: "WRGRQ66N"\n---\n\nBody pdf_key: NOTAKEY1';
		expect(keysFromNote(note)).toEqual({ item: '3FFMRC3X', pdf: 'WRGRQ66N' });
		expect(keysFromNote('No front matter')).toEqual({ item: null, pdf: null });
	});

	it('opens only zotero:// PDF and item links', () => {
		expect(ZOTERO_LINK.test(pdfLink('WRGRQ66N'))).toBe(true);
		expect(ZOTERO_LINK.test(itemLink('3FFMRC3X'))).toBe(true);
		expect(ZOTERO_LINK.test('zotero://select/library/items/3FFMRC3X;rm -rf')).toBe(false);
		expect(ZOTERO_LINK.test('https://example.org')).toBe(false);
	});
});
