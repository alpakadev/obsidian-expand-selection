import type { Analysis } from './analysis';
import type { TextBlock } from './structure';
import {
	INLINE_KINDS,
	Range,
	Unit,
	UnitKind,
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

/**
 * The largest unit inside a selection, found around the cursor end of the selection.
 * Used when there is no expansion history to step back through.
 */
export function shrinkSelection(analysis: Analysis, selection: Range, head: number): Unit | null {
	const length = rangeLength(selection);
	if (length === 0) return null;
	const point = head >= selection.to ? selection.to - 1 : head;
	const inside = analysis
		.stepsAround({ from: point, to: point })
		.filter(
			(unit) =>
				containsRange(selection, unit) && rangeLength(unit) < length && rangeLength(unit) > 0,
		);
	return inside[inside.length - 1] ?? null;
}

/**
 * The next or previous unit of the same kind as the selection: word → next word,
 * sentence → next sentence, text in quotes → next text in quotes, list item → next list item.
 * An empty selection steps by words.
 */
export function selectSibling(
	analysis: Analysis,
	selection: Range,
	direction: Direction,
): Unit | null {
	let kind: UnitKind = 'word';
	let key: string | undefined;
	if (selection.from !== selection.to) {
		const steps = analysis.stepsAround(selection);
		const reference =
			steps.find((unit) => sameRange(unit, selection)) ??
			steps.find((unit) => rangeLength(unit) > rangeLength(selection));
		if (!reference || reference.kind === 'document') return null;
		kind = reference.kind;
		key = reference.key;
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
	return searchBlocks(analysis, selection, direction, (block) => {
		const units = analysis.inlineUnits(block);
		const outers = units.filter(
			(unit) =>
				unit.kind === 'pair-outer' &&
				unit.inner !== undefined &&
				unit.inner.from < unit.inner.to &&
				(direction > 0 ? unit.from >= selection.to : unit.to <= selection.from),
		);
		let best: Unit | null = closest(outers, direction, true);
		while (best) {
			const inner: Range = best.inner!;
			const nested: Unit | undefined = outers.find((unit) => sameRange(unit, inner));
			if (!nested) break;
			best = nested;
		}
		if (!best) return [];
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
