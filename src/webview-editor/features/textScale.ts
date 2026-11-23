import { EditorView } from '@codemirror/view';

/**
 * The reader's text size (Larger Text / Smaller Text in the right-click menu),
 * a factor over whatever size the CSS theme sets. The theme sizes the reading
 * column once and everything else in `em`, so scaling that one size scales
 * headings, tables and formulas with it. The factor itself is a VS Code
 * setting, so it is remembered and shared by every open preview; the host
 * sends it after each `init`.
 */

let scale = 1;
let font = '';
let width = 0;

// Code, formulas and drawn source keep their own fonts.
const TEXT = '.cm-editor .cm-content, .cm-editor .cm-content :not(code, pre, kbd, .katex, .katex *, .mlp-tex-code, .mlp-tex-code *, .mlp-line-code, .mlp-line-code *), .mlp-link-preview, .mlp-link-preview :not(code, pre, .katex, .katex *)';

function apply(view: EditorView | null): void {
	let style = document.getElementById('mlp-plus-text-scale') as HTMLStyleElement | null;
	if (!style) {
		style = document.createElement('style');
		style.id = 'mlp-plus-text-scale';
		document.head.appendChild(style);
	}
	// Measure the theme's own size with the override off, then scale that.
	style.textContent = '';
	if (!view) return;
	const rules: string[] = [];
	if (scale !== 1) {
		const base = parseFloat(getComputedStyle(view.contentDOM).fontSize) || 16;
		rules.push(`.cm-editor .cm-content.cm-content { font-size: ${(base * scale).toFixed(2)}px !important; }`);
	}
	if (font) rules.push(`${TEXT} { font-family: ${font} !important; }`);
	// The reading column, in em of the text so it follows the text size; the
	// gutters are the editor's own (webview-editor-theme.css).
	if (width > 0) rules.push(`.cm-editor .cm-content.cm-content { max-width: calc(${width}em + 2 * clamp(1rem, 3.5vw, 2.5rem)) !important; }`);
	style.textContent = rules.join('\n');
	view.requestMeasure();
}

export function setTextScale(view: EditorView | undefined, next: number, fontFamily = '', pageWidth = 0): void {
	scale = next;
	font = fontFamily;
	width = Number.isFinite(pageWidth) && pageWidth > 0 ? pageWidth : 0;
	apply(view ?? null);
}

/** After the theme CSS (or the document) changed: the base size may have too. */
export function reapplyTextScale(): void {
	setTimeout(() => {
		const root = document.querySelector('.cm-editor') as HTMLElement | null;
		apply(root ? EditorView.findFromDOM(root) : null);
	}, 0);
}
