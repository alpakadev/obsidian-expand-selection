import { Analysis } from '../src/core/analysis';
import {
	Direction,
	expandSelection,
	selectEnclosed,
	selectSibling,
	shrinkSelection,
} from '../src/core/operations';
import { DEFAULT_OPTIONS, Range, SelectionOptions } from '../src/core/types';

/**
 * Parses a note with the selection marked: `¦` for a cursor, or `«` and `»` around a selection.
 * Markers can be changed when the text itself contains them.
 */
export function parse(marked: string, markers = { cursor: '¦', start: '«', end: '»' }) {
	const cursor = marked.indexOf(markers.cursor);
	if (cursor >= 0) {
		const text = marked.slice(0, cursor) + marked.slice(cursor + 1);
		return { text, selection: { from: cursor, to: cursor } };
	}
	const start = marked.indexOf(markers.start);
	const end = marked.indexOf(markers.end) - 1;
	const text = marked.replace(markers.start, '').replace(markers.end, '');
	return { text, selection: { from: start, to: end } };
}

/** The texts selected by pressing "Expand selection" until the whole note is selected. */
export function expansions(marked: string, options: Partial<SelectionOptions> = {}): string[] {
	const { text, selection } = parse(marked);
	const analysis = new Analysis(text, { ...DEFAULT_OPTIONS, ...options });
	const out: string[] = [];
	let current: Range = selection;
	for (let guard = 0; guard < 50; guard++) {
		const unit = expandSelection(analysis, current);
		if (!unit) break;
		out.push(text.slice(unit.from, unit.to));
		current = unit;
	}
	return out;
}

/** Labels of the expansion steps, for checking what the status bar shows. */
export function expansionLabels(marked: string): string[] {
	const { text, selection } = parse(marked);
	const analysis = new Analysis(text, DEFAULT_OPTIONS);
	const out: string[] = [];
	let current: Range = selection;
	for (let unit = expandSelection(analysis, current); unit; unit = expandSelection(analysis, current)) {
		out.push(unit.label);
		current = unit;
	}
	return out;
}

/** Expands `times` times, then steps to siblings `steps` times in `direction`. */
export function siblings(marked: string, times: number, steps: number, direction: Direction = 1): string[] {
	const { text, selection } = parse(marked);
	const analysis = new Analysis(text, DEFAULT_OPTIONS);
	let current: Range = selection;
	for (let i = 0; i < times; i++) current = expandSelection(analysis, current) ?? current;
	const out: string[] = [];
	for (let i = 0; i < steps; i++) {
		const unit = selectSibling(analysis, current, direction);
		if (!unit) break;
		out.push(text.slice(unit.from, unit.to));
		current = unit;
	}
	return out;
}

export function enclosed(marked: string, steps: number, direction: Direction = 1): string[] {
	const { text, selection } = parse(marked);
	const analysis = new Analysis(text, DEFAULT_OPTIONS);
	let current: Range = selection;
	const out: string[] = [];
	for (let i = 0; i < steps; i++) {
		const unit = selectEnclosed(analysis, current, direction);
		if (!unit) break;
		out.push(text.slice(unit.from, unit.to));
		current = unit;
	}
	return out;
}

export function shrink(marked: string): string | null {
	const { text, selection } = parse(marked);
	const analysis = new Analysis(text, DEFAULT_OPTIONS);
	const unit = shrinkSelection(analysis, selection, selection.to);
	return unit ? text.slice(unit.from, unit.to) : null;
}
