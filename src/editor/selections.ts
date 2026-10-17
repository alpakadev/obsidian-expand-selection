import { EditorSelection, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { Editor } from 'obsidian';
import type { Range } from '../core/types';

/** A selection as document offsets. */
export interface OffsetSelection {
	anchor: number;
	head: number;
}

/** Where the note is scrolled to, to come back to it exactly. */
export interface ViewState {
	top: number;
	left: number;
	/** CodeMirror's scroll snapshot, which survives Live Preview redrawing content above. */
	snapshot: StateEffect<unknown> | null;
}

/**
 * How a selection change moves the view: `keep` leaves it, `reveal` scrolls as little as needed,
 * `restore` goes back to a saved view, `align` puts position `at` `y` pixels below the top.
 */
export type Scroll = 'keep' | 'reveal' | { restore: ViewState } | { align: number; at: number };

export function viewState(editor: Editor): ViewState {
	const info = editor.getScrollInfo();
	const view = editorView(editor);
	const snapshot = view && typeof view.scrollSnapshot === 'function' ? view.scrollSnapshot() : null;
	return { top: info.top, left: info.left, snapshot };
}

export function readSelections(editor: Editor): OffsetSelection[] {
	return editor.listSelections().map((s) => ({
		anchor: editor.posToOffset(s.anchor),
		head: editor.posToOffset(s.head),
	}));
}

/** Index of the main selection: the one whose head is the editor's cursor. */
export function mainIndex(editor: Editor, selections: OffsetSelection[]): number {
	const head = editor.posToOffset(editor.getCursor('head'));
	const index = selections.findIndex((s) => s.head === head);
	return index >= 0 ? index : selections.length - 1;
}

export function toRange(selection: OffsetSelection): Range {
	return {
		from: Math.min(selection.anchor, selection.head),
		to: Math.max(selection.anchor, selection.head),
	};
}

/** Keeps the direction of a backward selection, so the cursor stays on the side it was on. */
export function orient(previous: OffsetSelection, range: Range): OffsetSelection {
	return previous.anchor > previous.head
		? { anchor: range.to, head: range.from }
		: { anchor: range.from, head: range.to };
}

export function sameSelections(a: OffsetSelection[], b: OffsetSelection[]): boolean {
	return a.length === b.length && a.every((s, i) => s.anchor === b[i]!.anchor && s.head === b[i]!.head);
}

/** The CodeMirror view behind an Obsidian editor, when there is one. */
export function editorView(editor: Editor): EditorView | null {
	const view = (editor as unknown as { cm?: unknown }).cm;
	return view instanceof EditorView ? view : null;
}

/**
 * Sets the selections. With `keep` the view does not move — Obsidian's own `setSelections`
 * scrolls to the cursor, which made previews jump around. With `reveal` the main selection
 * is scrolled into view only as far as needed.
 */
export function setSelections(
	editor: Editor,
	selections: OffsetSelection[],
	main: number,
	scroll: Scroll,
): void {
	if (selections.length === 0) return;
	const index = Math.max(0, Math.min(main, selections.length - 1));
	const view = editorView(editor);
	if (view) {
		const length = view.state.doc.length;
		const clamp = (offset: number) => Math.max(0, Math.min(length, offset));
		const ranges = selections.map((s) => EditorSelection.range(clamp(s.anchor), clamp(s.head)));
		const effects: StateEffect<unknown>[] = [];
		if (scroll === 'reveal') effects.push(EditorView.scrollIntoView(ranges[index]!, { y: 'nearest' }));
		else if (typeof scroll === 'object' && 'align' in scroll) {
			effects.push(EditorView.scrollIntoView(clamp(scroll.at), { y: 'start', yMargin: scroll.align }));
		} else if (typeof scroll === 'object' && scroll.restore.snapshot) effects.push(scroll.restore.snapshot);
		view.dispatch({ selection: EditorSelection.create(ranges, index), effects });
		if (typeof scroll === 'object' && 'restore' in scroll && !scroll.restore.snapshot) {
			const { top, left } = scroll.restore;
			const put = () => view.scrollDOM.scrollTo(left, top);
			put();
			view.requestMeasure({ read: put });
		}
		return;
	}
	const before = editor.getScrollInfo();
	editor.setSelections(
		selections.map((s) => ({ anchor: editor.offsetToPos(s.anchor), head: editor.offsetToPos(s.head) })),
		index,
	);
	const target = toRange(selections[index]!);
	if (scroll === 'reveal' || (typeof scroll === 'object' && 'align' in scroll)) {
		editor.scrollIntoView({ from: editor.offsetToPos(target.from), to: editor.offsetToPos(target.to) });
	} else if (typeof scroll === 'object') {
		editor.scrollTo(scroll.restore.left, scroll.restore.top);
	} else {
		editor.scrollTo(before.left, before.top);
	}
}

/** The scroll mode a late re-apply should use: back to the same saved view, otherwise no movement. */
export function settledScroll(scroll: Scroll): Scroll {
	return typeof scroll === 'object' && 'restore' in scroll ? scroll : 'keep';
}

/** Focuses the editor and puts the view back if focusing scrolled it. */
export function focusKeepingScroll(editor: Editor): void {
	const before = editor.getScrollInfo();
	editor.focus();
	const now = editor.getScrollInfo();
	if (now.top !== before.top || now.left !== before.left) editor.scrollTo(before.left, before.top);
}

/**
 * Whether a range is fully visible in the editor and not covered by `avoid` (the picker).
 * Null when there is no CodeMirror view to measure with.
 */
export function rangeVisible(
	editor: Editor,
	range: Range,
	avoid: { top: number; bottom: number } | null,
): boolean | null {
	const view = editorView(editor);
	if (!view) return null;
	const start = view.coordsAtPos(range.from);
	const end = view.coordsAtPos(range.to, -1);
	if (!start || !end) return false;
	const box = view.scrollDOM.getBoundingClientRect();
	if (start.top < box.top || end.bottom > box.bottom) return false;
	return !avoid || end.bottom <= avoid.top || start.top >= avoid.bottom;
}

/** Top of the line at `offset`, in pixels below the top of the editor's scroll area. */
export function lineTop(editor: Editor, offset: number): number | null {
	const view = editorView(editor);
	const coords = view?.coordsAtPos(offset);
	if (!view || !coords) return null;
	return coords.top - view.scrollDOM.getBoundingClientRect().top;
}

/** Characters Live Preview hides around formatted text. */
const HIDDEN_MARKUP = /^[*_~=%`![\]$]*$/;

/**
 * True when `current` is `intended` widened only over formatting characters. Obsidian's Live
 * Preview can move a selection edge that touches hidden `**` onto the far side of the marks.
 */
export function widenedOverMarkup(
	text: string,
	current: OffsetSelection[],
	intended: OffsetSelection[],
): boolean {
	if (current.length !== intended.length) return false;
	let widened = false;
	for (let i = 0; i < current.length; i++) {
		const now = toRange(current[i]!);
		const wanted = toRange(intended[i]!);
		if (now.from === wanted.from && now.to === wanted.to) continue;
		if (now.from > wanted.from || now.to < wanted.to) return false;
		const extra = text.slice(now.from, wanted.from) + text.slice(wanted.to, now.to);
		if (!HIDDEN_MARKUP.test(extra)) return false;
		widened = true;
	}
	return widened;
}

/**
 * Puts the intended selection back if the editor widened it over formatting marks: right away,
 * after the editor's next redraw (by then the marks are shown, so it stays) and once more shortly
 * after. The checks stop after a short time and as soon as `current` turns false (a newer
 * selection was set), so they never undo something the user did later.
 */
export function keepSelections(
	editor: Editor,
	intended: OffsetSelection[],
	reapply: () => void,
	current: () => boolean,
): void {
	const deadline = performance.now() + 300;
	const check = () => {
		if (!current() || performance.now() > deadline) return;
		if (widenedOverMarkup(editor.getValue(), readSelections(editor), intended)) reapply();
	};
	check();
	if (typeof window === 'undefined') return; // unit tests
	const view = editorView(editor);
	// The editor's own redraw, which also runs in popout windows.
	if (view) view.requestMeasure({ read: check });
	else window.requestAnimationFrame(check);
	window.setTimeout(check, 120);
}
