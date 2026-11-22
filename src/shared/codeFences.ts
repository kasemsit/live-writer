/**
 * md-live-preview-plus: fenced code blocks found line by line, for the scans
 * that read the text rather than the syntax tree — footnotes, Quarto divs and
 * cross-references. Text inside a fence is code, never Markdown.
 */

/** An opening or closing code fence: three or more backticks or tildes. */
export const CODE_FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** Indexes of the lines outside fenced code blocks, fence lines excluded. */
export function* linesOutsideCode(lines: readonly string[]): Generator<number> {
	let code: string | null = null;
	for (let i = 0; i < lines.length; i++) {
		const fence = CODE_FENCE.exec(lines[i]);
		if (code) {
			if (fence && fence[1][0] === code[0] && fence[1].length >= code.length && lines[i].trim() === fence[1]) code = null;
		} else if (fence) {
			code = fence[1];
		} else {
			yield i;
		}
	}
}
