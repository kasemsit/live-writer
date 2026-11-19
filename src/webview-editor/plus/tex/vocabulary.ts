/**
 * md-live-preview-plus: the LaTeX Live Preview's vocabulary — the
 * environments and commands it knows, and how each is drawn. render.ts looks
 * every name up here; blocks.ts (tables) and inline.ts (table cells) share
 * the tables they need.
 */

export const LIST_ENVS = new Set([
	'itemize',
	'enumerate',
	'description',
	'compactitem',
	'compactenum',
	'asparaitem',
	'asparaenum',
	'inparaenum',
	'IEEEitemize',
	'IEEEenumerate',
	'IEEEdescription',
]);

export const FLOAT_ENVS: Record<string, string> = {
	figure: 'Figure',
	'figure*': 'Figure',
	table: 'Table',
	'table*': 'Table',
	algorithm: 'Algorithm',
	'algorithm*': 'Algorithm',
	wrapfigure: 'Figure',
	wraptable: 'Table',
	sidewaysfigure: 'Figure',
	sidewaystable: 'Table',
	listing: 'Listing',
	subfigure: 'Subfigure',
	subtable: 'Subtable',
};

export const THEOREMS: Record<string, string> = {
	theorem: 'Theorem',
	lemma: 'Lemma',
	corollary: 'Corollary',
	proposition: 'Proposition',
	definition: 'Definition',
	remark: 'Remark',
	example: 'Example',
	conjecture: 'Conjecture',
	claim: 'Claim',
	assumption: 'Assumption',
	problem: 'Problem',
	exercise: 'Exercise',
	observation: 'Observation',
	hypothesis: 'Hypothesis',
	proof: 'Proof',
};
export const ITALIC_THEOREMS = new Set(['theorem', 'lemma', 'corollary', 'proposition', 'conjecture', 'claim', 'hypothesis']);

/** Environments whose body is code-like (drawing commands): shown in a monospace block. */
export const CODE_ENVS = new Set(['tikzpicture', 'tikzcd', 'axis', 'semilogxaxis', 'semilogyaxis', 'loglogaxis', 'groupplot', 'pgfpicture', 'scope', 'circuitikz', 'forest', 'algorithmic', 'tabular', 'tabular*', 'tabularx', 'tabulary', 'longtable', 'array']);

export const TABLE_ENVS = new Set(['tabular', 'tabular*', 'tabularx', 'tabulary', 'longtable', 'tabu', 'supertabular']);

/** Start-of-environment labels for `abstract` and IEEE's keywords. */
export const LABELLED: Record<string, string> = { abstract: 'Abstract', keywords: 'Index Terms', IEEEkeywords: 'Index Terms' };

/** Environments whose `\begin` / `\end` lines are collapsed when the caret is elsewhere. */
export const COLLAPSED = new Set(['document', 'center', 'flushleft', 'flushright', 'quote', 'quotation', 'verse', 'minipage', 'multicols', 'multicols*', 'small', 'footnotesize', 'scriptsize']);

/** Argument specs after `\begin{name}` (default: any `[…]` / `{…}` on the line). */
export const BEGIN_SPECS: Record<string, string> = {
	minipage: 'ooom',
	subfigure: 'om',
	subtable: 'om',
	wrapfigure: 'omom',
	wraptable: 'omom',
	multicols: 'm',
	'multicols*': 'm',
	tabular: 'om',
	'tabular*': 'mom',
	tabularx: 'mom',
};

export const HEADING_CLASS: Record<string, string> = {
	title: 'mlp-line-h1',
	part: 'mlp-line-h1',
	chapter: 'mlp-line-h1',
	section: 'mlp-line-h2',
	subsection: 'mlp-line-h3',
	subsubsection: 'mlp-line-h4',
};

/** Command → class of the element its argument is drawn in. */
export const STYLE_CLASS: Record<string, string> = {
	textbf: 'mlp-strong',
	textit: 'mlp-em',
	emph: 'mlp-em',
	textsl: 'mlp-em',
	texttt: 'mlp-tex-tt',
	underline: 'mlp-underline',
	uline: 'mlp-underline',
	textsc: 'mlp-tex-sc',
	textsf: 'mlp-tex-sf',
	textsuperscript: 'mlp-tex-sup',
	textsubscript: 'mlp-tex-sub',
	uppercase: 'mlp-tex-upper',
	MakeUppercase: 'mlp-tex-upper',
	MakeTextUppercase: 'mlp-tex-upper',
	MakeLowercase: 'mlp-tex-lower',
	sout: 'mlp-strikethrough',
	st: 'mlp-strikethrough',
	xout: 'mlp-strikethrough',
	hl: 'mlp-tex-hl',
	textrm: '',
	textnormal: '',
	textup: '',
	textmd: '',
	mbox: '',
	makebox: '',
	text: '',
	hbox: '',
	makecell: '',
	shortstack: '',
	thead: 'mlp-strong',
};

export const REF_COMMANDS = /^(ref|eqref|autoref|cref|Cref|pageref|nameref|vref|Vref|subref|labelcref)$/;
export const CITE_COMMANDS = /^(cite|citep|citet|citealp|citealt|citeauthor|citeyear|citeyearpar|citenum|parencite|textcite|autocite|footcite|supercite|smartcite|Cite|Citep|Citet|Textcite|Parencite|Autocite)$/;

export const FOOTNOTES: Record<string, string> = { footnote: 'om', tfootnote: 'm', thanks: 'm', footnotetext: 'om', marginpar: 'om', tablefootnote: 'm' };

/** Commands dimmed (with their arguments) rather than drawn: they change the layout, not the text. */
export const LAYOUT: Record<string, string> = {
	centering: '',
	raggedright: '',
	raggedleft: '',
	noindent: '',
	indent: '',
	tiny: '',
	scriptsize: '',
	footnotesize: '',
	small: '',
	normalsize: '',
	large: '',
	Large: '',
	LARGE: '',
	huge: '',
	Huge: '',
	bfseries: '',
	itshape: '',
	ttfamily: '',
	rmfamily: '',
	sffamily: '',
	mdseries: '',
	upshape: '',
	scshape: '',
	normalfont: '',
	clearpage: '',
	cleardoublepage: '',
	newpage: '',
	pagebreak: 'o',
	nopagebreak: 'o',
	linebreak: 'o',
	nolinebreak: 'o',
	newline: '',
	par: '',
	smallskip: '',
	medskip: '',
	bigskip: '',
	vfill: '',
	hfill: '',
	hfil: '',
	vfil: '',
	null: '',
	protect: '',
	relax: '',
	maketitle: '',
	tableofcontents: '',
	listoffigures: '',
	listoftables: '',
	appendix: '',
	printbibliography: 'o',
	frontmatter: '',
	mainmatter: '',
	backmatter: '',
	IEEEpeerreviewmaketitle: '',
	EOD: '',
	headeretal: '',
	endgraf: '',
	vspace: 'sm',
	hspace: 'sm',
	vskip: '',
	hskip: '',
	setlength: 'mm',
	addtolength: 'mm',
	setcounter: 'mm',
	addtocounter: 'mm',
	pagestyle: 'm',
	thispagestyle: 'm',
	pagenumbering: 'm',
	markboth: 'mm',
	markright: 'm',
	bibliographystyle: 'm',
	color: 'om',
	arrayrulecolor: 'om',
	rowcolors: 'omm',
	captionsetup: 'om',
	resizebox: 'smm',
	scalebox: 'mo',
	rotatebox: 'om',
	adjustbox: 'm',
	titlepgskip: '',
	tabcolsep: '',
	arraystretch: '',
	linewidth: '',
	columnwidth: '',
	textwidth: '',
	usetikzlibrary: 'm',
	pgfplotsset: 'm',
	graphicspath: 'm',
	FloatBarrier: '',
	makeatletter: '',
	makeatother: '',
	and: '',
	AND: '',
	IEEEauthorrefmark: '',
};

/** IEEE front matter and similar: markup hidden, argument shown small. */
export const META: Record<string, string> = {
	history: 'm',
	doi: 'm',
	corresp: 'm',
	date: 'm',
	email: 'm',
	affil: 'om',
	affiliation: 'm',
	institute: 'm',
	IEEEauthorblockN: 'm',
	IEEEauthorblockA: 'm',
	IEEEcompsocitemizethanks: 'm',
};

/** `\todo`-style notes to the writer. */
export const NOTES = new Set(['todo', 'TODO', 'fixme', 'FIXME', 'note', 'comment', 'hl']);
