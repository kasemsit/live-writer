import type { HostToEditorMessage, NoteAnchor, FeatureEditorToHostMessage, NoteEntry, NotePreview } from '../../shared/messages';

/**
 * The plus modules' channel to the host: request/reply for what only the host
 * can find (notes, anchors, embeds, LaTeX figures — the webview cannot read the
 * workspace), and plain messages.
 */

type Poster = (message: FeatureEditorToHostMessage) => void;

let post: Poster = () => undefined;
let nextId = 1;
const waiting = new Map<number, (value: unknown) => void>();

export function setHostPoster(poster: Poster): void {
	post = poster;
}

/** Sends a message that wants no reply. */
export function sendToHost(message: FeatureEditorToHostMessage): void {
	post(message);
}

/** Resolves with the host's reply, or with `fallback` if none comes within `timeoutMs`. */
export function request<T>(build: (requestId: number) => FeatureEditorToHostMessage, fallback: T, timeoutMs = 4000): Promise<T> {
	const requestId = nextId++;
	return new Promise<T>((resolve) => {
		const timer = setTimeout(() => {
			waiting.delete(requestId);
			resolve(fallback);
		}, timeoutMs);
		waiting.set(requestId, (value) => {
			clearTimeout(timer);
			resolve(value as T);
		});
		post(build(requestId));
	});
}

let notesCache: { at: number; notes: Promise<NoteEntry[]> } | null = null;
const NOTES_TTL_MS = 30_000;

/** Every note in the workspace, cached for half a minute so each keystroke does not rescan it. */
export function listNotes(): Promise<NoteEntry[]> {
	if (!notesCache || Date.now() - notesCache.at > NOTES_TTL_MS) {
		const entry = {
			at: Date.now(),
			// A big workspace's first scan can outlast the timeout; an empty answer
			// is then not cached, so the next keystroke asks again.
			notes: request<NoteEntry[] | null>((requestId) => ({ type: 'listNotes', requestId }), null, 10_000).then((notes) => {
				if (notes === null && notesCache === entry) notesCache = null;
				return notes ?? [];
			}),
		};
		notesCache = entry;
	}
	return notesCache.notes;
}

export function listAnchors(target: string): Promise<NoteAnchor[]> {
	return request<NoteAnchor[]>((requestId) => ({ type: 'listAnchors', requestId, target }), []);
}

const embeds = new Map<string, Promise<string | null>>();

/** A loadable URI for an embedded file, found by name like a wikilink; cached for the session. */
export function resolveEmbed(target: string): Promise<string | null> {
	let src = embeds.get(target);
	if (!src) {
		src = request<string | null>((requestId) => ({ type: 'resolveEmbed', requestId, target }), null);
		embeds.set(target, src);
		// A miss may be a file not yet created; ask again next time.
		void src.then((value) => value === null && embeds.delete(target));
	}
	return src;
}

export function previewLink(target: string): Promise<NotePreview | null> {
	return request<NotePreview | null>((requestId) => ({ type: 'linkPreview', requestId, target }), null);
}

/** The request a reply answers, and the value it carries; null for any other message. */
function replyOf(message: HostToEditorMessage): { requestId: number; value: unknown } | null {
	switch (message.type) {
		case 'notes':
			return { requestId: message.requestId, value: message.notes };
		case 'anchors':
			return { requestId: message.requestId, value: message.anchors };
		case 'linkPreviewResult':
			return { requestId: message.requestId, value: message.preview };
		case 'embedResult':
			return { requestId: message.requestId, value: message.src };
		case 'texAssetResult':
			return { requestId: message.requestId, value: message.asset };
		case 'texPictureResult':
			return { requestId: message.requestId, value: message.picture };
		case 'zoteroLinksResult':
			return { requestId: message.requestId, value: message.links };
		case 'rewriteResult':
			return { requestId: message.requestId, value: { text: message.text, error: message.error, engine: message.engine ?? 'Claude', note: message.note ?? '' } };
		default:
			return null;
	}
}

/** Routes a host reply to its request. Returns true when the message was one. */
export function handleHostReply(message: HostToEditorMessage): boolean {
	const reply = replyOf(message);
	if (!reply) return false;
	const resolve = waiting.get(reply.requestId);
	waiting.delete(reply.requestId);
	resolve?.(reply.value);
	return true;
}
