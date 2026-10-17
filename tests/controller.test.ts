import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Editor } from 'obsidian';
import { SelectionController } from '../src/editor/controller';
import { DEFAULT_OPTIONS } from '../src/core/types';
import { FakeEditor, FakeFeedback, FakePicker, OffsetSelection } from './fake-editor';

const TEXT = 'Intro.\n\n- **Bold sentence here.** Second sentence.\n- Next item\n';

function setup(...selections: OffsetSelection[]) {
	const editor = new FakeEditor(TEXT, ...selections);
	const feedback = new FakeFeedback();
	const controller = new SelectionController(() => DEFAULT_OPTIONS, feedback, new FakePicker());
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
