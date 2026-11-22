import type { HostToOutlineMessage, OutlineToHostMessage } from '../shared/messages';
import { t } from '../shared/i18n';

interface VsCodeApi {
	postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;
const api = acquireVsCodeApi();

function post(message: OutlineToHostMessage): void {
	api.postMessage(message);
}

const root = document.getElementById('mlp-outline-root')!;

function renderEmpty(text: string): void {
	root.replaceChildren();
	const p = document.createElement('p');
	p.className = 'mlp-empty';
	p.textContent = text;
	root.appendChild(p);
}

let shown: Array<{ line: number; item: HTMLElement }> = [];

/** Marks the heading the caret is under — the last one at or above its line — and keeps it in view. */
function markActive(line: number): void {
	let active: HTMLElement | undefined;
	for (const h of shown) if (h.line <= line) active = h.item;
	for (const h of shown) h.item.classList.toggle('mlp-outline-active', h.item === active);
	active?.scrollIntoView({ block: 'nearest' });
}

function renderHeadings(headings: Array<{ level: number; text: string; line: number }>): void {
	root.replaceChildren();
	shown = [];
	if (headings.length === 0) {
		renderEmpty(t('outline.empty'));
		return;
	}
	const list = document.createElement('ul');
	list.className = 'mlp-outline-list';
	for (const heading of headings) {
		const item = document.createElement('li');
		item.className = `mlp-outline-item mlp-outline-level-${heading.level}`;
		item.textContent = heading.text || t('outline.untitled');
		item.setAttribute('role', 'button');
		item.setAttribute('tabindex', '0');
		item.addEventListener('click', () => post({ type: 'jumpToHeading', line: heading.line }));
		item.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				post({ type: 'jumpToHeading', line: heading.line });
			}
		});
		list.appendChild(item);
		shown.push({ line: heading.line, item });
	}
	root.appendChild(list);
}

window.addEventListener('message', (event: MessageEvent<HostToOutlineMessage>) => {
	const message = event.data;
	switch (message.type) {
		case 'update':
			renderHeadings(message.headings);
			break;
		case 'noDocument':
			shown = [];
			renderEmpty(t('outline.noDocument'));
			break;
		case 'activeLine':
			markActive(message.line);
			break;
	}
});

renderEmpty(t('outline.noDocument'));
post({ type: 'ready' });
