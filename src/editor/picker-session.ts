import type { Editor } from 'obsidian';
import { Analysis } from '../core/analysis';
import { Direction, selectSibling, stepsForSelection } from '../core/operations';
import {
	PickerRow,
	hasTwoVersions,
	jumpNoun,
	pickerRows,
	rowPreview,
	rowUnit,
	versionsOf,
} from '../core/rows';
import { Reference, SelectionOptions, Unit, containsRange, rangeLength, sameRange } from '../core/types';
import type { PickerAnchor, PickerHandlers, PickerModel, PickerView } from '../ui/picker';
import type { SelectionFeedback } from './controller';
import { SelectionHistory, Snapshot, snapshotOf } from './history';
import { markPreview } from './preview-mark';
import {
	OffsetSelection,
	Scroll,
	ViewState,
	editorView,
	focusKeepingScroll,
	lineTop,
	mainIndex,
	orient,
	rangeVisible,
	readSelections,
	toRange,
	viewState,
} from './selections';

/** What the session needs from the controller. */
export interface SessionContext {
	options: () => SelectionOptions;
	apply: (editor: Editor, selections: OffsetSelection[], main: number, scroll: Scroll, label: string | null) => void;
	feedback: SelectionFeedback;
	history: SelectionHistory;
	/** Marks that the user changed the selection, so no pending check undoes it. */
	settle: () => void;
	anchorAt: (editor: Editor, offset: number) => PickerAnchor;
}

/**
 * One opening of the picker. Rows describe the place around the cursor and never change while it
 * is open. ↑↓ change the row at the cursor, ←→ jump the highlighted row's thing elsewhere, Space
 * switches marks. Previews never move the view; jumps scroll only when the target is hidden,
 * and coming back to the cursor restores the view exactly.
 */
export class PickerSession implements PickerHandlers {
	private readonly text: string;
	private readonly analysis: Analysis;
	private readonly original: OffsetSelection[];
	private readonly mainIndex: number;
	private readonly main: OffsetSelection;
	private readonly rows: PickerRow[];
	private readonly steps: Unit[];
	private index: number;
	private wide: boolean;
	private offset = 0;
	/** Units visited by jumping, by distance from the cursor; 0 is the unit at the cursor. */
	private visited = new Map<number, Unit>();
	private home: ViewState;
	private homeY: number | null;
	private open = false;
	private readonly listeners: [EventTarget, string, EventListener][] = [];

	constructor(
		private readonly editor: Editor,
		private readonly context: SessionContext,
		private readonly view: PickerView,
	) {
		this.text = editor.getValue();
		this.analysis = new Analysis(this.text, context.options());
		this.original = readSelections(editor);
		this.mainIndex = mainIndex(editor, this.original);
		this.main = this.original[this.mainIndex]!;
		const prefer = context.history.matching(this.text, this.original)?.references[this.mainIndex] ?? null;
		const result = pickerRows(this.analysis, toRange(this.main), this.main.head, prefer);
		this.rows = result.rows;
		this.steps = result.steps;
		this.index = result.index;
		this.wide = result.wide;
		this.home = viewState(editor);
		this.homeY = lineTop(editor, this.main.head);
	}

	get isOpen(): boolean {
		return this.open && this.view.isOpen;
	}

	/** Shows the picker; false when there is nothing to choose from. */
	start(): boolean {
		if (this.rows.length === 0) return false;
		this.open = true;
		this.visited = new Map([[0, this.cursorUnit()]]);
		this.view.open(this.model(), this.context.anchorAt(this.editor, this.main.head), this);
		this.preview(this.cursorUnit(), { restore: this.home });
		this.watchScrolling();
		return true;
	}

	highlight(index: number): void {
		if (this.stale() || index < 0 || index >= this.rows.length) return;
		if (index === this.index && this.offset === 0) return;
		this.index = index;
		this.goHome();
	}

	step(delta: number): void {
		if (this.stale()) return;
		const index = Math.max(0, Math.min(this.rows.length - 1, this.index + delta));
		if (this.offset !== 0) {
			this.index = index;
			this.goHome();
		} else if (index !== this.index) {
			this.highlight(index);
		}
	}

	jump(direction: Direction): void {
		if (this.stale()) return;
		const target = this.offset + direction;
		const unit = this.visited.get(target) ?? this.sibling(this.current(), direction);
		if (!unit) {
			this.context.feedback.show(direction > 0 ? 'Nothing further of this kind' : 'Nothing earlier of this kind');
			return;
		}
		this.visited.set(target, unit);
		this.offset = target;
		if (target === 0) this.preview(unit, { restore: this.home });
		else this.preview(unit, this.jumpScroll(unit));
	}

	toggleMarks(): void {
		if (this.stale()) return;
		if (this.offset === 0) {
			if (!hasTwoVersions(this.rows[this.index]!)) return;
			this.wide = !this.wide;
			this.goHome();
			return;
		}
		const current = this.current();
		const versions = versionsOf(this.analysis, current);
		if (!versions || !hasTwoVersions(versions)) return;
		const other = sameRange(versions.wide, current) ? versions.tight : versions.wide;
		this.wide = !this.wide;
		this.visited = new Map([
			[0, this.cursorUnit()],
			[this.offset, other],
		]);
		this.preview(other, this.jumpScroll(other));
	}

	choose(index: number | null): void {
		if (this.stale()) return;
		if (index !== null && (index !== this.index || this.offset !== 0)) {
			this.index = index;
			this.goHome();
		}
		const unit = this.current();
		const away = this.offset !== 0;
		this.close();
		const inside = (away ? stepsForSelection(this.analysis, unit, unit.to).steps : this.steps).filter(
			(step) => containsRange(unit, step) && rangeLength(step) < rangeLength(unit),
		);
		const snapshot = (step: Unit): Snapshot => ({
			selections: [orient(this.main, step)],
			label: step.label,
			references: [reference(step)],
		});
		const stack = [...(away ? [] : [snapshotOf(this.original)]), ...inside.map(snapshot)];
		this.context.history.reset(
			this.text,
			{ selections: readSelections(this.editor), label: unit.label, references: [reference(unit)] },
			stack,
		);
		this.context.feedback.show(unit.label);
		focusKeepingScroll(this.editor);
	}

	/**
	 * Leaving without choosing — Esc, a click into the note, or the focus going elsewhere — puts
	 * back the selection and the view from before the picker opened.
	 */
	cancel(reason: 'escape' | 'blur', target: Node | null = null): void {
		if (!this.open) return;
		const intoNote = reason === 'blur' && target !== null && !!editorView(this.editor)?.dom.contains(target);
		this.close();
		const restore = () => {
			this.context.apply(this.editor, this.original, this.mainIndex, { restore: this.home }, null);
			this.context.feedback.clear();
			if (reason === 'escape' || intoNote) focusKeepingScroll(this.editor);
		};
		if (!intoNote || !target) return restore();
		// The editor is still handling the click; put things back once the button is released.
		const win = target.ownerDocument?.defaultView ?? window;
		let done = false;
		const once = () => {
			if (done) return;
			done = true;
			win.removeEventListener('pointerup', once, true);
			win.setTimeout(restore, 0);
		};
		win.addEventListener('pointerup', once, true);
		win.setTimeout(once, 1000);
	}

	layout(): void {
		if (!this.open) return;
		this.home = viewState(this.editor);
		this.homeY = lineTop(this.editor, this.main.head);
		this.view.place(this.context.anchorAt(this.editor, this.main.head));
	}

	/** Closes without changing the selection, for example when another command takes over. */
	close(): void {
		if (!this.open) return;
		this.open = false;
		for (const [target, type, listener] of this.listeners) target.removeEventListener(type, listener);
		this.listeners.length = 0;
		markPreview(this.editor, null);
		this.view.close();
	}

	private cursorUnit(): Unit {
		return rowUnit(this.rows[this.index]!, this.wide);
	}

	private current(): Unit {
		return this.visited.get(this.offset) ?? this.cursorUnit();
	}

	private goHome(): void {
		this.offset = 0;
		const unit = this.cursorUnit();
		this.visited = new Map([[0, unit]]);
		this.preview(unit, { restore: this.home });
	}

	private sibling(unit: Unit, direction: Direction): Unit | null {
		if (unit.kind === 'document') return null;
		return selectSibling(this.analysis, unit, direction, reference(unit));
	}

	/** Leaves the view alone when the target can be seen; otherwise puts it where the cursor line was. */
	private jumpScroll(unit: Unit): Scroll {
		const visible = rangeVisible(this.editor, unit, this.view.rect());
		if (visible === null) return 'reveal';
		if (visible) return 'keep';
		const below = this.view.below();
		const view = editorView(this.editor);
		const height = view ? view.scrollDOM.clientHeight - 2 * view.defaultLineHeight : 0;
		const align = Math.max(0, Math.min(this.homeY ?? 0, Math.max(0, height)));
		return { align, at: below ? unit.to : unit.from };
	}

	private preview(unit: Unit, scroll: Scroll): void {
		const selection = orient(this.main, unit);
		this.context.apply(this.editor, [selection], 0, scroll, unit.label);
		markPreview(this.editor, selection);
		this.context.feedback.show(unit.label);
		this.view.render(this.model());
	}

	/** The note changed while the picker was open: close without putting anything back. */
	private stale(): boolean {
		if (!this.open) return true;
		if (this.editor.getValue() === this.text) return false;
		this.close();
		this.context.feedback.clear();
		return true;
	}

	private model(): PickerModel {
		const current = this.current();
		const away = this.offset !== 0;
		const items = this.rows.map((row, i) => {
			const unit = i === this.index && away ? current : rowUnit(row, this.wide);
			const preview = rowPreview(this.text, unit);
			let marks = row.marks;
			if (i === this.index && away) {
				const versions = versionsOf(this.analysis, current);
				marks = versions?.marks ?? null;
			}
			return { label: row.label, preview: preview.text, lines: preview.lines, marks };
		});
		const noun = jumpNoun(current);
		const has = (direction: Direction) =>
			this.visited.has(this.offset + direction) || this.sibling(current, direction) !== null;
		return {
			items,
			index: this.index,
			wide: this.wide,
			offset: this.offset,
			canJump: noun !== null,
			canPrevious: noun !== null && has(-1),
			canNext: noun !== null && has(1),
			previousTitle: noun ? `Previous ${noun} (←)` : '',
			nextTitle: noun ? `Next ${noun} (→)` : '',
			marksHint: this.rows.some(hasTwoVersions),
		};
	}

	/** When the user scrolls the note, their view becomes the one to come back to. */
	private watchScrolling(): void {
		const view = editorView(this.editor);
		if (!view) return;
		let armed = false;
		let pending = false;
		const arm = () => (armed = true);
		const scrolled = () => {
			if (!armed || pending) return;
			pending = true;
			window.requestAnimationFrame(() => {
				pending = false;
				armed = false;
				this.layout();
			});
		};
		const add = (target: EventTarget, type: string, listener: EventListener) => {
			target.addEventListener(type, listener, { passive: true });
			this.listeners.push([target, type, listener]);
		};
		add(view.scrollDOM, 'wheel', arm);
		add(view.scrollDOM, 'touchmove', arm);
		add(view.scrollDOM, 'scroll', scrolled);
	}
}

function reference(unit: Unit): Reference {
	return { kind: unit.kind, key: unit.key };
}
