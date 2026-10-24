import type { Analysis } from './analysis';
import { focusPoint, lineAround, stepsForSelection } from './operations';
import {
	INLINE_KINDS,
	KIND_PRIORITY,
	Range,
	Reference,
	Unit,
	containsRange,
	sameRange,
} from './types';

/**
 * One row of the picker: one thing, in a tight version without marks and a wide version with
 * them (the sentence without and with its final mark, bold text without and with `**`, the list
 * item without and with its bullet). Both are the same unit when the thing has no marks.
 */
export interface PickerRow {
	label: string;
	tight: Unit;
	wide: Unit;
	/** What the wide version adds, like `.`, `**…**` or `-`; null for one version. */
	marks: string | null;
}

export interface PickerRows {
	rows: PickerRow[];
	/** The row to highlight first. */
	index: number;
	/** Whether to start with marks. */
	wide: boolean;
	/** The fine-grained Expand steps, for walking back down after choosing. */
	steps: Unit[];
}

export const rowUnit = (row: PickerRow, wide: boolean): Unit => (wide ? row.wide : row.tight);

export const hasTwoVersions = (row: PickerRow): boolean => !sameRange(row.tight, row.wide);

const priority = new Map(KIND_PRIORITY.map((kind, index) => [kind, index]));
const rank = (unit: Unit) => priority.get(unit.kind) ?? KIND_PRIORITY.length;
const isBlock = (unit: Unit) => !INLINE_KINDS.has(unit.kind);

interface Thing {
	tight: Unit;
	wide: Unit;
	line?: boolean;
}

/**
 * The rows for the picker around a selection: the Expand steps grouped into things, plus the
 * whole line when the selection lies on one line. `prefer` is the kind the selection was made
 * as, if a command made it, and decides which row is highlighted when several match.
 */
export function pickerRows(
	analysis: Analysis,
	selection: Range,
	head: number,
	prefer: Reference | null = null,
): PickerRows {
	const sel = withoutTrailingBreak(analysis, selection);
	const { steps } = stepsForSelection(analysis, sel, Math.min(head, sel.to));
	const order = (unit: Range) => steps.findIndex((step) => sameRange(step, unit));
	const point = analysis.snap(focusPoint(analysis, sel, head));
	const around = analysis.unitsAround({ from: point, to: point });
	const units = around.filter((unit) => order(unit) >= 0);
	// Expand reaches a longer list item through its first line with the bullet, around the
	// item text; the item text is still the version of the list item without its bullet.
	const itemText = around.find((u) => u.kind === 'block-content' && u.key === 'list' && order(u) < 0);
	if (itemText && units.some((u) => u.kind === 'list-item' && u.to === itemText.to)) units.push(itemText);

	let things = pairUp(units);
	things = merged(things);

	const line = lineAround(analysis, sel);
	if (!line) {
		things = things.filter((thing) => thing.wide.kind !== 'line' && thing.tight.kind !== 'line');
	} else {
		things = withLine(things, line);
	}
	things = withoutCoveredBlocks(things);
	things.sort((a, b) => order(a.wide) - order(b.wide) || order(a.tight) - order(b.tight));
	if (line) {
		const lineThing = things.find((thing) => thing.line)!;
		things = things.filter((thing) => thing !== lineThing);
		let at = 0;
		things.forEach((thing, i) => {
			if (containsRange(line, thing.wide)) at = i + 1;
		});
		things.splice(at, 0, lineThing);
	}

	const text = analysis.text;
	const rows = things.map((thing) => ({
		label: thing.line ? 'Line' : rowLabel(text, thing),
		tight: thing.tight,
		wide: thing.wide,
		marks: sameRange(thing.tight, thing.wide) ? null : marksText(text, thing.tight, thing.wide),
	}));
	// A triple-click selects a whole line with its line break: open on Line.
	const lineRow = sel !== selection ? rows.findIndex((row) => row.label === 'Line' && sameRange(row.wide, sel)) : -1;
	if (lineRow >= 0) return { rows, index: lineRow, wide: true, steps };
	return { rows, ...firstHighlight(rows, sel, prefer), steps };
}

/** The other version of a unit, as the row it belongs to around itself. */
export function versionsOf(analysis: Analysis, unit: Unit): PickerRow | null {
	const { rows } = pickerRows(analysis, unit, unit.to);
	return (
		rows.find(
			(row) =>
				(sameRange(row.wide, unit) && row.wide.kind === unit.kind) ||
				(sameRange(row.tight, unit) && row.tight.kind === unit.kind),
		) ?? null
	);
}

/** What “next” and “previous” move to from a unit, like “sentence” or “line”; null for the whole note. */
export function jumpNoun(unit: Unit): string | null {
	switch (unit.kind) {
		case 'document':
			return null;
		case 'pair-inner':
			return 'text in quotes, brackets or formatting';
		case 'pair-outer':
			return 'text in quotes, brackets or formatting, with marks';
		case 'line':
			return 'line';
		case 'link':
			return unit.label === 'Image' ? 'image' : 'embed';
		default:
			return unit.label.charAt(0).toLowerCase() + unit.label.slice(1);
	}
}

/** One line of preview text, and how many lines the unit spans. */
export function rowPreview(text: string, unit: Range): { text: string; lines: number } {
	const raw = text.slice(unit.from, unit.to);
	const lines = raw.split('\n').length;
	if (lines === 1) return { text: shorten(raw.replace(/\s+/g, ' ').trim()), lines };
	const first = raw.split('\n').find((l) => l.trim() !== '') ?? '';
	const flat = first.replace(/\s+/g, ' ').trim();
	if (flat.length <= 32) return { text: flat, lines };
	return { text: `${flat.slice(0, 32).replace(/\s+\S*$/, '')}…`, lines };
}

/** Long text shortened in the middle at word breaks. */
export function shorten(flat: string): string {
	if (flat.length <= 50) return flat;
	const start = flat.slice(0, 30).replace(/\s+\S*$/, '');
	const end = flat.slice(-18).replace(/^\S*\s+/, '');
	return `${start} … ${end}`;
}

function withoutTrailingBreak(analysis: Analysis, selection: Range): Range {
	if (selection.from === selection.to) return selection;
	const structure = analysis.structure;
	const last = structure.lineAt(selection.to);
	if (last > structure.lineAt(selection.from) && structure.lines[last]!.from === selection.to) {
		return { from: selection.from, to: selection.to - 1 };
	}
	return selection;
}

/** Joins the tight and wide version of each thing. */
function pairUp(units: Unit[]): Thing[] {
	const used = new Set<Unit>();
	const things: Thing[] = [];
	const find = (test: (u: Unit) => boolean) => units.find((u) => !used.has(u) && test(u));
	for (const unit of units) {
		let wide: Unit | undefined;
		switch (unit.kind) {
			case 'sentence-bare':
				wide = find((u) => u.kind === 'sentence' && u.from === unit.from && u.to > unit.to);
				break;
			case 'pair-inner':
				wide = find((u) => u.kind === 'pair-outer' && u.key === unit.key && !!u.inner && sameRange(u.inner, unit));
				break;
			case 'block-content':
				if (unit.key === 'list') wide = find((u) => u.kind === 'list-item' && u.to === unit.to);
				if (unit.key === 'heading') wide = find((u) => u.kind === 'heading' && u.to === unit.to);
				break;
			case 'code-content':
				wide = find((u) => u.kind === 'code-block' && containsRange(u, unit));
				break;
			case 'line':
				wide = find((u) => u.kind === 'line' && u.to === unit.to && u.from < unit.from);
				break;
		}
		if (wide) {
			used.add(wide);
			things.push({ tight: unit, wide });
		}
	}
	for (const unit of units) {
		if (used.has(unit) || things.some((t) => t.tight === unit)) continue;
		things.push({ tight: unit, wide: unit });
	}
	return things;
}

/** Things with identical versions become one, named after the first kind in KIND_PRIORITY. */
function merged(things: Thing[]): Thing[] {
	const out: Thing[] = [];
	for (const thing of things) {
		const same = out.findIndex((t) => sameRange(t.tight, thing.tight) && sameRange(t.wide, thing.wide));
		if (same < 0) out.push(thing);
		else if (rank(thing.wide) < rank(out[same]!.wide)) out[same] = thing;
	}
	return out;
}

/** Adds the Line row; block-level things that are exactly the line become part of it. */
function withLine(things: Thing[], line: Unit): Thing[] {
	const absorbed = things.filter((t) => isBlock(t.wide) && sameRange(t.wide, line));
	const twoVersions = absorbed.filter((t) => !sameRange(t.tight, t.wide));
	const keep = twoVersions.slice(1);
	let tight: Unit = line;
	if (twoVersions[0]) tight = twoVersions[0].tight;
	else {
		const inner = things.find((t) => t.wide.kind === 'line' && containsRange(line, t.wide) && !sameRange(line, t.wide));
		// An indented line with two versions (without and with its bullet) keeps a row of its own.
		if (inner && sameRange(inner.tight, inner.wide)) {
			tight = inner.wide;
			absorbed.push(inner);
		}
	}
	const rest = things.filter((t) => !absorbed.includes(t) || keep.includes(t));
	return [...rest, { tight, wide: line, line: true }];
}

/** Drops block-level things with one version that select the same text as another row. */
function withoutCoveredBlocks(things: Thing[]): Thing[] {
	return things.filter((thing) => {
		if (!isBlock(thing.wide) || thing.line || !sameRange(thing.tight, thing.wide)) return true;
		return !things.some(
			(other) =>
				other !== thing &&
				sameRange(other.wide, thing.wide) &&
				(!sameRange(other.tight, other.wide) || other.line || rank(other.wide) < rank(thing.wide)),
		);
	});
}

function firstHighlight(
	rows: PickerRow[],
	selection: Range,
	prefer: Reference | null,
): { index: number; wide: boolean } {
	if (rows.length === 0 || selection.from === selection.to) return { index: 0, wide: true };
	const matches = (unit: Unit) => sameRange(unit, selection) && (!prefer || unit.kind === prefer.kind);
	if (prefer) {
		const index = rows.findIndex((row) => matches(row.wide) || matches(row.tight));
		if (index >= 0) return { index, wide: matches(rows[index]!.wide) };
	}
	const wide = rows.findIndex((row) => sameRange(row.wide, selection));
	if (wide >= 0) return { index: wide, wide: true };
	const tight = rows.findIndex((row) => sameRange(row.tight, selection));
	if (tight >= 0) return { index: tight, wide: false };
	const around = rows.findIndex((row) => containsRange(row.wide, selection));
	return { index: Math.max(0, around), wide: true };
}

const PAIR_NAMES: [RegExp, string][] = [
	[/^(\*\*\*|___)$/, 'Bold italic'],
	[/^(\*\*|__)$/, 'Bold'],
	[/^[*_]$/, 'Italic'],
	[/^~~$/, 'Strikethrough'],
	[/^==$/, 'Highlight'],
	[/^%%$/, 'Comment'],
	[/^`+$/, 'Code'],
	[/^\$\$?$/, 'Math'],
	[/^!?\[\[$/, 'Link'],
	[/^["'“”„‘’‚«»‹›「『]$/, 'Quote'],
	[/^[([{（【]$/, 'Brackets'],
];

function rowLabel(text: string, thing: Thing): string {
	const unit = thing.wide;
	switch (unit.kind) {
		case 'word':
			return 'Word';
		case 'compound':
			return 'Compound word';
		case 'tag':
			return 'Tag';
		case 'clause':
			return 'Part of sentence';
		case 'sentence':
		case 'sentence-bare':
			return 'Sentence';
		case 'cell':
			return 'Table cell';
		case 'pair-outer':
		case 'pair-inner': {
			if (unit.label === 'Link') return 'Link';
			const open = unit.inner ? text.slice(unit.from, unit.inner.from).trim() : '';
			return PAIR_NAMES.find(([pattern]) => pattern.test(open))?.[1] ?? (open ? `${open}…` : 'Text');
		}
		case 'link':
			return unit.label === 'Image' ? 'Image' : 'Embed';
		case 'link-part':
			return unit.label;
		case 'block-content':
			if (unit.key === 'list') return 'List item';
			if (unit.key === 'heading') return 'Heading';
			return 'Paragraph';
		case 'list-item':
			return 'List item';
		case 'heading':
			return 'Heading';
		case 'code-content':
			return unit.label === 'Properties' ? 'Properties' : 'Code';
		case 'code-block':
			return unit.label.startsWith('Properties') ? 'Properties' : 'Code block';
		case 'line':
			// An indented first line of a list item without and with its bullet, apart from the whole line.
			return sameRange(thing.tight, thing.wide) ? 'Line' : unit.label;
		default:
			return unit.label;
	}
}

/** The marks the wide version adds around the tight one, like `.`, `**…**`, `-` or `##`. */
function marksText(text: string, tight: Range, wide: Range): string {
	const side = (s: string) => (s.length > 6 ? `${s.slice(0, 5)}…` : s);
	const left = text.slice(wide.from, tight.from).trim();
	let right = text.slice(tight.to, wide.to).trim();
	if (right.startsWith('](')) right = '](…)';
	if (left && right) return `${side(left)}…${side(right)}`;
	if (left || right) return side(left || right);
	return '⇥';
}
