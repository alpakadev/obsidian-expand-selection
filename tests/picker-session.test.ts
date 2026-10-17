import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SelectionController } from '../src/editor/controller';
import { DEFAULT_OPTIONS } from '../src/core/types';
import { FakeEditor, FakeFeedback, FakePicker } from './fake-editor';

const TEXT = '- **Bold sentence here.** Second sentence.\n- Next item. More text.\n- Last.\n';

function setup(cursorAt: string) {
	const offset = TEXT.indexOf(cursorAt) + 1;
	const editor = new FakeEditor(TEXT, { anchor: offset, head: offset });
	const feedback = new FakeFeedback();
	const picker = new FakePicker();
	const controller = new SelectionController(() => DEFAULT_OPTIONS, feedback, picker);
	editor.scrollTop = 120;
	controller.pick(editor.editor);
	return { editor, feedback, picker, controller };
}

describe('picker session', () => {
	it('opens on the word and previews without scrolling', () => {
		const { editor, picker } = setup('sentence here');
		assert.deepEqual(picker.labels(), ['Word', 'Sentence', 'Bold', 'Line', 'List', 'Whole note']);
		assert.deepEqual(editor.selected(), ['sentence']);
		picker.press((h) => h.step(4));
		assert.deepEqual(editor.selected(), [TEXT.trimEnd()]);
		assert.equal(editor.scrollTop, 120);
		assert.equal(editor.scrolledTo, null);
	});

	it('switches marks with Space only where a row has two versions', () => {
		const { editor, picker } = setup('sentence here');
		picker.press((h) => h.toggleMarks());
		assert.deepEqual(editor.selected(), ['sentence'], 'Word has one version');
		assert.equal(picker.model!.wide, true);
		picker.press((h) => h.step(2));
		assert.deepEqual(editor.selected(), ['**Bold sentence here.**']);
		picker.press((h) => h.toggleMarks());
		assert.deepEqual(editor.selected(), ['Bold sentence here.']);
		assert.equal(picker.model!.wide, false);
	});

	it('jumps sideways, counts, and comes back exactly', () => {
		const { editor, picker } = setup('sentence here');
		picker.press((h) => h.step(1));
		assert.deepEqual(editor.selected(), ['Bold sentence here.']);
		picker.press((h) => h.jump(1));
		assert.deepEqual(editor.selected(), ['Second sentence.']);
		assert.equal(picker.model!.offset, 1);
		assert.ok(editor.scrolledTo, 'a jump may scroll');
		picker.press((h) => h.jump(1));
		assert.deepEqual(editor.selected(), ['Next item.']);
		picker.press((h) => h.jump(-1));
		picker.press((h) => h.jump(-1));
		assert.deepEqual(editor.selected(), ['Bold sentence here.']);
		assert.equal(picker.model!.offset, 0);
		assert.equal(editor.scrollTop, 120, 'the view is back where it was');
	});

	it('returns to the cursor when changing the row while away', () => {
		const { editor, picker } = setup('sentence here');
		picker.press((h) => h.step(3));
		picker.press((h) => h.jump(1));
		assert.deepEqual(editor.selected(), ['- Next item. More text.']);
		picker.press((h) => h.step(-1));
		assert.equal(picker.model!.offset, 0);
		assert.deepEqual(editor.selected(), ['**Bold sentence here.**']);
	});

	it('Esc puts back the cursor and the view', () => {
		const { editor, picker, feedback } = setup('sentence here');
		picker.press((h) => h.step(1));
		picker.press((h) => h.jump(1));
		picker.press((h) => h.cancel('escape'), true);
		assert.deepEqual(editor.selected(), ['']);
		assert.equal(editor.scrollTop, 120);
		assert.equal(feedback.shown, null);
		assert.ok(editor.focused);
	});

	it('choosing a jumped line lets next/previous continue by lines, and reduce walks inside', () => {
		const { editor, picker, controller } = setup('sentence here');
		picker.press((h) => h.step(3));
		picker.press((h) => h.choose(null), true);
		assert.deepEqual(editor.selected(), ['- **Bold sentence here.** Second sentence.']);
		controller.selectSibling(editor.editor, 1);
		assert.deepEqual(editor.selected(), ['- Next item. More text.']);
		controller.shrink(editor.editor);
		assert.deepEqual(editor.selected(), ['Next item. More text.']);
	});

	it('choosing at the cursor lets reduce walk back down to the cursor', () => {
		const { editor, picker, controller } = setup('sentence here');
		picker.press((h) => h.choose(2), true);
		assert.deepEqual(editor.selected(), ['**Bold sentence here.**']);
		controller.shrink(editor.editor);
		assert.deepEqual(editor.selected(), ['Bold sentence here.']);
		for (let i = 0; i < 5; i++) controller.shrink(editor.editor);
		assert.deepEqual(editor.selected(), ['']);
	});

	it('closes without putting anything back when the note changed', () => {
		const { editor, picker } = setup('sentence here');
		editor.text = editor.text.replace('Last', 'Final');
		picker.press((h) => h.step(1));
		assert.equal(picker.isOpen, false);
	});

	it('maps the plugin hotkeys to the picker while it is open', () => {
		const { editor, picker, controller } = setup('sentence here');
		controller.expand(editor.editor);
		assert.equal(picker.model!.index, 1);
		controller.pick(editor.editor);
		assert.equal(picker.model!.index, 2);
		controller.shrink(editor.editor);
		assert.equal(picker.model!.index, 1);
		controller.selectSibling(editor.editor, 1);
		assert.equal(picker.model!.offset, 1);
	});
});
