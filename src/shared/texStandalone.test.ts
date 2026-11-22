import { describe, expect, it } from 'vitest';
import { standaloneEngine, standalonePreamble, standaloneSource } from './texStandalone';

const PREAMBLE = String.raw`\documentclass[11pt]{article}
\usepackage[margin=2cm]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{tikz} % pictures
\usetikzlibrary{arrows.meta,positioning}
\usepackage{hyperref}
\definecolor{brand}{RGB}{20,80,160}
\newcommand{\vect}[1]{%
  \mathbf{#1}%
}
\tikzset{
  box/.style={draw, rounded corners},
}
\title{A paper}
\author{Someone}
\pagestyle{empty}
`;

describe('a tikzpicture as a file of its own', () => {
	it('keeps packages, libraries, colours and macros; drops what sets the page', () => {
		expect(standalonePreamble(PREAMBLE)).toEqual([
			'\\usepackage{amsmath,amssymb}',
			'\\usepackage{tikz}',
			'\\usetikzlibrary{arrows.meta,positioning}',
			'\\definecolor{brand}{RGB}{20,80,160}',
			'\\newcommand{\\vect}[1]{\n  \\mathbf{#1}\n}',
			'\\tikzset{\n  box/.style={draw, rounded corners},\n}',
		]);
	});

	it('wraps the picture in the standalone class, adding tikz when the preamble lacks it', () => {
		const pic = '\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}';
		const file = standaloneSource('\\usepackage{xcolor}', pic);
		expect(file.split('\n')).toEqual(['\\documentclass[border=2pt]{standalone}', '\\usepackage{tikz}', '\\usepackage{xcolor}', '\\begin{document}', pic, '\\end{document}', '']);
		expect(standaloneSource(PREAMBLE, pic).match(/usepackage\{tikz\}/g)).toHaveLength(1);
		expect(standaloneSource('\\usepackage{pgfplots}', pic)).not.toContain('\\usepackage{tikz}');
	});

	it('needs xelatex for fontspec and its kin', () => {
		expect(standaloneEngine(PREAMBLE)).toBe('pdflatex');
		expect(standaloneEngine('\\usepackage{fontspec}\n\\setmainfont{TH Sarabun New}')).toBe('xelatex');
		expect(standaloneEngine('\\usepackage[thai]{polyglossia}')).toBe('xelatex');
	});
});
