import type { Editor, EditorPosition, EditorRange, EditorSelectionOrCaret } from 'obsidian';
import type { SelectionFeedback } from '../src/editor/controller';
import type { PickerAnchor, PickerHandlers, PickerModel, PickerView } from '../src/ui/picker';

export interface OffsetSelection {
	anchor: number;
	head: number;
}

/** The parts of Obsidian's Editor the plugin uses, backed by a string. */
export class FakeEditor {
	selections: OffsetSelection[];
	main = 0;
	scrolledTo: EditorRange | null = null;
	scrollTop = 0;
	focused = false;

	constructor(
		public text: string,
		...selections: OffsetSelection[]
	) {
		this.selections = selections;
	}

	get editor(): Editor {
		return this as unknown as Editor;
	}

	getValue(): string {
		return this.text;
	}

	posToOffset(pos: EditorPosition): number {
		const lines = this.text.split('\n');
		let offset = 0;
		for (let i = 0; i < pos.line; i++) offset += lines[i]!.length + 1;
		return offset + pos.ch;
	}

	offsetToPos(offset: number): EditorPosition {
		const before = this.text.slice(0, offset).split('\n');
		return { line: before.length - 1, ch: before[before.length - 1]!.length };
	}

	listSelections() {
		return this.selections.map((s) => ({
			anchor: this.offsetToPos(s.anchor),
			head: this.offsetToPos(s.head),
		}));
	}

	setSelections(ranges: EditorSelectionOrCaret[], main?: number): void {
		this.selections = ranges.map((r) => ({
			anchor: this.posToOffset(r.anchor),
			head: this.posToOffset(r.head ?? r.anchor),
		}));
		this.main = main ?? 0;
	}

	getCursor(): EditorPosition {
		return this.offsetToPos(this.selections[this.main]!.head);
	}

	scrollIntoView(range: EditorRange): void {
		this.scrolledTo = range;
	}

	getScrollInfo() {
		return { top: this.scrollTop, left: 0, height: 1000, width: 500, clientHeight: 500, clientWidth: 500 };
	}

	scrollTo(_x?: number | null, y?: number | null): void {
		if (typeof y === 'number') this.scrollTop = y;
	}

	focus(): void {
		this.focused = true;
	}

	selected(): string[] {
		return this.selections.map((s) =>
			this.text.slice(Math.min(s.anchor, s.head), Math.max(s.anchor, s.head)),
		);
	}
}

export class FakeFeedback implements SelectionFeedback {
	shown: string | null = null;
	show(text: string): void {
		this.shown = text;
	}
	clear(): void {
		this.shown = null;
	}
	quietly(change: () => void): void {
		change();
	}
}

/** Records what the picker would show and lets tests press its keys. */
export class FakePicker implements PickerView {
	model: PickerModel | null = null;
	handlers: PickerHandlers | null = null;
	isOpen = false;

	open(model: PickerModel, _anchor: PickerAnchor, handlers: PickerHandlers): void {
		this.model = model;
		this.handlers = handlers;
		this.isOpen = true;
	}
	render(model: PickerModel): void {
		this.model = model;
	}
	place(): void {}
	rect() {
		return null;
	}
	below(): boolean {
		return true;
	}
	close(): void {
		this.isOpen = false;
	}

	/** Like the real picker: it closes itself before handing over a choice or a cancel. */
	press(action: (handlers: PickerHandlers) => void, closes = false): void {
		const handlers = this.handlers!;
		if (closes) this.close();
		action(handlers);
	}

	labels(): string[] {
		return this.model!.items.map((item) => item.label);
	}
}
