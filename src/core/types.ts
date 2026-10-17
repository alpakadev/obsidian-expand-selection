/** A half-open range of document offsets. */
export interface Range {
	from: number;
	to: number;
}

export type UnitKind =
	| 'word'
	| 'compound'
	| 'tag'
	| 'sentence-bare'
	| 'sentence'
	| 'clause'
	| 'cell'
	| 'pair-inner'
	| 'pair-outer'
	| 'link'
	| 'line'
	| 'block-content'
	| 'list-item'
	| 'list-subtree'
	| 'list'
	| 'heading'
	| 'table-row'
	| 'table'
	| 'quote'
	| 'code-content'
	| 'code-block'
	| 'section'
	| 'document';

/** A selectable piece of text, such as a word, a sentence or a list item. */
export interface Unit extends Range {
	kind: UnitKind;
	label: string;
	/** Narrows "same kind" for next/previous: pair family, list depth, heading level, block type. */
	key?: string;
	/** Only used to step to the next/previous unit, never offered as an expansion step. */
	navOnly?: boolean;
	/** For pairs: the range between the delimiters. */
	inner?: Range;
}

/**
 * When two units cover exactly the same text, the one listed first wins.
 * This decides the label that is shown and what "same kind" means.
 */
export const KIND_PRIORITY: readonly UnitKind[] = [
	'word',
	'compound',
	'tag',
	'sentence-bare',
	'sentence',
	'clause',
	'cell',
	'pair-outer',
	'pair-inner',
	'link',
	'line',
	'block-content',
	'list-item',
	'list-subtree',
	'list',
	'heading',
	'table-row',
	'table',
	'quote',
	'code-content',
	'code-block',
	'section',
	'document',
];

/** Kinds that are found inside a single text block (paragraph, list item, heading, ...). */
export const INLINE_KINDS: ReadonlySet<UnitKind> = new Set<UnitKind>([
	'word',
	'compound',
	'tag',
	'sentence-bare',
	'sentence',
	'clause',
	'cell',
	'pair-inner',
	'pair-outer',
	'link',
]);

export interface SelectionOptions {
	/** Stop at hyphenated words, file names and URLs after the plain word. */
	compoundWords: boolean;
	/** Stop at parts of a sentence separated by commas, semicolons, colons or dashes. */
	clauses: boolean;
	/** Stop at a sentence without its final punctuation before the full sentence. */
	sentenceWithoutPunctuation: boolean;
	/** Stop at a single line inside a paragraph that spans several lines. */
	lines: boolean;
	/** Stop at heading sections before the whole note. */
	sections: boolean;
	/** Lowercase words without the trailing period that do not end a sentence. */
	abbreviations: ReadonlySet<string>;
}

export const DEFAULT_ABBREVIATIONS = [
	'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Sr.', 'Jr.', 'St.', 'vs.',
	'e.g.', 'i.e.', 'cf.', 'approx.', 'fig.', 'vol.', 'al.', 'ca.',
	'z.B.', 'd.h.', 'u.a.', 'bzw.', 'vgl.', 'ggf.', 'evtl.', 'inkl.',
	'sog.', 'bspw.', 'Nr.', 'Abs.', 'Hr.', 'Fr.', 'o.ä.', 'u.U.', 'z.T.',
].join(' ');

export function parseAbbreviations(text: string): Set<string> {
	const result = new Set<string>();
	for (const part of text.split(/[\s,;]+/)) {
		const word = part.replace(/\.+$/, '').toLowerCase();
		if (word) result.add(word);
	}
	return result;
}

export const DEFAULT_OPTIONS: SelectionOptions = {
	compoundWords: true,
	clauses: true,
	sentenceWithoutPunctuation: true,
	lines: true,
	sections: true,
	abbreviations: parseAbbreviations(DEFAULT_ABBREVIATIONS),
};

export function rangeLength(range: Range): number {
	return range.to - range.from;
}

export function containsRange(outer: Range, inner: Range): boolean {
	return outer.from <= inner.from && inner.to <= outer.to;
}

export function sameRange(a: Range, b: Range): boolean {
	return a.from === b.from && a.to === b.to;
}
