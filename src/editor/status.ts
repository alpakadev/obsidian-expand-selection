import { EditorView } from '@codemirror/view';
import type { Plugin } from 'obsidian';
import type { SelectionFeedback } from './controller';

/** Shows the name of the selected unit in the status bar until the user moves the selection. */
export class SelectionStatus implements SelectionFeedback {
	private readonly el: HTMLElement;
	private changing = false;

	constructor(
		plugin: Plugin,
		private readonly enabled: () => boolean,
	) {
		this.el = plugin.addStatusBarItem();
		this.el.addClass('smart-select-status');
		this.el.hide();
		plugin.registerEditorExtension(
			EditorView.updateListener.of((update) => {
				if (update.selectionSet && !this.changing) this.clear();
			}),
		);
		plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', () => this.clear()));
	}

	show(text: string): void {
		if (!this.enabled()) {
			this.clear();
			return;
		}
		this.el.setText(text);
		this.el.show();
	}

	clear(): void {
		this.el.setText('');
		this.el.hide();
	}

	quietly(change: () => void): void {
		this.changing = true;
		try {
			change();
		} finally {
			this.changing = false;
		}
	}
}
