import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBib } from './plusBib';
import { citeTerms, citeText, findCiteGroups, findNarrativeCitations, formatCiteGroup, formatNarrative, type CiteFormat, type CiteStyle } from './plusCitations';

/**
 * The editor's Quarto citations against what Quarto's own citeproc prints for
 * the same text and bibliography: `fixtures/citeproc.json` holds each case's
 * output from `quarto pandoc --citeproc` (APA with a real book's apa.csl, and
 * Quarto's default Chicago author-date; English and Thai). To refresh it, run
 * the cases through `quarto pandoc` again; never edit an expected string by hand.
 */

interface Case {
	style: CiteStyle;
	lang: string;
	text: string;
	expected: string;
}
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'citeproc.json'), 'utf8')) as { generator: string; bib: string; cases: Case[] };
const bib = parseBib(fixture.bib);

/** A line as the editor draws it: citation groups and known bare keys replaced. */
function drawLine(text: string, format: CiteFormat): string {
	const found = [
		...findCiteGroups(text).map((g) => ({ from: g.from, to: g.to, parts: formatCiteGroup(g.items, format) })),
		...findNarrativeCitations(text, (k) => k in format.bib).map((c) => ({ ...c, parts: formatNarrative(c.key, format, c.locator) })),
	].sort((a, b) => a.from - b.from);
	let out = '';
	let last = 0;
	for (const f of found) {
		out += text.slice(last, f.from) + citeText(f.parts);
		last = f.to;
	}
	return out + text.slice(last);
}

// Not done: citeproc adds a/b to tell apart two works by one author in one
// year, using every citation of the document — (Chen, 2015a, 2015b).
const KNOWN_GAPS = new Set(['X [@chen2015; @same2015a] Y.']);

describe(`Quarto citations match citeproc (${fixture.generator})`, () => {
	for (const c of fixture.cases) {
		const name = `${c.style} ${c.lang}: ${c.text}`;
		const run = () => expect(drawLine(c.text, { style: c.style, terms: citeTerms(c.lang), bib })).toBe(c.expected);
		if (KNOWN_GAPS.has(c.text)) it.fails(name, run);
		else it(name, run);
	}
});
