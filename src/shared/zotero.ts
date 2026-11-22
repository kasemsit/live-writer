/**
 * md-live-preview-plus: from a citation key to the paper in Zotero — its PDF
 * in Zotero's reader, or the item in the library. The host asks Zotero's
 * local API (Zotero 7+, which knows each item's `citationKey`), else Better
 * BibTeX, else reads the keys a vault's `@key` reference note records
 * (src/editor/features/zotero.ts). These are the parsing rules.
 */

/** The links the preview may open: nothing else is passed to the system. */
export const ZOTERO_LINK = /^zotero:\/\/(?:open-pdf|select)\/library\/items\/[A-Z0-9]{8}$/;

const ITEM_KEY = /^[A-Z0-9]{8}$/;

export const pdfLink = (attachmentKey: string) => `zotero://open-pdf/library/items/${attachmentKey}`;
export const itemLink = (itemKey: string) => `zotero://select/library/items/${itemKey}`;

interface ApiItem {
	key?: string;
	data?: { itemType?: string; citationKey?: string; contentType?: string; parentItem?: string; linkMode?: string };
}

/** The key of the item whose citation key is `citekey`, in a local-API search result; null when none. */
export function itemKeyFor(items: unknown, citekey: string): string | null {
	if (!Array.isArray(items)) return null;
	const hit = (items as ApiItem[]).find((i) => i.data?.itemType !== 'attachment' && i.data?.citationKey === citekey);
	return hit?.key && ITEM_KEY.test(hit.key) ? hit.key : null;
}

/** The first PDF among an item's children (local API); null when it has none. */
export function pdfKeyOf(children: unknown): string | null {
	if (!Array.isArray(children)) return null;
	const pdf = (children as ApiItem[]).find((c) => c.data?.itemType === 'attachment' && c.data.contentType === 'application/pdf');
	return pdf?.key && ITEM_KEY.test(pdf.key) ? pdf.key : null;
}

/** The attachment key of the first PDF Better BibTeX's `item.attachments` lists; null when none. */
export function pdfKeyFromBetterBibtex(result: unknown): string | null {
	if (!Array.isArray(result)) return null;
	for (const a of result as { open?: string; path?: string }[]) {
		const m = /^zotero:\/\/open-pdf\/library\/items\/([A-Z0-9]{8})/.exec(a.open ?? '');
		if (m && /\.pdf$/i.test(a.path ?? '')) return m[1];
	}
	return null;
}

/** `zotero_key` and `pdf_key` from a reference note's front matter. */
export function keysFromNote(markdown: string): { item: string | null; pdf: string | null } {
	const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1] ?? '';
	const field = (name: string) => new RegExp(`^${name}:[ \\t]*["']?([A-Z0-9]{8})["']?[ \\t]*$`, 'm').exec(front)?.[1] ?? null;
	return { item: field('zotero_key'), pdf: field('pdf_key') };
}
