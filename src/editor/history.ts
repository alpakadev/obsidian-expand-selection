import type { Reference } from '../core/types';

/** A selection as document offsets. */
export interface OffsetSelection {
	anchor: number;
	head: number;
}

/** The selections of an editor, the label shown for them, and what kind of unit each one is. */
export interface Snapshot {
	selections: OffsetSelection[];
	label: string | null;
	references: (Reference | null)[];
}

export function snapshotOf(selections: OffsetSelection[]): Snapshot {
	return { selections, label: null, references: selections.map(() => null) };
}

/**
 * Remembers the steps that led to the current selection, so "Shrink selection" can retrace
 * them and "next/previous" keeps the kind of unit that was selected. One history is enough,
 * since only one note is edited at a time. It no longer applies as soon as the text or the
 * selection differs from what the last command left behind.
 */
export class SelectionHistory {
	private text = '';
	private stack: Snapshot[] = [];
	private current: Snapshot | null = null;

	/** The current snapshot, if the editor still shows what the last command selected. */
	matching(text: string, selections: OffsetSelection[]): Snapshot | null {
		const current = this.current;
		if (!current || text !== this.text || current.selections.length !== selections.length) {
			return null;
		}
		const same = current.selections.every(
			(s, i) => s.anchor === selections[i]!.anchor && s.head === selections[i]!.head,
		);
		return same ? current : null;
	}

	/** Records a step from `before` to `after`; continues the history if `before` is its current state. */
	push(text: string, before: Snapshot, after: Snapshot): void {
		if (!this.matching(text, before.selections)) this.stack = [];
		this.stack.push(before);
		this.current = after;
		this.text = text;
	}

	/** Steps back, if the editor still shows the result of the last step. */
	pop(text: string, selections: OffsetSelection[]): Snapshot | null {
		if (!this.matching(text, selections)) return null;
		const previous = this.stack.pop();
		if (!previous) return null;
		this.current = previous;
		return previous;
	}

	/** Starts over at `current`, with `stack` as the steps to shrink back through. */
	reset(text: string, current: Snapshot, stack: Snapshot[] = []): void {
		this.text = text;
		this.current = current;
		this.stack = stack;
	}

	/** Replaces the current selections, for example after the editor merged overlapping ones. */
	update(selections: OffsetSelection[]): void {
		if (this.current) this.current = { ...this.current, selections };
	}
}
