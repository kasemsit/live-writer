import { readArgs, scanTex, type TexScan } from './plusTexScanner';
import { texToPlain } from './plusTexText';

/**
 * md-live-preview-plus: a LaTeX document's headings — the sectioning
 * commands and their levels, and the headings in the body with their titles
 * as plain text, for the outline view.
 */

const NEWLINE = 10;

export const SECTION_LEVELS: Record<string, number> = {
	part: 0,
	chapter: 1,
	section: 2,
	subsection: 3,
	subsubsection: 4,
	paragraph: 5,
	subparagraph: 6,
};

export interface TexHeading {
	command: string;
	/** 0 (part) … 6 (subparagraph); see SECTION_LEVELS. */
	level: number;
	text: string;
	/** 1-based line. */
	line: number;
	from: number;
}

function lineNumberAt(text: string, pos: number, cache: { pos: number; line: number }): number {
	let line = cache.line;
	for (let i = cache.pos; i < pos; i++) if (text.charCodeAt(i) === NEWLINE) line++;
	cache.pos = pos;
	cache.line = line;
	return line;
}

/** Sectioning commands in the body, in order, with their titles as plain text. */
export function texHeadings(text: string, scan: TexScan = scanTex(text)): TexHeading[] {
	const out: TexHeading[] = [];
	const cache = { pos: 0, line: 1 };
	for (const cmd of scan.commands) {
		const level = SECTION_LEVELS[cmd.name];
		if (level === undefined || cmd.from < scan.bodyFrom || cmd.from >= scan.bodyTo) continue;
		const args = readArgs(text, cmd.to, 'som');
		const title = args?.args[1];
		if (!title) continue;
		out.push({ command: cmd.name, level, text: texToPlain(text.slice(title.from, title.to)), line: lineNumberAt(text, cmd.from, cache), from: cmd.from });
	}
	return out;
}

/** Headings for the outline view, with levels renumbered so the topmost present is 1. */
export function extractTexHeadings(text: string): { level: number; text: string; line: number }[] {
	const headings = texHeadings(text);
	const top = Math.min(...headings.map((h) => h.level));
	return headings.map((h) => ({ level: h.level - top + 1, text: h.text, line: h.line }));
}
