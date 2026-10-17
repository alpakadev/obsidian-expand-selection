import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Editor, EditorPosition, EditorRange, EditorSelectionOrCaret } from 'obsidian';
import { SelectionController, SelectionFeedback } from '../src/editor/controller';
import { DEFAULT_OPTIONS } from '../src/core/types';

interface OffsetSelection {
	anchor: number;
	head: number;
}

/** The parts of Obsidian's Editor the controller uses, backed by a string. */
class FakeEditor {
	selections: OffsetSelection[];
	main = 0;
	scrolledTo: EditorRange | null = null;

	constructor(
		readonly text: string,
		...selections: OffsetSelection[]
	) {
		this.selections = selections;
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

	scrollTop = 0;

	getScrollInfo() {
		return { top: this.scrollTop, left: 0, height: 1000, width: 500, clientHeight: 500, clientWidth: 500 };
	}

	scrollTo(_x?: number | null, y?: number | null): void {
		if (typeof y === 'number') this.scrollTop = y;
	}

	selected(): string[] {
		return this.selections.map((s) =>
			this.text.slice(Math.min(s.anchor, s.head), Math.max(s.anchor, s.head)),
		);
	}
}

class FakeFeedback implements SelectionFeedback {
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

const TEXT = 'Intro.\n\n- **Bold sentence here.** Second sentence.\n- Next item\n';

function setup(...selections: OffsetSelection[]) {
	const editor = new FakeEditor(TEXT, ...selections);
	const feedback = new FakeFeedback();
	const controller = new SelectionController(() => DEFAULT_OPTIONS, feedback);
	return { editor, feedback, controller, asEditor: editor as unknown as Editor };
}

const cursor = (offset: number): OffsetSelection => ({ anchor: offset, head: offset });

describe('selection controller', () => {
	it('shrinks back through the expansion history', () => {
		const { editor, feedback, controller, asEditor } = setup(cursor(TEXT.indexOf('sentence here') + 3));
		controller.expand(asEditor);
		controller.expand(asEditor);
		controller.expand(asEditor);
		assert.deepEqual(editor.selected(), ['Bold sentence here.']);
		assert.equal(feedback.shown, 'Inside **…**');
		controller.shrink(asEditor);
		assert.deepEqual(editor.selected(), ['Bold sentence here']);
		assert.equal(feedback.shown, 'Sentence without final punctuation');
		controller.shrink(asEditor);
		controller.shrink(asEditor);
		assert.deepEqual(editor.selections, [cursor(TEXT.indexOf('sentence here') + 3)]);
		assert.equal(feedback.shown, null);
	});

	it('forgets the history when the selection was changed by hand', () => {
		const { editor, controller, asEditor } = setup(cursor(TEXT.indexOf('Second') + 2));
		controller.expand(asEditor);
		controller.expand(asEditor);
		const from = TEXT.indexOf('Second');
		editor.selections = [{ anchor: from, head: from + 'Second sentence.'.length }];
		controller.shrink(asEditor);
		assert.deepEqual(editor.selected(), ['Second sentence']);
	});

	it('expands every cursor and keeps backward selections backward', () => {
		const first = TEXT.indexOf('Intro') + 2;
		const second = TEXT.indexOf('Next') + 1;
		const { editor, controller, asEditor } = setup(cursor(first), { anchor: second + 2, head: second });
		controller.expand(asEditor);
		assert.deepEqual(editor.selected(), ['Intro', 'Next']);
		const [, backward] = editor.selections;
		assert.ok(backward!.anchor > backward!.head);
	});

	it('jumps to the next unit of the same kind and scrolls to it', () => {
		const { editor, feedback, controller, asEditor } = setup(cursor(TEXT.indexOf('Second') + 1));
		controller.expand(asEditor);
		controller.expand(asEditor);
		controller.expand(asEditor);
		assert.deepEqual(editor.selected(), ['Second sentence.']);
		controller.selectSibling(asEditor, -1);
		assert.deepEqual(editor.selected(), ['Bold sentence here.']);
		assert.equal(feedback.shown, 'Sentence');
		assert.ok(editor.scrolledTo);
		// Still moving by sentences, although this sentence is also bold text.
		controller.selectSibling(asEditor, 1);
		assert.deepEqual(editor.selected(), ['Second sentence.']);
	});

	it('shrinks a selection that was reached by jumping', () => {
		const { editor, controller, asEditor } = setup(cursor(TEXT.indexOf('Intro') + 1));
		controller.selectEnclosed(asEditor, 1);
		assert.deepEqual(editor.selected(), ['Bold sentence here.']);
		controller.shrink(asEditor);
		assert.deepEqual(editor.selected(), ['Bold sentence here']);
	});

	it('forgets the kind of unit when the text changes', () => {
		const { editor, controller, asEditor } = setup(cursor(TEXT.indexOf('Second') + 1));
		controller.expand(asEditor);
		controller.expand(asEditor);
		controller.expand(asEditor);
		controller.selectSibling(asEditor, -1);
		const changed = new FakeEditor(TEXT.replace('Intro.', 'Intro!'), ...editor.selections);
		controller.selectSibling(changed as unknown as Editor, 1);
		// Without the remembered kind, the bold sentence counts as bold text: no more of it follows.
		assert.deepEqual(changed.selected(), ['Bold sentence here.']);
	});

	it('keeps the view where it is when expanding', () => {
		const { editor, controller, asEditor } = setup(cursor(TEXT.indexOf('Intro') + 1));
		editor.scrollTop = 40;
		controller.expand(asEditor);
		controller.expand(asEditor);
		assert.equal(editor.scrollTop, 40);
		assert.equal(editor.scrolledTo, null);
	});

	it('reports when there is nothing to do', () => {
		const { feedback, controller, asEditor } = setup({ anchor: 0, head: TEXT.length });
		controller.expand(asEditor);
		assert.equal(feedback.shown, 'Nothing larger to select');
	});
});
