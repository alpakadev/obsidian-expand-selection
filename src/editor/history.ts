import type { Editor } from 'obsidian';

/** A selection as document offsets. */
export interface OffsetSelection {
	anchor: number;
	head: number;
}

/** The selections of an editor together with the label shown for them. */
export interface Snapshot {
	selections: OffsetSelection[];
	label: string | null;
}

interface State {
	stack: Snapshot[];
	current: Snapshot;
	/** Document length when `current` was set, to notice edits. */
	length: number;
}

/**
 * Remembers expansion steps per editor so "Shrink selection" can retrace them.
 * The history is dropped as soon as the selection or the text no longer matches the last step.
 */
export class SelectionHistory {
	private readonly states = new WeakMap<Editor, State>();

	/** Records an expansion from `before` to `after`. */
	push(editor: Editor, before: OffsetSelection[], after: Snapshot, length: number): void {
		const state = this.states.get(editor);
		const continues = state !== undefined && this.isCurrent(state, before, length);
		const stack = continues ? state.stack : [];
		stack.push(continues ? state.current : { selections: before, label: null });
		this.states.set(editor, { stack, current: after, length });
	}

	/** The snapshot before the last expansion, if the editor still shows the result of that expansion. */
	pop(editor: Editor, selections: OffsetSelection[], length: number): Snapshot | null {
		const state = this.states.get(editor);
		if (!state || !this.isCurrent(state, selections, length)) return null;
		const previous = state.stack.pop();
		if (!previous) return null;
		state.current = previous;
		return previous;
	}

	/** Replaces the current selections, for example after the editor merged overlapping ones. */
	update(editor: Editor, selections: OffsetSelection[]): void {
		const state = this.states.get(editor);
		if (state) state.current = { ...state.current, selections };
	}

	/** Starts a new history at a selection that was not reached by expanding. */
	reset(editor: Editor, current: Snapshot, length: number): void {
		this.states.set(editor, { stack: [], current, length });
	}

	private isCurrent(state: State, selections: OffsetSelection[], length: number): boolean {
		const current = state.current.selections;
		return (
			state.length === length &&
			current.length === selections.length &&
			current.every((s, i) => s.anchor === selections[i]!.anchor && s.head === selections[i]!.head)
		);
	}
}
