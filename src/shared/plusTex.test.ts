import { describe, expect, it } from 'vitest';
import {
	bibFilesOf,
	extractMacros,
	extractTexHeadings,
	graphicsPathOf,
	inputsOf,
	magicRoot,
	readAccent,
	readArgs,
	scanTex,
	texToPlain,
} from './plusTexScan';
import { cleanAuxNumber, parseAux } from './plusTexAux';
import { familyName, parseBib } from './plusBib';
import { citeLabel, formatCiteNumbers } from './plusCitations';
import { parseColSpec, parseTabular } from './plusTexTable';

const DOC = String.raw`\documentclass{article}
\newcommand{\R}{\mathbb{R}}
\DeclareMathOperator{\argmax}{arg\,max}
\begin{document}
\section{Intro}\label{sec:intro}
Text with $x \in \R$ and 50\% % a comment
\begin{equation}
  E = mc^2 \label{eq:e}
\end{equation}
\begin{itemize}
  \item one
  \item two
\end{itemize}
\end{document}
`;

describe('scanTex', () => {
	const scan = scanTex(DOC);

	it('finds the body after \\begin{document}', () => {
		expect(scan.hasPreamble).toBe(true);
		expect(DOC.slice(scan.bodyFrom, scan.bodyFrom + 9)).toBe('\n\\section');
		expect(DOC.slice(scan.bodyTo, scan.bodyTo + 14)).toBe('\\end{document}');
	});

	it('finds math, inline and environment, and does not scan commands inside it', () => {
		expect(scan.maths.map((m) => DOC.slice(m.innerFrom, m.innerTo).trim())).toEqual(['x \\in \\R', 'E = mc^2 \\label{eq:e}']);
		expect(scan.maths[1].env).toBe('equation');
		expect(scan.commands.some((c) => c.name === 'in')).toBe(false);
	});

	it('finds comments but not an escaped percent', () => {
		expect(scan.comments.map((c) => DOC.slice(c.from, c.to))).toEqual(['% a comment']);
		expect(scan.commands.some((c) => c.name === '%')).toBe(true);
	});

	it('pairs environments and nests them', () => {
		const itemize = scan.envs.find((e) => e.name === 'itemize')!;
		expect(itemize.closed).toBe(true);
		expect(DOC.slice(itemize.endFrom, itemize.to)).toBe('\\end{itemize}');
		expect(scan.envs[itemize.parent].name).toBe('document');
	});

	it('treats a file without \\begin{document} as all body', () => {
		const s = scanTex('\\section{A}\ntext');
		expect(s.hasPreamble).toBe(false);
		expect(s.bodyFrom).toBe(0);
	});

	it('never lets an unclosed $ swallow the next paragraph', () => {
		const s = scanTex('costs $5 here\n\nand $x$ there');
		expect(s.maths).toHaveLength(1);
		expect(s.maths[0].innerFrom).toBe('costs $5 here\n\nand $'.length);
	});

	it('reads \\[ \\] and \\( \\)', () => {
		const s = scanTex('a \\(x\\) b \\[y\\] c');
		expect(s.maths.map((m) => [m.display, 'a \\(x\\) b \\[y\\] c'.slice(m.innerFrom, m.innerTo)])).toEqual([
			[false, 'x'],
			[true, 'y'],
		]);
	});

	it('leaves an unclosed math environment as text', () => {
		const s = scanTex('\\begin{equation}\nx\n\nmore');
		expect(s.maths).toHaveLength(0);
		expect(s.envs[0].name).toBe('equation');
	});

	it('skips verbatim and the comment environment', () => {
		const text = '\\begin{verbatim}\n\\textbf{x} $y\n\\end{verbatim}\n\\begin{comment}\n\\section{z}\n\\end{comment}';
		const s = scanTex(text);
		expect(s.verbatims).toHaveLength(1);
		expect(s.commands.some((c) => c.name === 'textbf' || c.name === 'section')).toBe(false);
		expect(s.comments).toHaveLength(1);
	});

	it('reads \\verb|…|', () => {
		const s = scanTex('see \\verb|\\x$| here');
		expect(s.verbatims[0].env).toBe('verb');
		expect(s.maths).toHaveLength(0);
	});
});

describe('readArgs', () => {
	it('reads star, optional and mandatory arguments with nested braces', () => {
		const text = '\\section*[short]{A {nested} title}';
		const args = readArgs(text, '\\section'.length, 'som')!;
		expect(args.star).toBe(true);
		expect(text.slice(args.args[0]!.from, args.args[0]!.to)).toBe('short');
		expect(text.slice(args.args[1]!.from, args.args[1]!.to)).toBe('A {nested} title');
		expect(args.end).toBe(text.length);
	});

	it('returns null for a missing or unclosed mandatory argument', () => {
		expect(readArgs('\\textbf x', 7, 'm')).toBeNull();
		expect(readArgs('\\textbf{x', 7, 'm')).toBeNull();
	});

	it('does not close on an escaped brace or one in a comment', () => {
		const text = '\\footnote{a \\} b % }\n c}';
		const args = readArgs(text, 9, 'm')!;
		expect(text.slice(args.args[0]!.from, args.args[0]!.to)).toBe('a \\} b % }\n c');
	});

	it('keeps a ] inside braces within an optional argument', () => {
		const text = '\\item[{a]b}] text';
		const args = readArgs(text, 5, 'o')!;
		expect(text.slice(args.args[0]!.from, args.args[0]!.to)).toBe('{a]b}');
	});
});

describe('text', () => {
	it('reads accents', () => {
		expect(readAccent("\\'e", 0)).toEqual({ text: 'é', to: 3 });
		expect(readAccent('\\"{o}', 0)).toEqual({ text: 'ö', to: 5 });
		expect(readAccent("\\'{\\i}", 0)).toEqual({ text: 'í', to: 6 });
		expect(readAccent('\\v{c}', 0)).toEqual({ text: 'č', to: 5 });
		expect(readAccent('\\vspace', 0)).toBeNull();
	});

	it('reduces LaTeX to text', () => {
		expect(texToPlain("Fig.~\\ref{fig:a} shows \\textbf{50\\%} --- ``quoted''")).toBe('Fig. [fig:a] shows 50% — “quoted”');
		expect(texToPlain('Sch\\"{o}n \\emph{et al.}\\ldots')).toBe('Schön et al.…');
	});
});

describe('document structure', () => {
	it('lists headings with renumbered levels', () => {
		const text = '\\begin{document}\n\\section{A}\n\\subsection*{B \\emph{c}}\n\\section{D}\n\\end{document}';
		expect(extractTexHeadings(text)).toEqual([
			{ level: 1, text: 'A', line: 2 },
			{ level: 2, text: 'B c', line: 3 },
			{ level: 1, text: 'D', line: 4 },
		]);
	});

	it('finds the macros KaTeX needs', () => {
		const macros = extractMacros(DOC);
		expect(macros['\\R']).toBe('\\mathbb{R}');
		expect(macros['\\argmax']).toBe('\\operatorname{arg\\,max}');
		expect(extractMacros('\\newcommand{\\todo}[1]{\\textcolor{red}{#1}}')['\\todo']).toBe('\\textcolor{red}{#1}');
		expect(extractMacros('\\def\\x{y}')['\\x']).toBe('y');
		// KaTeX could not expand these: internals, and a macro calling itself.
		expect(extractMacros('\\renewcommand\\boldmath{\\@nomath\\boldmath}')).toEqual({});
		expect(extractMacros('\\renewcommand{\\vec}[1]{\\vec{\\mathbf{#1}}}')).toEqual({});
	});

	it('reads the root magic comment, inputs, bibliographies and graphics paths', () => {
		expect(magicRoot('% !TEX root = ../main.tex\n\\section{A}')).toBe('../main.tex');
		expect(magicRoot('%!TeX root=main.tex')).toBe('main.tex');
		expect(inputsOf('\\input{sections/01_intro}\n% \\input{old}\n\\include{b.tex}')).toEqual(['sections/01_intro', 'b']);
		expect(bibFilesOf('\\bibliography{refs, more}\n\\addbibresource{x.bib}')).toEqual(['refs.bib', 'more.bib', 'x.bib']);
		expect(graphicsPathOf('\\graphicspath{{figures/}{img/}}')).toEqual(['figures/', 'img/']);
	});
});

describe('aux', () => {
	const aux = String.raw`\relax
\bibcite{smith2020}{1}
\bibcite{jones2021}{2}
\newlabel{sec:intro}{{I}{1}{Introduction}{section.1}{}}
\newlabel{fig:a}{{3}{2}}
\newlabel{fig:a@cref}{{[figure][3][]3}{[1][2][]2}}
\newlabel{eq:e}{{\relax 2}{3}}
\@input{chap1.aux}
`;

	it('reads label numbers and citation numbers', () => {
		const data = parseAux(aux);
		expect(data.labels).toEqual({ 'sec:intro': 'I', 'fig:a': '3', 'eq:e': '2' });
		expect(data.cites).toEqual({ smith2020: '1', jones2021: '2' });
		expect(data.includes).toEqual(['chap1.aux']);
	});

	it('reads natbib citations', () => {
		expect(parseAux('\\bibcite{k}{{4}{2020}{{Smith}}{{Smith and Jones}}}').cites.k).toBe('4');
	});

	it('cleans formatting off numbers', () => {
		expect(cleanAuxNumber('\\textup {II}-B')).toBe('II-B');
	});

	it('formats numeric citations as IEEEtran does', () => {
		expect(formatCiteNumbers(['3', '1', '2', '5'])).toBe('[1]–[3], [5]');
		expect(formatCiteNumbers(['4', '7'])).toBe('[4], [7]');
	});
});

describe('bib', () => {
	const bib = String.raw`@string{tpami = "IEEE TPAMI"}
@article{smith2020,
  author = {Smith, John and Jones, Mary and Lee, K.},
  title = {A {Great} Paper},
  journal = tpami,
  year = 2020,
}
@inproceedings{vanb, author = "Ludwig van Beethoven", title="Sonata", booktitle={Proc.}, year={1801}}
@misc{org, author = {{World Health Organization}}, title = {Report}, year = {2023}}
@comment{ignored}`;

	it('reads entries, @string macros and quoted values', () => {
		const entries = parseBib(bib);
		expect(Object.keys(entries)).toEqual(['smith2020', 'vanb', 'org']);
		expect(entries.smith2020).toMatchObject({ authorShort: 'Smith et al.', title: 'A Great Paper', venue: 'IEEE TPAMI', year: '2020' });
		expect(entries.vanb.authorShort).toBe('van Beethoven');
		expect(entries.org.authorShort).toBe('World Health Organization');
	});

	it('takes family names from either form', () => {
		expect(familyName('Smith, John')).toBe('Smith');
		expect(familyName('John Smith')).toBe('Smith');
	});

	it('labels citations by number, else author–year, else key', () => {
		const entries = parseBib(bib);
		expect(citeLabel(['smith2020'], { smith2020: '1' }, entries)).toBe('[1]');
		expect(citeLabel(['smith2020'], {}, entries)).toBe('[Smith et al., 2020]');
		expect(citeLabel(['smith2020'], {}, entries, true)).toBe('Smith et al. (2020)');
		expect(citeLabel(['nobody'], {}, entries)).toBe('[nobody]');
	});
});

describe('tabular', () => {
	it('reads column specs', () => {
		expect(parseColSpec('l|c|r')).toEqual(['l', 'c', 'r']);
		expect(parseColSpec('@{}lp{3cm}*{2}{c}@{}')).toEqual(['l', 'l', 'c', 'c']);
		expect(parseColSpec('>{\\bfseries}lS')).toEqual(['l', 'c']);
	});

	it('reads rows, cells, rules and multicolumn', () => {
		const body = String.raw`
\toprule
 & \multicolumn{2}{c}{Errors} \\ \cmidrule(lr){2-3}
System & I & M \\
\midrule
Baseline & 15 \% & 3 \\  % note & not a cell
Final & \textbf{0} & 2 \\[2pt]
\bottomrule
`;
		const offset = 100;
		const t = parseTabular(body, offset, 'lrr');
		const cell = (r: number, c: number) => body.slice(t.rows[r].cells[c].from - offset, t.rows[r].cells[c].to - offset);
		expect(t.rows).toHaveLength(4);
		expect(t.rows[0].rulesAbove).toEqual([{ kind: 'thick' }]);
		expect(t.rows[0].cells[1]).toMatchObject({ colspan: 2, align: 'c' });
		expect(cell(0, 1)).toBe('Errors');
		expect(t.rows[1].rulesAbove).toEqual([{ kind: 'partial', first: 2, last: 3 }]);
		expect(t.rows[2].rulesAbove).toEqual([{ kind: 'thin' }]);
		expect(cell(2, 1)).toBe('15 \\%');
		expect(t.rows[2].cells).toHaveLength(3);
		expect(cell(3, 1)).toBe('\\textbf{0}');
		expect(t.rulesBelow).toEqual([{ kind: 'thick' }]);
	});
});
