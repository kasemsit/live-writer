import type { EditorState } from '@codemirror/state';
import { extractMacros, type TexScan } from '../../../shared/plusTexScan';
import { texContextField, texScanField } from './context';

/**
 * md-live-preview-plus: the macros KaTeX gets — the root preamble's (from the
 * host) under this file's own. Kept as one object per distinct set, so math
 * widgets compare equal across edits that do not change a definition.
 */

const byScan = new WeakMap<TexScan, Record<string, string>>();
let last: { key: string; macros: Record<string, string> } | null = null;

export function texMacros(state: EditorState): Record<string, string> {
	const scan = state.field(texScanField);
	const ctx = state.field(texContextField);
	let own = byScan.get(scan);
	if (!own) {
		own = scan.commands.some((c) => /^(newcommand|renewcommand|providecommand|DeclareMathOperator|def|DeclareRobustCommand)$/.test(c.name))
			? extractMacros(state.doc.toString(), scan)
			: {};
		byScan.set(scan, own);
	}
	const merged = { ...ctx.macros, ...own };
	const key = JSON.stringify(merged);
	if (last && last.key === key) return last.macros;
	last = { key, macros: merged };
	return merged;
}
