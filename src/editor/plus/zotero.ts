import * as vscode from 'vscode';
import type { PlusZoteroLinks } from '../../shared/messages';
import { itemKeyFor, itemLink, keysFromNote, pdfKeyFromBetterBibtex, pdfKeyOf, pdfLink } from '../../shared/plusZotero';
import { readText } from './files';
import { resolveWikiTarget } from './wikiOpen';

/**
 * md-live-preview-plus: the Zotero links for a citation key (shared/plusZotero.ts).
 * Asked of the running Zotero on this computer only (127.0.0.1); when Zotero is
 * closed, a vault's `@key` reference note may still record the keys, and
 * opening a zotero:// link starts Zotero.
 */

const ZOTERO = 'http://127.0.0.1:23119';

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
	const res = await fetch(url, { ...init, signal: AbortSignal.timeout(2500) });
	if (!res.ok) throw new Error(String(res.status));
	return res.json();
}

/** Zotero's local API (Zotero 7+ with "Allow other applications" on): the item by citation key, then its PDF. */
async function fromLocalApi(citekey: string): Promise<PlusZoteroLinks | null> {
	const found = await getJson(`${ZOTERO}/api/users/0/items?q=${encodeURIComponent(citekey)}&qmode=everything&limit=25&format=json`);
	const item = itemKeyFor(found, citekey);
	if (!item) return null;
	const pdf = pdfKeyOf(await getJson(`${ZOTERO}/api/users/0/items/${item}/children?format=json`));
	return { pdf: pdf ? pdfLink(pdf) : null, item: itemLink(item), note: pdf ? '' : 'No PDF is attached to this item in Zotero.' };
}

/** Better BibTeX's JSON-RPC: the item's PDF; the PDF row stands for the item. */
async function fromBetterBibtex(citekey: string): Promise<PlusZoteroLinks | null> {
	const body = (await getJson(`${ZOTERO}/better-bibtex/json-rpc`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', method: 'item.attachments', params: [citekey], id: 1 }),
	})) as { result?: unknown };
	const pdf = pdfKeyFromBetterBibtex(body.result);
	return pdf ? { pdf: pdfLink(pdf), item: itemLink(pdf), note: '' } : null;
}

/** The keys a vault's `@citekey` reference note records (`zotero_key`, `pdf_key`). */
async function fromNote(document: vscode.Uri, citekey: string): Promise<PlusZoteroLinks | null> {
	const uri = await resolveWikiTarget(document, `@${citekey}`);
	const text = uri ? await readText(uri) : null;
	if (!text) return null;
	const keys = keysFromNote(text);
	if (!keys.item && !keys.pdf) return null;
	return { pdf: keys.pdf ? pdfLink(keys.pdf) : null, item: keys.item ? itemLink(keys.item) : null, note: '' };
}

export async function zoteroLinks(document: vscode.Uri, citekey: string): Promise<PlusZoteroLinks> {
	// Zotero is running when either of its interfaces answers, even with nothing found.
	let running = false;
	for (const source of [fromLocalApi, fromBetterBibtex]) {
		try {
			const links = await source(citekey);
			running = true;
			if (links) return links;
		} catch {
			// This interface is off, or Zotero is closed.
		}
	}
	const fromVault = await fromNote(document, citekey).catch(() => null);
	if (fromVault) return fromVault;
	return {
		pdf: null,
		item: null,
		note: running ? `${citekey} is not in your Zotero library.` : 'Zotero is not running, and no reference note records this key.',
	};
}
