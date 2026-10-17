import type { Editor } from 'obsidian';
import { Analysis } from '../core/analysis';
import {
	Direction,
	expandSelection,
	selectEnclosed,
	selectSibling,
	shrinkSelection,
} from '../core/operations';
import type { Range, Reference, SelectionOptions, Unit } from '../core/types';
import type { PickerAnchor, PickerView } from '../ui/picker';
import { SelectionHistory, Snapshot, snapshotOf } from './history';
import { PickerSession } from './picker-session';
import {
	OffsetSelection,
	Scroll,
	editorView,
	keepSelections,
	mainIndex,
	orient,
	readSelections,
	setSelections,
	settledScroll,
	toRange,
} from './selections';

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
	private session: PickerSession | null = null;
	/** Counts selection changes, so a late check of an older one does nothing. */
	private changes = 0;

	constructor(
		private readonly options: () => SelectionOptions,
		private readonly feedback: SelectionFeedback,
		private readonly view: PickerView,
	) {}

	expand(editor: Editor): void {
		if (this.session?.isOpen) return this.session.step(1);
		this.run(editor, 'expand', 'Nothing larger to select', (analysis, selection) =>
			expandSelection(analysis, selection),
		);
	}

	shrink(editor: Editor): void {
		if (this.session?.isOpen) return this.session.step(-1);
		const text = editor.getValue();
		const previous = this.history.pop(text, readSelections(editor));
		if (previous) {
			this.apply(editor, previous.selections, mainIndex(editor, previous.selections), 'keep', previous.label);
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
		if (this.session?.isOpen) return this.session.jump(direction);
		const message = direction > 0 ? 'Nothing further of this kind' : 'Nothing earlier of this kind';
		this.run(editor, 'jump', message, (analysis, selection, _head, reference) =>
			selectSibling(analysis, selection, direction, reference ?? undefined),
		);
	}

	selectEnclosed(editor: Editor, direction: Direction): void {
		this.closePicker();
		const message = direction > 0 ? 'No further enclosed text' : 'No earlier enclosed text';
		this.run(editor, 'jump', message, (analysis, selection) =>
			selectEnclosed(analysis, selection, direction),
		);
	}

	/** Opens the picker around the main selection. Pressing the hotkey again picks the next larger row. */
	pick(editor: Editor): void {
		if (this.session?.isOpen) return this.session.step(1);
		const session = new PickerSession(
			editor,
			{
				options: this.options,
				apply: (e, selections, main, scroll, label) => this.apply(e, selections, main, scroll, label),
				feedback: this.feedback,
				history: this.history,
				settle: () => {
					this.changes++;
				},
				anchorAt,
			},
			this.view,
		);
		if (session.start()) this.session = session;
		else this.feedback.show('Nothing to select');
	}

	/** Closes the picker without changing the selection, for example when the plugin unloads. */
	closePicker(): void {
		this.session?.close();
		this.session = null;
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

		const label = units[main]?.label ?? null;
		this.apply(editor, next, main, mode === 'jump' ? 'reveal' : 'keep', label);
		const after = readSelections(editor);
		// The editor merges overlapping selections; then the kinds no longer line up.
		const references =
			after.length === next.length
				? units.map((unit, i) =>
						unit ? { kind: unit.kind, key: unit.key } : (previous?.references[i] ?? null),
					)
				: after.map(() => null);
		const snapshot: Snapshot = { selections: after, label, references };
		if (mode === 'expand') this.history.push(text, previous ?? snapshotOf(selections), snapshot);
		else this.history.reset(text, snapshot);
		if (label) this.feedback.show(label);
		else this.feedback.clear();
	}

	/** Sets the selections and keeps them exact, even if Live Preview widens them over hidden marks. */
	private apply(
		editor: Editor,
		selections: OffsetSelection[],
		main: number,
		scroll: Scroll,
		label: string | null = null,
	): void {
		const change = ++this.changes;
		this.feedback.quietly(() => setSelections(editor, selections, main, scroll));
		keepSelections(
			editor,
			selections,
			() => {
				this.feedback.quietly(() => setSelections(editor, selections, main, settledScroll(scroll)));
				if (label) this.feedback.show(label);
			},
			() => change === this.changes,
		);
	}
}

/** Screen position of a document offset, from CodeMirror when available. */
function anchorAt(editor: Editor, offset: number): PickerAnchor {
	const coords = editorView(editor)?.coordsAtPos(offset);
	if (coords) return { left: coords.left, top: coords.top, bottom: coords.bottom };
	if (typeof activeWindow === 'undefined') return { left: 0, top: 0, bottom: 0 }; // unit tests
	const selection = activeWindow.getSelection();
	const rect = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).getBoundingClientRect() : null;
	if (rect && rect.height > 0) return { left: rect.left, top: rect.top, bottom: rect.bottom };
	return { left: activeWindow.innerWidth / 3, top: activeWindow.innerHeight / 3, bottom: activeWindow.innerHeight / 3 };
}
