import type { Editor } from 'obsidian';
import { Analysis } from '../core/analysis';
import {
	Direction,
	expandSelection,
	selectEnclosed,
	selectSibling,
	shrinkSelection,
} from '../core/operations';
import type { Range, SelectionOptions, Unit } from '../core/types';
import { OffsetSelection, SelectionHistory } from './history';

/** Tells the user what was selected. */
export interface SelectionFeedback {
	show(text: string): void;
	clear(): void;
	/** Runs `change` without treating the selection change as one made by the user. */
	quietly(change: () => void): void;
}

type Mode = 'expand' | 'shrink' | 'jump';

type Step = (analysis: Analysis, selection: Range, head: number) => Unit | null;

/** Applies the selection operations to every cursor of an Obsidian editor. */
export class SelectionController {
	private readonly history = new SelectionHistory();

	constructor(
		private readonly options: () => SelectionOptions,
		private readonly feedback: SelectionFeedback,
	) {}

	expand(editor: Editor): void {
		this.run(editor, 'expand', 'Nothing larger to select', (analysis, selection) =>
			expandSelection(analysis, selection),
		);
	}

	shrink(editor: Editor): void {
		const length = editor.getValue().length;
		const current = readSelections(editor);
		const previous = this.history.pop(editor, current, length);
		if (previous) {
			this.apply(editor, previous.selections, mainIndex(editor, previous.selections));
			this.history.update(editor, readSelections(editor));
			if (previous.label) this.feedback.show(previous.label);
			else this.feedback.clear();
			return;
		}
		this.run(editor, 'shrink', 'Nothing smaller to select', (analysis, selection, head) =>
			shrinkSelection(analysis, selection, head),
		);
	}

	selectSibling(editor: Editor, direction: Direction): void {
		const message = direction > 0 ? 'Nothing further of this kind' : 'Nothing earlier of this kind';
		this.run(editor, 'jump', message, (analysis, selection) =>
			selectSibling(analysis, selection, direction),
		);
	}

	selectEnclosed(editor: Editor, direction: Direction): void {
		const message = direction > 0 ? 'No further enclosed text' : 'No earlier enclosed text';
		this.run(editor, 'jump', message, (analysis, selection) =>
			selectEnclosed(analysis, selection, direction),
		);
	}

	private run(editor: Editor, mode: Mode, nothing: string, step: Step): void {
		const text = editor.getValue();
		const analysis = new Analysis(text, this.options());
		const selections = readSelections(editor);
		const main = mainIndex(editor, selections);
		const units = selections.map((selection) =>
			step(analysis, toRange(selection), selection.head),
		);
		if (units.every((unit) => !unit)) {
			this.feedback.show(nothing);
			return;
		}
		const next = selections.map((selection, index) => {
			const unit = units[index];
			return unit ? orient(selection, unit) : selection;
		});

		this.apply(editor, next, main);
		const label = units[main]?.label ?? null;
		const snapshot = { selections: readSelections(editor), label };
		if (mode === 'expand') this.history.push(editor, selections, snapshot, text.length);
		else this.history.reset(editor, snapshot, text.length);
		if (label) this.feedback.show(label);
		else this.feedback.clear();

		const target = next[main];
		if (mode === 'jump' && target) {
			const range = toRange(target);
			editor.scrollIntoView({ from: editor.offsetToPos(range.from), to: editor.offsetToPos(range.to) });
		}
	}

	private apply(editor: Editor, selections: OffsetSelection[], main: number): void {
		this.feedback.quietly(() =>
			editor.setSelections(
				selections.map((s) => ({
					anchor: editor.offsetToPos(s.anchor),
					head: editor.offsetToPos(s.head),
				})),
				Math.min(main, selections.length - 1),
			),
		);
	}
}

function readSelections(editor: Editor): OffsetSelection[] {
	return editor.listSelections().map((s) => ({
		anchor: editor.posToOffset(s.anchor),
		head: editor.posToOffset(s.head),
	}));
}

/** Index of the main selection: the one whose head is the editor's cursor. */
function mainIndex(editor: Editor, selections: OffsetSelection[]): number {
	const head = editor.posToOffset(editor.getCursor('head'));
	const index = selections.findIndex((s) => s.head === head);
	return index >= 0 ? index : selections.length - 1;
}

function toRange(selection: OffsetSelection): Range {
	return {
		from: Math.min(selection.anchor, selection.head),
		to: Math.max(selection.anchor, selection.head),
	};
}

/** Keeps the direction of a backward selection, so the cursor stays on the side it was on. */
function orient(previous: OffsetSelection, range: Range): OffsetSelection {
	return previous.anchor > previous.head
		? { anchor: range.to, head: range.from }
		: { anchor: range.from, head: range.to };
}
