import { DEFAULT_ABBREVIATIONS, abbreviationSet } from './abbreviations';

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
	| 'link-part'
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

/** Identifies a kind of unit, for "select the next one of these". */
export interface Reference {
	kind: UnitKind;
	key?: string;
}

/**
 * When two units cover exactly the same text, the one listed first wins.
 * This decides the label that is shown and what "same kind" means.
 * Visible markup (formatting, quotes, links) wins over sentences: a bold sentence
 * is treated as bold text, so "next" goes to the next bold or quoted text.
 */
export const KIND_PRIORITY: readonly UnitKind[] = [
	'word',
	'link-part',
	'compound',
	'tag',
	'pair-outer',
	'pair-inner',
	'link',
	'sentence-bare',
	'sentence',
	'clause',
	'cell',
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
	'link-part',
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

export const DEFAULT_OPTIONS: SelectionOptions = {
	compoundWords: true,
	clauses: true,
	sentenceWithoutPunctuation: true,
	lines: true,
	sections: true,
	abbreviations: abbreviationSet(DEFAULT_ABBREVIATIONS),
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
