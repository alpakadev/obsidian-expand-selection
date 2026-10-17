import type { Direction } from '../core/operations';

export interface PickerItem {
	label: string;
	preview: string;
}

/** Screen position of the text the picker belongs to. */
export interface PickerAnchor {
	left: number;
	top: number;
	bottom: number;
}

export interface PickerHandlers {
	/** A row was highlighted: preview it. */
	highlight(index: number): void;
	/** ← or →: move the highlighted step to the previous or next unit of its kind. */
	move(direction: Direction): void;
	choose(index: number): void;
	/** Esc (`refocus`), or the focus went elsewhere, like a click into the note or another window. */
	cancel(refocus: boolean): void;
}

/**
 * A small list next to the cursor with every selection step, from the word to the whole note.
 * The highlighted step is previewed in the editor: ↑↓ or the mouse change the size,
 * ←→ move along, Enter, a click or a number key confirm, Esc puts the selection back.
 */
export class SelectionPicker {
	private el: HTMLElement | null = null;
	private list: HTMLElement | null = null;
	private rows: HTMLElement[] = [];
	private index = 0;
	private handlers: PickerHandlers | null = null;
	/** Set while a handler runs, so a focus change caused by previewing does not close the picker. */
	private busy = false;

	get isOpen(): boolean {
		return this.el !== null;
	}

	open(items: PickerItem[], index: number, anchor: PickerAnchor, handlers: PickerHandlers): void {
		this.close();
		this.handlers = handlers;
		const el = activeDocument.body.createDiv({
			cls: 'smart-select-picker',
			attr: { role: 'dialog', 'aria-label': 'Choose what to select', tabindex: '-1' },
		});
		this.list = el.createDiv({ cls: 'smart-select-picker-list', attr: { role: 'listbox' } });
		el.createDiv({
			cls: 'smart-select-picker-hint',
			text: '↑↓ size   ←→ move   ↵ select   esc cancel',
		});
		el.addEventListener('keydown', this.onKeyDown);
		el.addEventListener('focusout', this.onFocusOut);
		this.el = el;
		this.update(items, index);
		this.place(anchor);
		el.focus({ preventScroll: true });
	}

	/** Replaces the rows, for example after moving to the next unit. */
	update(items: PickerItem[], index: number): void {
		const list = this.list;
		if (!list) return;
		list.empty();
		this.rows = items.map((item, i) => {
			const row = list.createDiv({ cls: 'smart-select-picker-item', attr: { role: 'option' } });
			row.createSpan({ cls: 'smart-select-picker-key', text: i < 9 ? String(i + 1) : '' });
			row.createSpan({ cls: 'smart-select-picker-label', text: item.label });
			row.createSpan({ cls: 'smart-select-picker-preview', text: item.preview });
			row.addEventListener('pointermove', () => {
				if (this.index !== i) this.highlight(i);
			});
			// Keep the focus in the picker when clicking a row.
			row.addEventListener('mousedown', (event) => event.preventDefault());
			row.addEventListener('click', () => this.choose(i));
			return row;
		});
		this.mark(index);
	}

	/** Positions the picker below the anchor, or above it when there is no room below. */
	place(anchor: PickerAnchor): void {
		const el = this.el;
		if (!el) return;
		const win = el.win;
		const margin = 8;
		const left = Math.max(margin, Math.min(anchor.left, win.innerWidth - el.offsetWidth - margin));
		let top = anchor.bottom + 6;
		if (top + el.offsetHeight > win.innerHeight - margin) {
			top = Math.max(margin, anchor.top - el.offsetHeight - 6);
		}
		el.style.setProperty('left', `${left}px`);
		el.style.setProperty('top', `${top}px`);
	}

	/** Highlights the next larger (1) or smaller (-1) step. */
	step(delta: number): void {
		const index = Math.max(0, Math.min(this.rows.length - 1, this.index + delta));
		if (index !== this.index) this.highlight(index);
	}

	move(direction: Direction): void {
		this.run((handlers) => handlers.move(direction));
	}

	close(): void {
		const el = this.el;
		this.el = null;
		this.list = null;
		this.rows = [];
		this.handlers = null;
		if (!el) return;
		// Removing the focused element fires focusout, which must not count as a cancel.
		el.removeEventListener('focusout', this.onFocusOut);
		el.removeEventListener('keydown', this.onKeyDown);
		el.remove();
	}

	private highlight(index: number): void {
		this.mark(index);
		this.run((handlers) => handlers.highlight(index));
	}

	private choose(index: number): void {
		const handlers = this.handlers;
		this.close();
		handlers?.choose(index);
	}

	private cancel(refocus: boolean): void {
		const handlers = this.handlers;
		this.close();
		handlers?.cancel(refocus);
	}

	private mark(index: number): void {
		this.index = index;
		this.rows.forEach((row, i) => {
			row.toggleClass('is-selected', i === index);
			row.setAttribute('aria-selected', String(i === index));
		});
		this.rows[index]?.scrollIntoView({ block: 'nearest' });
	}

	/** Runs a handler and takes the focus back if the editor grabbed it. */
	private run(action: (handlers: PickerHandlers) => void): void {
		const handlers = this.handlers;
		if (!handlers) return;
		this.busy = true;
		try {
			action(handlers);
		} finally {
			this.busy = false;
		}
		if (this.el && !this.el.contains(this.el.doc.activeElement)) this.el.focus({ preventScroll: true });
	}

	private readonly onKeyDown = (event: KeyboardEvent): void => {
		if (event.defaultPrevented) return; // already handled as a hotkey
		const plain = !event.altKey && !event.ctrlKey && !event.metaKey;
		let handled = true;
		if (plain && (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey))) this.step(1);
		else if (plain && (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey))) this.step(-1);
		else if (plain && event.key === 'Home') this.step(-this.rows.length);
		else if (plain && event.key === 'End') this.step(this.rows.length);
		else if (plain && event.key === 'ArrowRight') this.move(1);
		else if (plain && event.key === 'ArrowLeft') this.move(-1);
		else if (event.key === 'Enter') this.choose(this.index);
		else if (event.key === 'Escape') this.cancel(true);
		else if (plain && /^[1-9]$/.test(event.key)) {
			const index = Number(event.key) - 1;
			if (index < this.rows.length) this.choose(index);
		} else {
			// Swallow typing so that it cannot replace the previewed selection.
			handled = plain && event.key.length === 1;
		}
		if (handled) {
			event.preventDefault();
			event.stopPropagation();
		}
	};

	private readonly onFocusOut = (event: FocusEvent): void => {
		if (this.busy || !this.el) return;
		const next = event.relatedTarget;
		if (next instanceof Node && this.el.contains(next)) return;
		this.cancel(false);
	};
}
