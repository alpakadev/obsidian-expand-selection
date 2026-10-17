import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import type { Editor } from 'obsidian';
import { OffsetSelection, editorView, toRange } from './selections';

/**
 * While the picker is open the editor does not have the focus, so CodeMirror draws the
 * selection faintly and hides the cursor. This draws the previewed selection and its cursor
 * itself, the same whether the editor has the focus or not.
 */
const setPreview = StateEffect.define<OffsetSelection | null>();

class Caret extends WidgetType {
	eq(): boolean {
		return true;
	}
	toDOM(): HTMLElement {
		return createSpan({ cls: 'smart-select-preview-caret' });
	}
}

const previewField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(marks, tr) {
		let next = marks.map(tr.changes);
		for (const effect of tr.effects) {
			if (!effect.is(setPreview)) continue;
			next = Decoration.none;
			const selection = effect.value;
			if (!selection) continue;
			const { from, to } = toRange(selection);
			const length = tr.state.doc.length;
			if (from < 0 || to > length) continue;
			const builder = new RangeSetBuilder<Decoration>();
			const caret = Decoration.widget({ widget: new Caret(), side: selection.head === from ? -1 : 1 });
			if (selection.head === from) builder.add(from, from, caret);
			if (from < to) builder.add(from, to, Decoration.mark({ class: 'smart-select-preview' }));
			if (selection.head !== from) builder.add(to, to, caret);
			next = builder.finish();
		}
		return next;
	},
	provide: (field) => EditorView.decorations.from(field),
});

export const previewExtension = previewField;

/** Shows `selection` as the previewed selection, or removes the preview when null. */
export function markPreview(editor: Editor, selection: OffsetSelection | null): void {
	const view = editorView(editor);
	if (!view || view.state.field(previewField, false) === undefined) return;
	view.dispatch({ effects: setPreview.of(selection) });
}
