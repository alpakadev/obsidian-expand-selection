import { InlineMode, analyzeInline } from './inline';
import { Structure, TextBlock } from './structure';
import {
	KIND_PRIORITY,
	Range,
	SelectionOptions,
	Unit,
	containsRange,
	rangeLength,
	sameRange,
} from './types';

/** Everything known about one version of a note. Create a new one whenever the text changes. */
export class Analysis {
	readonly structure: Structure;
	private readonly inlineCache = new Map<number, Unit[]>();

	constructor(
		readonly text: string,
		readonly options: SelectionOptions,
	) {
		this.structure = new Structure(text);
	}

	/** All units inside a text block, including navigation-only ones. */
	inlineUnits(block: TextBlock): Unit[] {
		let units = this.inlineCache.get(block.index);
		if (!units) {
			let mode: InlineMode = 'prose';
			if (block.type === 'code') mode = 'code';
			else if (block.type === 'table') mode = 'table';
			units = analyzeInline(this.structure.blockText(block), block.from, mode, this.options);
			this.inlineCache.set(block.index, units);
		}
		return units;
	}

	/** Whether a unit is offered as an expansion step with the current settings. */
	isStep(unit: Unit): boolean {
		if (unit.navOnly) return false;
		switch (unit.kind) {
			case 'compound':
				return this.options.compoundWords;
			case 'clause':
				return this.options.clauses;
			case 'sentence-bare':
				return this.options.sentenceWithoutPunctuation;
			case 'line':
				return this.options.lines;
			case 'section':
				return this.options.sections;
			default:
				return true;
		}
	}

	/** Expansion steps that contain `range`, smallest first, one unit per distinct range. */
	stepsAround(range: Range): Unit[] {
		const structure = this.structure;
		const lineIndex = structure.lineAt(range.from);
		const units: Unit[] = [];
		const block = structure.blockAt(lineIndex);
		if (block) units.push(...this.inlineUnits(block));
		units.push(...structure.containers(lineIndex));
		return dedupe(units.filter((unit) => this.isStep(unit) && containsRange(unit, range)));
	}

	/** Moves an empty cursor that sits in a line prefix or trailing whitespace onto the text. */
	snap(offset: number): number {
		const line = this.structure.lines[this.structure.lineAt(offset)]!;
		if (line.kind === 'blank') return offset;
		return Math.min(Math.max(offset, line.contentFrom), line.contentTo);
	}
}

const priority = new Map(KIND_PRIORITY.map((kind, index) => [kind, index]));

function dedupe(units: Unit[]): Unit[] {
	units.sort(
		(a, b) =>
			rangeLength(a) - rangeLength(b) ||
			a.from - b.from ||
			(priority.get(a.kind) ?? 0) - (priority.get(b.kind) ?? 0),
	);
	const out: Unit[] = [];
	for (const unit of units) {
		const last = out[out.length - 1];
		if (!last || !sameRange(last, unit)) out.push(unit);
	}
	return out;
}
