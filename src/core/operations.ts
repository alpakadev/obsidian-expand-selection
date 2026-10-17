import type { Analysis } from './analysis';
import { isWordChar } from './chars';
import type { TextBlock } from './structure';
import {
	INLINE_KINDS,
	Range,
	Reference,
	Unit,
	containsRange,
	rangeLength,
	sameRange,
} from './types';

export type Direction = 1 | -1;

/** The next larger unit around a selection, or null when the whole note is selected. */
export function expandSelection(analysis: Analysis, selection: Range): Unit | null {
	const empty = selection.from === selection.to;
	const probe = empty
		? { from: analysis.snap(selection.from), to: analysis.snap(selection.from) }
		: selection;
	const length = rangeLength(selection);
	return analysis.stepsAround(probe).find((unit) => rangeLength(unit) > length) ?? null;
}

/** All expansion steps from a cursor position outward, smallest first. */
export function ladder(analysis: Analysis, point: number): Unit[] {
	const snapped = analysis.snap(point);
	let current: Range = { from: snapped, to: snapped };
	const steps: Unit[] = [];
	for (const unit of analysis.stepsAround(current)) {
		if (rangeLength(unit) > rangeLength(current) && containsRange(unit, current)) {
			steps.push(unit);
			current = unit;
		}
	}
	return steps;
}

/**
 * The position a selection's steps are built around: the last letter on the cursor side,
 * so that `**Bold.**` selected from left to right is treated like a cursor in “Bold”.
 */
export function focusPoint(analysis: Analysis, selection: Range, head: number): number {
	const text = analysis.text;
	if (selection.from === selection.to) return selection.from;
	if (head <= selection.from) {
		for (let i = selection.from; i < selection.to; i++) if (isWordChar(text[i])) return i;
		return selection.from;
	}
	for (let i = selection.to - 1; i >= selection.from; i--) if (isWordChar(text[i])) return i;
	return selection.to - 1;
}

/**
 * The steps around a selection and which of them is selected now.
 * When the selection is not a step itself, `index` points at the next larger step.
 */
export function stepsForSelection(
	analysis: Analysis,
	selection: Range,
	head: number,
): { steps: Unit[]; index: number } {
	const steps = ladder(analysis, focusPoint(analysis, selection, head));
	if (selection.from === selection.to) return { steps, index: 0 };
	const exact = steps.findIndex((unit) => sameRange(unit, selection));
	if (exact >= 0) return { steps, index: exact };
	const length = rangeLength(selection);
	const smaller = steps.filter((u) => containsRange(selection, u) && rangeLength(u) < length);
	const larger = steps.filter((u) => containsRange(u, selection) && rangeLength(u) > length);
	return { steps: [...smaller, ...larger], index: Math.min(smaller.length, smaller.length + larger.length - 1) };
}

/**
 * One step smaller than the selection: the step below it when it is a step itself,
 * otherwise the largest step inside it, around the cursor end.
 */
export function shrinkSelection(analysis: Analysis, selection: Range, head: number): Unit | null {
	if (selection.from === selection.to) return null;
	const steps = ladder(analysis, focusPoint(analysis, selection, head));
	const exact = steps.findIndex((unit) => sameRange(unit, selection));
	if (exact >= 0) return steps[exact - 1] ?? null;
	const length = rangeLength(selection);
	const inside = steps.filter((u) => containsRange(selection, u) && rangeLength(u) < length);
	return inside[inside.length - 1] ?? null;
}

/** What kind of unit a selection is, for "next/previous of the same kind". */
export function referenceOf(analysis: Analysis, selection: Range): Reference | null {
	if (selection.from === selection.to) return { kind: 'word' };
	const steps = analysis.stepsAround(selection);
	const unit =
		steps.find((u) => sameRange(u, selection)) ??
		steps.find((u) => rangeLength(u) > rangeLength(selection));
	return unit ? { kind: unit.kind, key: unit.key } : null;
}

/**
 * The next or previous unit of the same kind as the selection: word → next word,
 * sentence → next sentence, list item → next list item. Text inside quotes, brackets or
 * formatting goes to the next such text, with or without the marks as before.
 * `reference` says what kind the selection is; it is worked out from the text when missing.
 */
export function selectSibling(
	analysis: Analysis,
	selection: Range,
	direction: Direction,
	reference: Reference | null = referenceOf(analysis, selection),
): Unit | null {
	if (!reference || reference.kind === 'document') return null;
	const { kind, key } = reference;
	if (kind === 'pair-inner' || kind === 'pair-outer') {
		return nextPair(analysis, selection, direction, kind === 'pair-outer');
	}
	const matches = (unit: Unit) =>
		unit.kind === kind &&
		(key === undefined || unit.key === key) &&
		!sameRange(unit, selection) &&
		(direction > 0 ? unit.from >= selection.to : unit.to <= selection.from);

	if (INLINE_KINDS.has(kind)) {
		const skipHeadings = kind.startsWith('sentence') || kind === 'clause';
		return searchBlocks(analysis, selection, direction, (block) =>
			skipHeadings && block.type === 'heading' ? [] : analysis.inlineUnits(block).filter(matches),
		);
	}
	if (kind === 'section') {
		return closest(analysis.structure.allSections().filter(matches), direction);
	}
	const lines = analysis.structure.lines;
	const start = analysis.structure.lineAt(direction > 0 ? selection.to : selection.from);
	for (let i = start; i >= 0 && i < lines.length; i += direction) {
		if (lines[i]!.kind === 'blank') continue;
		const found = closest(analysis.structure.containers(i, kind).filter(matches), direction);
		if (found) return found;
	}
	return null;
}

/**
 * The text inside the next or previous pair of quotes, brackets or formatting marks.
 * Pairs nested without a gap, like `*“…”*`, resolve to the innermost text.
 */
export function selectEnclosed(
	analysis: Analysis,
	selection: Range,
	direction: Direction,
): Unit | null {
	return nextPair(analysis, selection, direction, false);
}

/** The next pair of any kind: its inner text (innermost), or the whole pair with marks (outermost). */
function nextPair(
	analysis: Analysis,
	selection: Range,
	direction: Direction,
	outer: boolean,
): Unit | null {
	return searchBlocks(analysis, selection, direction, (block) => {
		const units = analysis.inlineUnits(block);
		const pairs = units.filter(
			(unit) =>
				unit.kind === 'pair-outer' &&
				unit.inner !== undefined &&
				(outer || unit.inner.from < unit.inner.to) &&
				!sameRange(unit, selection) &&
				(direction > 0 ? unit.from >= selection.to : unit.to <= selection.from),
		);
		let best: Unit | null = closest(pairs, direction, true);
		if (!best || outer) return best ? [best] : [];
		while (best) {
			const inner: Range = best.inner!;
			const nested: Unit | undefined = pairs.find((unit) => sameRange(unit, inner));
			if (!nested) break;
			best = nested;
		}
		const { key, inner } = best;
		const unit = units.find(
			(u) => u.kind === 'pair-inner' && u.key === key && inner !== undefined && sameRange(u, inner),
		);
		return unit ? [unit] : [];
	});
}

function searchBlocks(
	analysis: Analysis,
	selection: Range,
	direction: Direction,
	candidates: (block: TextBlock) => Unit[],
): Unit | null {
	const blocks = analysis.structure.blocks;
	const start = analysis.structure.blockIndexNear(
		direction > 0 ? selection.to : selection.from,
		direction,
	);
	for (let b = start; b >= 0 && b < blocks.length; b += direction) {
		const found = closest(candidates(blocks[b]!), direction);
		if (found) return found;
	}
	return null;
}

/** The unit nearest to the starting point; ties go to the smaller unit unless `outermost` is set. */
function closest(units: Unit[], direction: Direction, outermost = false): Unit | null {
	let best: Unit | null = null;
	for (const unit of units) {
		if (!best) {
			best = unit;
			continue;
		}
		const distance = direction > 0 ? unit.from - best.from : best.to - unit.to;
		const better = outermost
			? rangeLength(unit) > rangeLength(best)
			: rangeLength(unit) < rangeLength(best);
		if (distance < 0 || (distance === 0 && better)) best = unit;
	}
	return best;
}
