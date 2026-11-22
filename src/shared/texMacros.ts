import { isLetter, matchBrace, readArgs, scanTex, type TexScan } from './texScanner';

/**
 * md-live-preview-plus: the macros a LaTeX file defines, for KaTeX — read by
 * the webview from the file being edited and by the host from the root's
 * preamble.
 */

/**
 * Adds a macro unless KaTeX could not expand it: one that uses LaTeX
 * internals (`\@…`) or calls itself (`\renewcommand\boldmath{…\boldmath…}`),
 * which would turn every formula using it into an error.
 */
function addMacro(macros: Record<string, string>, name: string, body: string): void {
	if (body.includes('@')) return;
	for (let at = body.indexOf(name); at >= 0; at = body.indexOf(name, at + 1)) {
		if (!isLetter(body.charCodeAt(at + name.length))) return;
	}
	macros[name] = body;
}

/**
 * Macros defined with `\newcommand`, `\renewcommand`, `\providecommand`,
 * `\def` and `\DeclareMathOperator`, in the form KaTeX's `macros` option
 * takes (`#1` stays a parameter). Definitions inside comments are ignored.
 */
export function extractMacros(text: string, scan: TexScan = scanTex(text)): Record<string, string> {
	const macros: Record<string, string> = {};
	for (const cmd of scan.commands) {
		const { name } = cmd;
		if (name === 'newcommand' || name === 'renewcommand' || name === 'providecommand' || name === 'DeclareRobustCommand') {
			let i = cmd.to;
			if (text[i] === '*') i++;
			while (text[i] === ' ') i++;
			let macro: string | null = null;
			if (text[i] === '{') {
				const close = matchBrace(text, i);
				if (close < 0) continue;
				macro = text.slice(i + 1, close).trim();
				i = close + 1;
			} else if (text[i] === '\\') {
				const m = /^\\[A-Za-z]+/.exec(text.slice(i));
				if (!m) continue;
				macro = m[0];
				i += m[0].length;
			}
			if (!macro || !/^\\[A-Za-z]+$/.test(macro)) continue;
			const rest = readArgs(text, i, 'oom');
			if (!rest) continue;
			const body = rest.args[2]!;
			// An optional first argument (`[2][default]`) has no KaTeX equivalent; the default is dropped.
			addMacro(macros, macro, text.slice(body.from, body.to));
		} else if (name === 'DeclareMathOperator') {
			const args = readArgs(text, cmd.to, 'smm');
			if (!args) continue;
			const macro = text.slice(args.args[0]!.from, args.args[0]!.to).trim();
			if (!/^\\[A-Za-z]+$/.test(macro)) continue;
			macros[macro] = `\\operatorname${args.star ? '*' : ''}{${text.slice(args.args[1]!.from, args.args[1]!.to)}}`;
		} else if (name === 'def') {
			const m = /^\\([A-Za-z]+)((?:#\d)*)\{/.exec(text.slice(cmd.to, cmd.to + 80));
			if (!m) continue;
			const open = cmd.to + m[0].length - 1;
			const close = matchBrace(text, open);
			if (close < 0) continue;
			addMacro(macros, `\\${m[1]}`, text.slice(open + 1, close));
		}
	}
	return macros;
}
