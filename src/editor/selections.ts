import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { Editor } from 'obsidian';
import type { Range } from '../core/types';

/** A selection as document offsets. */
export interface OffsetSelection {
	anchor: number;
	head: number;
}

/** How the selection change should move the view. */
export type Scroll = 'keep' | 'reveal';

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
		const target = ranges[index]!;
		view.dispatch({
			selection: EditorSelection.create(ranges, index),
			effects: scroll === 'reveal' ? EditorView.scrollIntoView(target, { y: 'nearest' }) : [],
		});
		return;
	}
	const before = editor.getScrollInfo();
	editor.setSelections(
		selections.map((s) => ({ anchor: editor.offsetToPos(s.anchor), head: editor.offsetToPos(s.head) })),
		index,
	);
	const target = toRange(selections[index]!);
	if (scroll === 'reveal') {
		editor.scrollIntoView({ from: editor.offsetToPos(target.from), to: editor.offsetToPos(target.to) });
	} else {
		editor.scrollTo(before.left, before.top);
	}
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
 * Puts the intended selection back if the editor widened it over formatting marks, right away
 * and again once the editor has redrawn (by then the marks are shown, so it stays).
 * `current` must turn false as soon as a newer selection was set, so a late check never
 * undoes it.
 */
export function keepSelections(
	editor: Editor,
	intended: OffsetSelection[],
	reapply: () => void,
	current: () => boolean,
): void {
	const check = () => {
		if (!current()) return;
		if (widenedOverMarkup(editor.getValue(), readSelections(editor), intended)) reapply();
	};
	check();
	if (typeof window === 'undefined') return; // unit tests
	window.requestAnimationFrame(check);
	window.setTimeout(check, 120);
}
