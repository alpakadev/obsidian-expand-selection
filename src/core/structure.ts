import { Line, parseLines } from './lines';
import { ListNode, buildListTree } from './lists';
import type { Unit, UnitKind } from './types';

export type BlockType = 'paragraph' | 'list' | 'heading' | 'table' | 'code';

/** A run of text that is read as one unit for words, sentences and pairs. */
export interface TextBlock {
	index: number;
	type: BlockType;
	firstLine: number;
	lastLine: number;
	from: number;
	to: number;
}

/** The block structure of a Markdown note: lines, lists, headings, code blocks, quotes. */
export class Structure {
	readonly lines: Line[];
	readonly blocks: TextBlock[] = [];
	private readonly blockOfLine: number[];
	private readonly owner: (ListNode | null)[];
	private readonly headings: number[] = [];
	private readonly sectionEnd = new Map<number, number>();

	constructor(readonly text: string) {
		this.lines = parseLines(text);
		this.owner = buildListTree(this.lines);
		this.blockOfLine = this.lines.map(() => -1);
		this.buildBlocks();
		this.buildSections();
	}

	lineAt(offset: number): number {
		let lo = 0;
		let hi = this.lines.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (this.lines[mid]!.from <= offset) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	}

	blockAt(lineIndex: number): TextBlock | null {
		return this.blocks[this.blockOfLine[lineIndex] ?? -1] ?? null;
	}

	/** Index of the first block ending at or after `offset` (forward) or the last block starting at or before it (backward). */
	blockIndexNear(offset: number, direction: 1 | -1): number {
		if (direction > 0) {
			const index = this.blocks.findIndex((block) => block.to >= offset);
			return index < 0 ? this.blocks.length : index;
		}
		for (let i = this.blocks.length - 1; i >= 0; i--) {
			if (this.blocks[i]!.from <= offset) return i;
		}
		return -1;
	}

	/** The block's text with the prefixes of continuation lines (`>` markers, indentation) blanked out. */
	blockText(block: TextBlock): string {
		const chars = this.text.slice(block.from, block.to).split('');
		for (let j = block.firstLine + 1; j <= block.lastLine; j++) {
			const line = this.lines[j]!;
			for (let k = line.from; k < line.textFrom; k++) chars[k - block.from] = ' ';
		}
		return chars.join('');
	}

	/** Units larger than a text block that contain the given line. `want` limits the result to one kind. */
	containers(lineIndex: number, want?: UnitKind): Unit[] {
		const wants = (kind: UnitKind) => want === undefined || want === kind;
		const lines = this.lines;
		const line = lines[lineIndex]!;
		if (line.kind === 'blank') {
			// Blank lines only belong to larger structures; take those of the line above.
			let above = lineIndex - 1;
			while (above >= 0 && lines[above]!.kind === 'blank') above--;
			if (above >= 0) return this.containers(above, want);
			return wants('document') ? [this.documentUnit()] : [];
		}

		const out: Unit[] = [];
		const add = (unit: Unit) => {
			if (wants(unit.kind)) out.push(unit);
		};
		const block = this.blockAt(lineIndex);
		if (block) {
			const lineUnit: Unit = {
				kind: 'line',
				label: block.type === 'code' ? 'Line of code' : 'Line',
				from: lineIndex === block.firstLine ? block.from : line.textFrom,
				to: line.contentTo,
				navOnly: block.type !== 'code' && block.firstLine === block.lastLine,
			};
			const content = (key: string, label: string): Unit => ({
				kind: 'block-content',
				key,
				label,
				from: block.from,
				to: block.to,
			});
			switch (block.type) {
				case 'paragraph':
					add(lineUnit);
					add(content('paragraph', 'Paragraph'));
					break;
				case 'list': {
					const node = this.owner[block.firstLine]!;
					add(lineUnit);
					add(content('list', 'List item text'));
					add({ kind: 'list-item', label: 'List item', from: node.markerFrom, to: block.to });
					break;
				}
				case 'heading':
					add(content('heading', 'Heading text'));
					add({
						kind: 'heading',
						key: String(line.headingLevel),
						label: 'Heading',
						from: line.textFrom,
						to: line.contentTo,
					});
					break;
				case 'table': {
					const [first, last] = this.extent(
						lineIndex,
						(l) => l.kind === 'table' && l.quoteDepth === line.quoteDepth,
					);
					add({ kind: 'table-row', label: 'Table row', from: line.textFrom, to: line.contentTo });
					add({
						kind: 'table',
						label: 'Table',
						from: lines[first]!.textFrom,
						to: lines[last]!.contentTo,
					});
					break;
				}
				case 'code':
					add(lineUnit);
					break;
			}
		}

		if (line.fenceOpen >= 0) this.fenceUnits(line, add);

		const node = this.owner[lineIndex];
		for (let n = node; n && (wants('list-subtree') || wants('list')); n = n.parent) {
			add({
				kind: 'list-subtree',
				key: String(n.depth),
				label: 'List item with sub-items',
				from: n.markerFrom,
				to: lines[n.lastLine]!.contentTo,
			});
			const last = n.siblings[n.siblings.length - 1]!;
			add({
				kind: 'list',
				key: String(n.depth),
				label: n.depth > 0 ? 'Nested list' : 'List',
				from: n.siblings[0]!.markerFrom,
				to: lines[last.lastLine]!.contentTo,
			});
		}

		if (line.quoteDepth > 0 && wants('quote')) {
			const [first, last] = this.extent(lineIndex, (l) => l.quoteDepth > 0);
			const start = lines[first]!;
			add({
				kind: 'quote',
				label: this.isCalloutTitle(start) ? 'Callout' : 'Blockquote',
				from: start.quoteFrom,
				to: lines[last]!.contentTo,
			});
		}

		if (wants('section')) {
			for (const heading of this.sectionsAt(lineIndex)) out.push(this.sectionUnit(heading));
		}
		if (wants('document')) out.push(this.documentUnit());
		return out;
	}

	/** Every heading section of the note, in document order. */
	allSections(): Unit[] {
		return this.headings.map((heading) => this.sectionUnit(heading));
	}

	private fenceUnits(line: Line, add: (unit: Unit) => void): void {
		const lines = this.lines;
		const open = line.fenceOpen;
		let close = open;
		while (close + 1 < lines.length && lines[close + 1]!.fenceOpen === open) {
			close++;
			if (lines[close]!.kind === 'fence') break;
		}
		const closed = close > open && lines[close]!.kind === 'fence';
		const lastCode = closed ? close - 1 : close;
		const properties = line.frontmatter;
		if (lastCode > open) {
			const first = lines[open + 1]!;
			add({
				kind: 'code-content',
				label: properties ? 'Properties' : 'Code',
				from: first.quoteDepth > 0 ? first.textFrom : first.from,
				to: lines[lastCode]!.to,
			});
		}
		add({
			kind: 'code-block',
			label: properties ? 'Properties with separators' : 'Code block',
			from: lines[open]!.textFrom,
			to: lines[close]!.contentTo,
		});
	}

	private sectionUnit(heading: number): Unit {
		const line = this.lines[heading]!;
		const end = this.sectionEnd.get(heading) ?? heading;
		return {
			kind: 'section',
			key: String(line.headingLevel),
			label: `Section (${'#'.repeat(line.headingLevel)})`,
			from: line.textFrom,
			to: this.lines[end]!.contentTo,
		};
	}

	private documentUnit(): Unit {
		return { kind: 'document', label: 'Whole note', from: 0, to: this.text.length };
	}

	/** Heading lines of the sections containing a line, innermost first. */
	private sectionsAt(lineIndex: number): number[] {
		const result: number[] = [];
		let level = 7;
		for (let k = this.headings.length - 1; k >= 0 && level > 1; k--) {
			const heading = this.headings[k]!;
			if (heading > lineIndex) continue;
			const headingLevel = this.lines[heading]!.headingLevel;
			if (headingLevel < level) {
				result.push(heading);
				level = headingLevel;
			}
		}
		return result;
	}

	private isCalloutTitle(line: Line): boolean {
		return line.quoteDepth > 0 && this.text.startsWith('[!', line.textFrom);
	}

	private extent(lineIndex: number, test: (line: Line) => boolean): [number, number] {
		let first = lineIndex;
		let last = lineIndex;
		while (first > 0 && test(this.lines[first - 1]!)) first--;
		while (last + 1 < this.lines.length && test(this.lines[last + 1]!)) last++;
		return [first, last];
	}

	private buildBlocks(): void {
		const lines = this.lines;
		for (let i = 0; i < lines.length; i++) {
			if (this.blockOfLine[i]! >= 0) continue;
			const line = lines[i]!;
			let type: BlockType | null = null;
			let last = i;
			switch (line.kind) {
				case 'heading':
					type = 'heading';
					break;
				case 'table':
					type = 'table';
					break;
				case 'fence':
				case 'code':
					if (line.textFrom < line.contentTo) type = 'code';
					break;
				case 'list':
					type = 'list';
					last = this.owner[i]!.textEndLine;
					break;
				case 'text':
					type = 'paragraph';
					// A callout title (`> [!note] Title`) stands on its own.
					while (last + 1 < lines.length && !this.isCalloutTitle(line)) {
						const next = lines[last + 1]!;
						if (
							next.kind !== 'text' ||
							next.quoteDepth !== line.quoteDepth ||
							this.owner[last + 1] !== this.owner[i] ||
							this.isCalloutTitle(next)
						) {
							break;
						}
						last++;
					}
					break;
			}
			if (!type) continue;
			const block: TextBlock = {
				index: this.blocks.length,
				type,
				firstLine: i,
				lastLine: last,
				from: line.contentFrom,
				to: lines[last]!.contentTo,
			};
			this.blocks.push(block);
			for (let j = i; j <= last; j++) this.blockOfLine[j] = block.index;
		}
	}

	private buildSections(): void {
		const open: number[] = [];
		const close = (before: number, level: number) => {
			while (open.length > 0 && this.lines[open[open.length - 1]!]!.headingLevel >= level) {
				const heading = open.pop()!;
				let end = before - 1;
				while (end > heading && this.lines[end]!.kind === 'blank') end--;
				this.sectionEnd.set(heading, end);
			}
		};
		for (const line of this.lines) {
			if (line.kind !== 'heading' || line.quoteDepth > 0) continue;
			close(line.index, line.headingLevel);
			open.push(line.index);
			this.headings.push(line.index);
		}
		close(this.lines.length, 0);
	}
}
