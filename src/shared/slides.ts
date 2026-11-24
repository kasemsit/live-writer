import { parse as parseYaml } from 'yaml';
import { linesOutsideCode } from './codeFences';
import { findFencedDivs, frontMatterOf, parseAttrs, TRAILING_ATTRS } from './quarto';

/**
 * A Quarto presentation (`format: revealjs`, `beamer` or `pptx`) as its
 * slides, the way Quarto splits it:
 *
 * - the front matter's `title` makes a title slide;
 * - a heading at `slide-level` (2 unless set) starts a slide, and a heading
 *   above it a section slide;
 * - a horizontal rule starts a slide with no title;
 * - all of these only outside code and fenced divs.
 *
 * Lines are 0-based indexes into the document's lines.
 */

const SLIDE_FORMATS = ['revealjs', 'beamer', 'pptx'];
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

export interface TitleSlide {
	title: string;
	subtitle: string;
	author: string;
	institute: string;
	date: string;
	background: string | null;
}

export interface Slide {
	/** First line: the heading, the rule, or the first line of untitled content. */
	from: number;
	/** Last line that is not blank. */
	to: number;
	kind: 'section' | 'slide';
	/** The heading's text without its attribute block; '' for a rule or untitled content. */
	title: string;
	background: string | null;
	/** Whether `from` is a horizontal rule (drawn as the slide's edge, not as a line). */
	rule: boolean;
	/** 1-based, counting the title slide, as `slide-number: c/t` shows it. */
	number: number;
}

export interface SlideDeck {
	format: string;
	level: number;
	titleSlide: TitleSlide | null;
	/** Line where the front matter ends (its closing `---`), or -1. */
	frontMatterEnd: number;
	slides: Slide[];
	total: number;
}

type Yaml = Record<string, unknown>;

const isObject = (v: unknown): v is Yaml => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

/** `format:` as Quarto reads it: a name, or a map whose first key is the main format. */
function slideFormatOf(data: Yaml): { format: string; options: Yaml } | null {
	const format = data.format;
	if (typeof format === 'string') return SLIDE_FORMATS.includes(format) ? { format, options: {} } : null;
	if (isObject(format)) {
		const first = Object.keys(format)[0];
		if (first && SLIDE_FORMATS.includes(first)) return { format: first, options: isObject(format[first]) ? format[first] : {} };
	}
	return null;
}

function authorOf(v: unknown): string {
	if (Array.isArray(v)) return v.map(authorOf).filter(Boolean).join(', ');
	if (isObject(v)) return text(v.name);
	return text(v);
}

/** Pandoc's `background-color` / reveal.js's `data-background-color`. */
function backgroundOf(kv: Record<string, string>): string | null {
	return kv['background-color'] ?? kv['data-background-color'] ?? null;
}

export function slideDeck(lines: readonly string[]): SlideDeck | null {
	const yaml = frontMatterOf(lines.slice(0, 400).join('\n'));
	if (yaml === null) return null;
	let data: unknown;
	try {
		data = parseYaml(yaml);
	} catch {
		return null;
	}
	if (!isObject(data)) return null;
	const found = slideFormatOf(data);
	if (!found) return null;
	const levelValue = Number(found.options['slide-level'] ?? data['slide-level'] ?? 2);
	const level = Number.isInteger(levelValue) && levelValue >= 1 && levelValue <= 6 ? levelValue : 2;
	const frontMatterEnd = yaml.split('\n').length + 1;

	let titleSlide: TitleSlide | null = null;
	if (text(data.title)) {
		const attrs = isObject(data['title-slide-attributes']) ? data['title-slide-attributes'] : {};
		const kv = Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, text(v)]));
		titleSlide = {
			title: text(data.title),
			subtitle: text(data.subtitle),
			author: authorOf(data.author),
			institute: authorOf(data.institute),
			date: text(data.date),
			background: backgroundOf(kv),
		};
	}

	// Lines inside a fenced div never split slides.
	const inDiv = new Set<number>();
	for (const div of findFencedDivs(lines)) for (let n = div.open; n <= div.close; n++) inDiv.add(n);

	const starts: Omit<Slide, 'to' | 'number'>[] = [];
	let contentBefore = -1;
	for (const i of linesOutsideCode(lines)) {
		if (i <= frontMatterEnd) continue;
		if (inDiv.has(i)) {
			if (!starts.length && contentBefore < 0) contentBefore = i;
			continue;
		}
		const line = lines[i];
		const h = HEADING.exec(line);
		if (h && h[1].length <= level) {
			const attrs = TRAILING_ATTRS.exec(h[2]);
			const kv = attrs ? parseAttrs(attrs[1]).kv : {};
			const title = attrs ? h[2].slice(0, attrs.index) : h[2];
			starts.push({ from: i, kind: h[1].length < level ? 'section' : 'slide', title, background: backgroundOf(kv), rule: false });
		} else if (RULE.test(line)) {
			starts.push({ from: i, kind: 'slide', title: '', background: null, rule: true });
		} else if (!starts.length && contentBefore < 0 && line.trim()) {
			contentBefore = i;
		}
	}
	// Text before the first heading is a slide of its own.
	if (contentBefore >= 0 && (!starts.length || contentBefore < starts[0].from)) {
		starts.unshift({ from: contentBefore, kind: 'slide', title: '', background: null, rule: false });
	}

	const offset = titleSlide ? 1 : 0;
	const slides: Slide[] = starts.map((s, k) => {
		let to = (k + 1 < starts.length ? starts[k + 1].from : lines.length) - 1;
		while (to > s.from && !lines[to].trim()) to--;
		return { ...s, to, number: k + 1 + offset };
	});
	return { format: found.format, level, titleSlide, frontMatterEnd, slides, total: slides.length + offset };
}

/** Whether text on `colour` should be light: relative luminance below one half. */
export function isDarkColour(colour: string): boolean {
	const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim());
	if (!hex) return /^(black|navy|maroon|darkred|darkblue|darkgreen|purple|indigo)$/i.test(colour.trim());
	const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
	const [r, g, b] = [0, 2, 4].map((i) => {
		const c = parseInt(h.slice(i, i + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

/** `. . .`: a pause, where the slide shows the rest on the next click. */
export const PAUSE = /^ {0,3}\. \. \.\s*$/;
