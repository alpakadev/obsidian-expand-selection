import type { EditorView } from '@codemirror/view';
import type { Editor } from 'obsidian';
import { Analysis } from '../core/analysis';
import {
	Direction,
	expandSelection,
	selectEnclosed,
	selectSibling,
	shrinkSelection,
	stepsForSelection,
} from '../core/operations';
import { Range, Reference, SelectionOptions, Unit, sameRange } from '../core/types';
import { PickerAnchor, SelectionPicker } from '../ui/picker';
import { OffsetSelection, SelectionHistory, Snapshot, snapshotOf } from './history';

/** Tells the user what was selected. */
export interface SelectionFeedback {
	show(text: string): void;
	clear(): void;
	/** Runs `change` without treating the selection change as one made by the user. */
	quietly(change: () => void): void;
}

type Mode = 'expand' | 'shrink' | 'jump';

type Step = (
	analysis: Analysis,
	selection: Range,
	head: number,
	reference: Reference | null,
) => Unit | null;

/** Applies the selection operations to every cursor of an Obsidian editor. */
export class SelectionController {
	private readonly history = new SelectionHistory();
	private readonly picker = new SelectionPicker();

	constructor(
		private readonly options: () => SelectionOptions,
		private readonly feedback: SelectionFeedback,
	) {}

	expand(editor: Editor): void {
		if (this.picker.isOpen) return this.picker.step(1);
		this.run(editor, 'expand', 'Nothing larger to select', (analysis, selection) =>
			expandSelection(analysis, selection),
		);
	}

	shrink(editor: Editor): void {
		if (this.picker.isOpen) return this.picker.step(-1);
		const text = editor.getValue();
		const previous = this.history.pop(text, readSelections(editor));
		if (previous) {
			this.apply(editor, previous.selections, mainIndex(editor, previous.selections));
			this.history.update(readSelections(editor));
			if (previous.label) this.feedback.show(previous.label);
			else this.feedback.clear();
			return;
		}
		this.run(editor, 'shrink', 'Nothing smaller to select', (analysis, selection, head) =>
			shrinkSelection(analysis, selection, head),
		);
	}

	selectSibling(editor: Editor, direction: Direction): void {
		if (this.picker.isOpen) return this.picker.move(direction);
		const message = direction > 0 ? 'Nothing further of this kind' : 'Nothing earlier of this kind';
		this.run(editor, 'jump', message, (analysis, selection, _head, reference) =>
			selectSibling(analysis, selection, direction, reference ?? undefined),
		);
	}

	selectEnclosed(editor: Editor, direction: Direction): void {
		this.picker.close();
		const message = direction > 0 ? 'No further enclosed text' : 'No earlier enclosed text';
		this.run(editor, 'jump', message, (analysis, selection) =>
			selectEnclosed(analysis, selection, direction),
		);
	}

	/** Opens the picker with every step around the main selection. Pressing the hotkey again grows it. */
	pick(editor: Editor): void {
		if (this.picker.isOpen) return this.picker.step(1);
		const text = editor.getValue();
		const analysis = new Analysis(text, this.options());
		const original = readSelections(editor);
		const main = original[mainIndex(editor, original)]!;
		let { steps, index } = stepsForSelection(analysis, toRange(main), main.head);
		if (steps.length === 0) {
			this.feedback.show('Nothing to select');
			return;
		}
		let moved = false;
		const show = (unit: Unit) => {
			this.apply(editor, [orient(main, unit)], 0);
			this.feedback.show(unit.label);
		};
		const items = () => steps.map((unit) => ({ label: unit.label, preview: preview(text, unit) }));

		this.picker.open(items(), index, anchorAt(editor, main.head), {
			highlight: (i) => {
				index = i;
				show(steps[i]!);
			},
			move: (direction) => {
				const current = steps[index]!;
				const next = selectSibling(analysis, current, direction, {
					kind: current.kind,
					key: current.key,
				});
				if (!next) return;
				moved = true;
				({ steps, index } = stepsForSelection(analysis, next, next.to));
				// Keep the kind that was moved along, even if the same text has another name.
				const exact = steps.findIndex((unit) => sameRange(unit, next));
				if (exact >= 0) {
					steps[exact] = next;
					index = exact;
				}
				this.picker.update(items(), index);
				show(steps[index]!);
				editor.scrollIntoView(toEditorRange(editor, next));
				window.requestAnimationFrame(() => this.picker.place(anchorAt(editor, next.from)));
			},
			choose: (i) => {
				const chosen = steps[i]!;
				show(chosen);
				const stepSnapshot = (unit: Unit): Snapshot => ({
					selections: [orient(main, unit)],
					label: unit.label,
					references: [{ kind: unit.kind, key: unit.key }],
				});
				// Shrinking goes back down through the smaller steps, then to where the cursor was.
				const below = steps.slice(0, i).map(stepSnapshot);
				const stack = moved ? below : [snapshotOf(original), ...below];
				this.history.reset(
					text,
					{ ...stepSnapshot(chosen), selections: readSelections(editor) },
					stack,
				);
				editor.focus();
			},
			cancel: (refocus) => {
				this.apply(editor, original, mainIndex(editor, original));
				this.feedback.clear();
				if (refocus) editor.focus();
			},
		});
		show(steps[index]!);
	}

	/** Closes the picker without changing the selection, for example when the plugin unloads. */
	closePicker(): void {
		this.picker.close();
	}

	private run(editor: Editor, mode: Mode, nothing: string, step: Step): void {
		const text = editor.getValue();
		const analysis = new Analysis(text, this.options());
		const selections = readSelections(editor);
		const previous = this.history.matching(text, selections);
		const main = mainIndex(editor, selections);
		const units = selections.map((selection, i) =>
			step(analysis, toRange(selection), selection.head, previous?.references[i] ?? null),
		);
		if (units.every((unit) => !unit)) {
			this.feedback.show(nothing);
			return;
		}
		const next = selections.map((selection, i) => {
			const unit = units[i];
			return unit ? orient(selection, unit) : selection;
		});

		this.apply(editor, next, main);
		const after = readSelections(editor);
		// The editor merges overlapping selections; then the kinds no longer line up.
		const references =
			after.length === next.length
				? units.map((unit, i) =>
						unit ? { kind: unit.kind, key: unit.key } : (previous?.references[i] ?? null),
					)
				: after.map(() => null);
		const label = units[main]?.label ?? null;
		const snapshot: Snapshot = { selections: after, label, references };
		if (mode === 'expand') this.history.push(text, previous ?? snapshotOf(selections), snapshot);
		else this.history.reset(text, snapshot);
		if (label) this.feedback.show(label);
		else this.feedback.clear();

		const target = units[main];
		if (mode === 'jump' && target) editor.scrollIntoView(toEditorRange(editor, target));
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

function toEditorRange(editor: Editor, range: Range) {
	return { from: editor.offsetToPos(range.from), to: editor.offsetToPos(range.to) };
}

/** Keeps the direction of a backward selection, so the cursor stays on the side it was on. */
function orient(previous: OffsetSelection, range: Range): OffsetSelection {
	return previous.anchor > previous.head
		? { anchor: range.to, head: range.from }
		: { anchor: range.from, head: range.to };
}

/** One line of text for the picker: whitespace collapsed, long text shortened in the middle at word breaks. */
function preview(text: string, range: Range): string {
	const flat = text.slice(range.from, range.to).replace(/\s+/g, ' ').trim();
	if (flat.length <= 50) return flat;
	const start = flat.slice(0, 30).replace(/\s+\S*$/, '');
	const end = flat.slice(-18).replace(/^\S*\s+/, '');
	return `${start} … ${end}`;
}

/** Screen position of a document offset, from CodeMirror when available. */
function anchorAt(editor: Editor, offset: number): PickerAnchor {
	const view = (editor as unknown as { cm?: EditorView }).cm;
	const coords = view?.coordsAtPos?.(offset);
	if (coords) return { left: coords.left, top: coords.top, bottom: coords.bottom };
	const selection = activeWindow.getSelection();
	const rect = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).getBoundingClientRect() : null;
	if (rect && rect.height > 0) return { left: rect.left, top: rect.top, bottom: rect.bottom };
	return { left: activeWindow.innerWidth / 3, top: activeWindow.innerHeight / 3, bottom: activeWindow.innerHeight / 3 };
}
