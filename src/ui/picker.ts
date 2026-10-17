import { setIcon } from 'obsidian';
import type { Direction } from '../core/operations';

export interface PickerItem {
	label: string;
	preview: string;
	/** How many lines the previewed text spans. */
	lines: number;
	/** The marks the wide version adds, for rows with two versions. */
	marks: string | null;
}

export interface PickerModel {
	items: PickerItem[];
	index: number;
	/** Whether rows select their version with marks. */
	wide: boolean;
	/** Jumps away from the cursor: +1, -2, … 0 = at the cursor. */
	offset: number;
	canJump: boolean;
	canPrevious: boolean;
	canNext: boolean;
	previousTitle: string;
	nextTitle: string;
	/** Whether any row has two versions, so the marks key does something. */
	marksHint: boolean;
}

/** Screen position of the text the picker belongs to. */
export interface PickerAnchor {
	left: number;
	top: number;
	bottom: number;
}

export interface PickerHandlers {
	highlight(index: number): void;
	step(delta: number): void;
	jump(direction: Direction): void;
	toggleMarks(): void;
	/** Keep row `index`, or what is previewed when null. */
	choose(index: number | null): void;
	cancel(reason: 'escape' | 'blur', target?: Node | null): void;
	layout(): void;
}

export interface PickerView {
	readonly isOpen: boolean;
	open(model: PickerModel, anchor: PickerAnchor, handlers: PickerHandlers): void;
	render(model: PickerModel): void;
	place(anchor: PickerAnchor): void;
	/** The picker's vertical extent on screen, to keep jump targets out from under it. */
	rect(): { top: number; bottom: number } | null;
	/** Whether the picker sits below the cursor line. */
	below(): boolean;
	close(): void;
}

interface RowParts {
	row: HTMLElement;
	label: HTMLElement;
	preview: HTMLElement;
	lines: HTMLElement;
	marks: HTMLElement;
	previous: HTMLElement;
	counter: HTMLElement;
	next: HTMLElement;
}

/**
 * A small list below the cursor with one row per thing around it: Word, Sentence, Bold, Line,
 * List, Whole note. ↑↓ or the mouse choose the size, ←→ or ‹ › jump to the previous or next one,
 * Space or the marks chip switches with or without marks. Enter, a click or 1–9 keep it, Esc
 * puts everything back.
 */
export class SelectionPicker implements PickerView {
	private el: HTMLElement | null = null;
	private list: HTMLElement | null = null;
	private hint: HTMLElement | null = null;
	private tapHint: HTMLElement | null = null;
	private parts: RowParts[] = [];
	private model: PickerModel | null = null;
	private handlers: PickerHandlers | null = null;
	private isBelow = true;
	private widthLocked = false;
	/** Set while a handler runs, so a focus change caused by previewing does not close the picker. */
	private busy = false;
	private pointerType = 'mouse';
	/** Hover reacts only after the pointer really moved, not when rows change under a resting pointer. */
	private hoverFrom: { x: number; y: number } | null = null;
	private hoverArmed = false;
	private hoverFrame = 0;

	get isOpen(): boolean {
		return this.el !== null;
	}

	open(model: PickerModel, anchor: PickerAnchor, handlers: PickerHandlers): void {
		this.close();
		this.handlers = handlers;
		this.widthLocked = false;
		const el = activeDocument.body.createDiv({
			cls: 'smart-select-picker',
			attr: { role: 'dialog', 'aria-label': 'Choose what to select', tabindex: '-1' },
		});
		this.el = el;
		this.list = el.createDiv({ cls: 'smart-select-picker-list', attr: { role: 'listbox' } });
		this.parts = model.items.map((_, i) => this.createRow(i));
		this.tapHint = el.createDiv({ cls: 'smart-select-picker-tap', text: 'Tap again to select' });
		this.tapHint.hide();
		this.hint = el.createDiv({ cls: 'smart-select-picker-hint' });
		el.addEventListener('keydown', this.onKeyDown);
		el.addEventListener('focusout', this.onFocusOut);
		el.addEventListener('pointerdown', this.onPointerDown);
		this.list.addEventListener('pointermove', this.onPointerMove);
		el.win.addEventListener('resize', this.onResize);
		this.render(model);
		this.place(anchor);
		el.focus({ preventScroll: true });
	}

	render(model: PickerModel): void {
		this.model = model;
		model.items.forEach((item, i) => {
			const parts = this.parts[i];
			if (!parts) return;
			const selected = i === model.index;
			parts.row.toggleClass('is-selected', selected);
			parts.row.setAttribute('aria-selected', String(selected));
			parts.label.setText(item.label);
			parts.preview.setText(item.preview);
			parts.lines.setText(item.lines > 1 ? ` · ${item.lines} lines` : '');
			parts.marks.toggleClass('is-hidden', !item.marks);
			parts.marks.setText(item.marks ?? '');
			parts.marks.toggleClass('is-on', model.wide);
			parts.marks.setAttribute('aria-checked', String(model.wide));
			const marksTitle = item.marks ? `Include ${item.marks} (Space)` : '';
			parts.marks.setAttribute('aria-label', marksTitle);
			parts.row.toggleClass('can-jump', selected && model.canJump);
			if (selected) {
				parts.previous.toggleClass('is-disabled', !model.canPrevious);
				parts.next.toggleClass('is-disabled', !model.canNext);
				parts.previous.setAttribute('aria-label', model.previousTitle);
				parts.next.setAttribute('aria-label', model.nextTitle);
				parts.previous.setAttribute('aria-disabled', String(!model.canPrevious));
				parts.next.setAttribute('aria-disabled', String(!model.canNext));
				const offset = model.offset;
				parts.counter.setText(offset === 0 ? '' : offset > 0 ? `+${offset}` : `−${-offset}`);
			} else {
				parts.counter.setText('');
			}
		});
		this.hint?.setText(['↑↓ size', '←→ jump', ...(model.marksHint ? ['space marks'] : [])].join('   '));
		this.revealRow(model.index);
	}

	/** Positions the picker below the anchor, or above it when there is no room below. */
	place(anchor: PickerAnchor): void {
		const el = this.el;
		if (!el) return;
		const win = el.win;
		const margin = 8;
		const left = Math.max(margin, Math.min(anchor.left, win.innerWidth - el.offsetWidth - margin));
		let top = anchor.bottom + 6;
		this.isBelow = true;
		if (top + el.offsetHeight > win.innerHeight - margin) {
			top = Math.max(margin, anchor.top - el.offsetHeight - 6);
			this.isBelow = false;
		}
		el.style.setProperty('left', `${left}px`);
		el.style.setProperty('top', `${top}px`);
		if (!this.widthLocked) {
			// Keep the width, so nothing shifts under the pointer while previews change.
			el.style.setProperty('width', `${el.offsetWidth}px`);
			this.widthLocked = true;
		}
	}

	rect(): { top: number; bottom: number } | null {
		const box = this.el?.getBoundingClientRect();
		return box ? { top: box.top, bottom: box.bottom } : null;
	}

	below(): boolean {
		return this.isBelow;
	}

	close(): void {
		const el = this.el;
		this.el = null;
		this.list = null;
		this.parts = [];
		this.handlers = null;
		this.model = null;
		if (!el) return;
		// Removing the focused element fires focusout, which must not count as a cancel.
		el.removeEventListener('focusout', this.onFocusOut);
		el.removeEventListener('keydown', this.onKeyDown);
		el.win.removeEventListener('resize', this.onResize);
		if (this.hoverFrame) el.win.cancelAnimationFrame(this.hoverFrame);
		this.hoverFrame = 0;
		el.remove();
	}

	private createRow(index: number): RowParts {
		const row = this.list!.createDiv({ cls: 'smart-select-picker-item', attr: { role: 'option' } });
		row.dataset.index = String(index);
		const label = row.createSpan({ cls: 'smart-select-picker-label' });
		const previewCell = row.createSpan({ cls: 'smart-select-picker-preview' });
		const preview = previewCell.createSpan();
		const lines = previewCell.createSpan({ cls: 'smart-select-picker-lines' });
		const marks = row.createEl('button', {
			cls: 'smart-select-picker-marks',
			attr: { role: 'switch', tabindex: '-1' },
		});
		const jump = row.createSpan({ cls: 'smart-select-picker-jump' });
		const previous = jump.createEl('button', { cls: 'clickable-icon', attr: { tabindex: '-1' } });
		setIcon(previous, 'chevron-left');
		const counter = jump.createSpan({ cls: 'smart-select-picker-counter', attr: { 'aria-live': 'polite' } });
		const next = jump.createEl('button', { cls: 'clickable-icon', attr: { tabindex: '-1' } });
		setIcon(next, 'chevron-right');

		marks.addEventListener('click', (event) => {
			event.stopPropagation();
			if (this.model?.index !== index) this.run((h) => h.highlight(index));
			this.run((h) => h.toggleMarks());
		});
		previous.addEventListener('click', (event) => {
			event.stopPropagation();
			this.resetHover();
			this.run((h) => h.jump(-1));
		});
		next.addEventListener('click', (event) => {
			event.stopPropagation();
			this.resetHover();
			this.run((h) => h.jump(1));
		});
		row.addEventListener('click', () => this.onRowClick(index));
		return { row, label, preview, lines, marks, previous, counter, next };
	}

	private onRowClick(index: number): void {
		const model = this.model;
		if (!model) return;
		const highlighted = model.index === index;
		if (this.pointerType === 'touch') {
			if (highlighted) {
				this.choose(model.offset === 0 ? index : null);
			} else {
				this.run((h) => h.highlight(index));
				this.tapHint?.show();
			}
			return;
		}
		if (model.offset !== 0) {
			if (highlighted) this.choose(null);
			else this.run((h) => h.highlight(index));
			return;
		}
		this.choose(index);
	}

	private choose(index: number | null): void {
		const handlers = this.handlers;
		this.close();
		handlers?.choose(index);
	}

	private cancel(reason: 'escape' | 'blur', target: Node | null): void {
		const handlers = this.handlers;
		this.close();
		handlers?.cancel(reason, target);
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

	/** Scrolls the list, never the page, so the highlighted row is visible. */
	private revealRow(index: number): void {
		const list = this.list;
		const row = this.parts[index]?.row;
		if (!list || !row) return;
		if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
		else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
			list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
		}
	}

	private resetHover(): void {
		this.hoverFrom = null;
		this.hoverArmed = false;
	}

	private readonly onPointerDown = (event: PointerEvent): void => {
		this.pointerType = event.pointerType || 'mouse';
		event.preventDefault(); // keep the focus in the picker; click still fires
	};

	private readonly onPointerMove = (event: PointerEvent): void => {
		if (event.pointerType === 'touch' || !this.model || this.model.offset !== 0) return;
		if (!this.hoverArmed) {
			if (!this.hoverFrom) {
				this.hoverFrom = { x: event.clientX, y: event.clientY };
				return;
			}
			const moved = Math.hypot(event.clientX - this.hoverFrom.x, event.clientY - this.hoverFrom.y);
			if (moved < 3) return;
			this.hoverArmed = true;
		}
		const row = (event.target as HTMLElement | null)?.closest?.('.smart-select-picker-item');
		const index = row instanceof HTMLElement ? Number(row.dataset.index) : NaN;
		if (Number.isNaN(index) || index === this.model.index || this.hoverFrame) return;
		this.hoverFrame = event.view?.requestAnimationFrame(() => {
			this.hoverFrame = 0;
			if (this.model && this.model.offset === 0) this.run((h) => h.highlight(index));
		}) ?? 0;
	};

	private readonly onKeyDown = (event: KeyboardEvent): void => {
		if (event.defaultPrevented) return; // already handled as a hotkey
		const plain = !event.altKey && !event.ctrlKey && !event.metaKey;
		const rows = this.parts.length;
		this.resetHover();
		let handled = true;
		const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
		if (plain && (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey))) this.run((h) => h.step(1));
		else if (plain && (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey))) this.run((h) => h.step(-1));
		else if (plain && event.key === 'Home') this.run((h) => h.step(-rows));
		else if (plain && event.key === 'End') this.run((h) => h.step(rows));
		else if (plain && event.key === 'ArrowRight') this.run((h) => h.jump(1));
		else if (plain && event.key === 'ArrowLeft') this.run((h) => h.jump(-1));
		else if (plain && event.key === ' ') this.run((h) => h.toggleMarks());
		else if (event.key === 'Enter') this.choose(null);
		else if (event.key === 'Escape') this.cancel('escape', null);
		else if (plain && digit) {
			const index = Number(digit[1]) - 1;
			if (index < rows) this.choose(index);
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
		this.cancel('blur', next instanceof Node ? next : null);
	};

	private readonly onResize = (): void => {
		this.handlers?.layout();
	};
}
