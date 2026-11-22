/**
 * A `tikzpicture` as a file of its own, for drawing it when there is no build
 * of the current text: the `standalone` class, the root preamble's packages,
 * libraries, colours and macros, and the picture.
 *
 * Only statements that define things are carried over, so that what sets the
 * page (geometry, headers, the bibliography) cannot break a one-picture file.
 */

const KEEP = /^\\(usepackage|RequirePackage|usetikzlibrary|usepgfplotslibrary|pgfplotsset|tikzset|tikzstyle|definecolor|colorlet|newcommand|renewcommand|providecommand|DeclareMathOperator|def|let|newlength|setlength|pgfmathsetmacro|newif)\b/;
const DROP_PACKAGES = new Set([
	'geometry',
	'fancyhdr',
	'titlesec',
	'tocloft',
	'biblatex',
	'hyperref',
	'cleveref',
	'bookmark',
	'standalone',
	'subfiles',
	'docmute',
	'showframe',
	'lineno',
	'background',
	'draftwatermark',
]);
const UNICODE_ENGINE = /\\usepackage(\[[^\]]*\])?\{[^}]*\b(fontspec|unicode-math|polyglossia|xeCJK|luatexja|fontawesome5)\b/;

/** Splits a preamble into its statements: a statement runs on until its braces balance. */
function statements(preamble: string): string[] {
	const out: string[] = [];
	let current = '';
	let depth = 0;
	for (const raw of preamble.split(/\r?\n/)) {
		const line = raw.replace(/(^|[^\\])%.*$/, '$1');
		if (!current && !line.trim()) continue;
		current = current ? `${current}\n${line}` : line;
		for (let i = 0; i < line.length; i++) {
			if (line[i] === '\\') i++;
			else if (line[i] === '{') depth++;
			else if (line[i] === '}') depth--;
		}
		if (depth <= 0) {
			out.push(current.trim());
			current = '';
			depth = 0;
		}
	}
	if (current.trim()) out.push(current.trim());
	return out;
}

/** The engine a preamble needs: `xelatex` for fontspec and its kin, else `pdflatex`. */
export function standaloneEngine(preamble: string): 'pdflatex' | 'xelatex' {
	return UNICODE_ENGINE.test(preamble) ? 'xelatex' : 'pdflatex';
}

/** The preamble statements a standalone picture keeps. */
export function standalonePreamble(preamble: string): string[] {
	return statements(preamble).filter((s) => {
		if (!KEEP.test(s)) return false;
		const pkg = /^\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([^}]*)\}/.exec(s);
		if (!pkg) return true;
		const names = pkg[1].split(',').map((n) => n.trim());
		return !names.some((n) => DROP_PACKAGES.has(n));
	});
}

/** The whole file that draws `picture` (a `tikzpicture` environment) with what `preamble` defines. */
export function standaloneSource(preamble: string, picture: string): string {
	const kept = standalonePreamble(preamble);
	const tikz = kept.some((s) => /^\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{[^}]*\b(tikz|pgfplots)\b/.test(s)) ? [] : ['\\usepackage{tikz}'];
	return ['\\documentclass[border=2pt]{standalone}', ...tikz, ...kept, '\\begin{document}', picture.trim(), '\\end{document}', ''].join('\n');
}
