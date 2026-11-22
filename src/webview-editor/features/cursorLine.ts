import { type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { sendToHost } from './hostRequests';

/**
 * Tells the host which line the caret is on, so the Outline view can mark the
 * heading being read (an idea from t-shoot's editor 0.6.0, done here through
 * the host, which builds the outline for Markdown, LaTeX and Quarto alike).
 */
export const cursorLineReporter = ViewPlugin.fromClass(
	class {
		private timer: ReturnType<typeof setTimeout> | undefined;
		private last = 0;
		constructor(private readonly view: EditorView) {
			this.schedule();
		}
		update(update: ViewUpdate) {
			if (update.selectionSet || update.docChanged) this.schedule();
		}
		private schedule() {
			clearTimeout(this.timer);
			this.timer = setTimeout(() => {
				const line = this.view.state.doc.lineAt(this.view.state.selection.main.head).number;
				if (line === this.last) return;
				this.last = line;
				sendToHost({ type: 'cursorLine', line });
			}, 120);
		}
		destroy() {
			clearTimeout(this.timer);
		}
	},
);
