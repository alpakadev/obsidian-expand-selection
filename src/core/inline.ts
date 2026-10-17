import {
	DELIMITER_CHARS,
	SENTENCE_CLOSERS,
	TERMINALS,
	isLowercaseLetter,
	isUppercaseLetter,
	isWhitespace,
	isWordChar,
} from './chars';
import { Pair, PairFamily, scanPairs } from './pairs';
import type { Range, SelectionOptions, Unit } from './types';

/** How a text block is read: Markdown prose, a table row, or a line of code. */
export type InlineMode = 'prose' | 'table' | 'code';

const WORD_PROSE = /[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{N}\p{M}]+)*/gu;
const WORD_CODE = /[\p{L}\p{N}\p{M}_$]+/gu;
const COMPOUND_PROSE = /[\p{L}\p{N}\p{M}]+(?:[-_./@:'’+&?=%#~]+[\p{L}\p{N}\p{M}]+)*/gu;
const COMPOUND_CODE = /[\p{L}\p{N}\p{M}_$]+(?:[-./@:#]+[\p{L}\p{N}\p{M}_$]+)*/gu;
// The first group is what comes before the tag (no lookbehind: unsupported on older iOS).
const TAG = /(^|[\s([{"'“‘„«»])(#[\p{L}\p{N}\p{M}_/-]*[\p{L}_/-][\p{L}\p{N}\p{M}_/-]*)/gu;

/** Pairs whose delimiters are dropped when they wrap a whole sentence. */
const UNWRAPPABLE: ReadonlySet<PairFamily> = new Set(['quote', 'bracket', 'emphasis', 'comment']);

/**
 * Finds all inline units of a text block.
 * @param text the block text, with line prefixes of continuation lines replaced by spaces
 * @param offset the document offset of `text`
 */
export function analyzeInline(
	text: string,
	offset: number,
	mode: InlineMode,
	options: SelectionOptions,
): Unit[] {
	const units: Unit[] = [];
	const add = (unit: Omit<Unit, 'from' | 'to'>, range: Range) => {
		units.push({ ...unit, from: range.from + offset, to: range.to + offset });
	};

	const words = new Set<string>();
	for (const range of matches(text, mode === 'code' ? WORD_CODE : WORD_PROSE)) {
		words.add(`${range.from}:${range.to}`);
		add({ kind: 'word', label: 'Word' }, range);
	}
	for (const range of matches(text, mode === 'code' ? COMPOUND_CODE : COMPOUND_PROSE)) {
		const single = words.has(`${range.from}:${range.to}`);
		add({ kind: 'compound', label: 'Compound word', navOnly: single }, range);
	}
	if (mode !== 'code') {
		for (const match of text.matchAll(TAG)) {
			const from = match.index + match[1]!.length;
			add({ kind: 'tag', label: 'Tag' }, { from, to: from + match[2]!.length });
		}
	}

	const scan = scanPairs(text, mode !== 'code');
	for (const pair of scan.pairs) {
		const inner = trim(text, { from: pair.openTo, to: pair.closeFrom });
		const name = `${pair.open}…${pair.close}`;
		add({ kind: 'pair-inner', label: pair.innerLabel ?? `Inside ${name}`, key: pair.family }, inner);
		units.push({
			kind: 'pair-outer',
			label: pair.outerLabel ?? `Including ${name}`,
			key: pair.family,
			from: pair.from + offset,
			to: pair.to + offset,
			inner: { from: inner.from + offset, to: inner.to + offset },
		});
	}
	for (const { from, to, ...link } of scan.links) add(link, { from, to });

	if (mode === 'table') {
		for (const cell of tableCells(scan.masked)) add({ kind: 'cell', label: 'Table cell' }, cell);
	} else if (mode === 'prose') {
		const m = scan.masked;
		const index = new PairIndex(scan.pairs);
		for (const segment of splitSentences(m, options.abbreviations)) {
			const sentence = stripDelimiters(m, index, segment);
			if (sentence.from >= sentence.to) continue;
			add({ kind: 'sentence', label: 'Sentence' }, sentence);
			const bare = stripTerminal(m, sentence);
			if (bare.from < bare.to) {
				const navOnly = bare.to === sentence.to;
				add({ kind: 'sentence-bare', label: 'Sentence without final punctuation', navOnly }, bare);
			}
			const parts = clauses(m, index, sentence);
			for (const part of parts) {
				add({ kind: 'clause', label: 'Part of sentence', navOnly: parts.length < 2 }, part);
			}
		}
	}
	return units;
}

function matches(text: string, pattern: RegExp): Range[] {
	const out: Range[] = [];
	pattern.lastIndex = 0;
	for (const match of text.matchAll(pattern)) {
		out.push({ from: match.index, to: match.index + match[0].length });
	}
	return out;
}

function trim(text: string, range: Range): Range {
	let { from, to } = range;
	while (from < to && isWhitespace(text[from])) from++;
	while (to > from && isWhitespace(text[to - 1])) to--;
	return { from, to };
}

/** Looks up which pair delimiters cover a position. */
class PairIndex {
	private readonly opening = new Map<number, Pair[]>();
	private readonly closing = new Map<number, Pair[]>();

	constructor(readonly pairs: readonly Pair[]) {
		for (const pair of pairs) {
			for (let i = pair.from; i < pair.openTo; i++) push(this.opening, i, pair);
			for (let i = pair.closeFrom; i < pair.to; i++) push(this.closing, i, pair);
		}
	}

	openingAt(pos: number): readonly Pair[] {
		return this.opening.get(pos) ?? [];
	}

	closingAt(pos: number): readonly Pair[] {
		return this.closing.get(pos) ?? [];
	}
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
	const list = map.get(key);
	if (list) list.push(value);
	else map.set(key, [value]);
}

/** Splits a block into raw sentence segments (whitespace and formatting still attached). */
export function splitSentences(m: string, abbreviations: ReadonlySet<string>): Range[] {
	const out: Range[] = [];
	const n = m.length;
	let start = 0;
	let i = 0;
	while (i < n) {
		if (!TERMINALS.has(m.charAt(i))) {
			i++;
			continue;
		}
		let j = i;
		while (j < n && TERMINALS.has(m.charAt(j))) j++;
		let k = j;
		while (k < n && SENTENCE_CLOSERS.has(m.charAt(k))) k++;
		if (m.startsWith('[^', k)) {
			const close = m.indexOf(']', k);
			if (close > 0 && close - k < 64) k = close + 1; // footnote reference
		}
		if (k < n && !isWhitespace(m[k])) {
			i = j;
			continue;
		}
		if (!endsSentence(m, i, j, k, abbreviations)) {
			i = k;
			continue;
		}
		out.push({ from: start, to: k });
		start = k;
		i = k;
	}
	if (start < n) out.push({ from: start, to: n });
	return out;
}

function endsSentence(
	m: string,
	i: number,
	j: number,
	k: number,
	abbreviations: ReadonlySet<string>,
): boolean {
	const run = m.slice(i, j);
	if (run === '.') {
		let w = i;
		while (w > 0 && (isWordChar(m[w - 1]) || m[w - 1] === '.')) w--;
		const word = m.slice(w, i);
		if (word && abbreviations.has(word.toLowerCase())) return false;
		if (word.length === 1 && isUppercaseLetter(word)) return false; // initials: J. R. R. Tolkien
	}
	if (run.includes('…') || run.includes('..')) {
		let next = k;
		while (next < m.length && isWhitespace(m[next])) next++;
		if (isLowercaseLetter(m[next])) return false; // “well… maybe”
	}
	return true;
}

/**
 * Trims whitespace, drops pairs that wrap the whole range, and drops delimiters
 * whose partner lies outside the range (like `**` of a bold run spanning several sentences).
 */
function stripDelimiters(m: string, index: PairIndex, range: Range): Range {
	let s = range.from;
	let e = range.to;
	for (let guard = 0; guard < 64; guard++) {
		while (s < e && isWhitespace(m[s])) s++;
		while (e > s && isWhitespace(m[e - 1])) e--;
		if (s >= e) break;
		const wrap = index
			.openingAt(s)
			.find((p) => p.from === s && p.to === e && UNWRAPPABLE.has(p.family));
		if (wrap) {
			s = wrap.openTo;
			e = wrap.closeFrom;
			continue;
		}
		let changed = false;
		if (DELIMITER_CHARS.has(m.charAt(s))) {
			const opening = index.openingAt(s);
			if (!opening.some((p) => p.to <= e)) {
				const closing = index.closingAt(s);
				if (opening.length > 0) s = Math.max(...opening.map((p) => p.openTo));
				else if (closing.length > 0) s = Math.max(...closing.map((p) => p.to));
				else s = runEnd(m, s);
				changed = true;
			}
		}
		if (s < e && DELIMITER_CHARS.has(m.charAt(e - 1))) {
			const closing = index.closingAt(e - 1);
			if (!closing.some((p) => p.from >= s)) {
				const opening = index.openingAt(e - 1);
				if (closing.length > 0) e = Math.min(...closing.map((p) => p.closeFrom));
				else if (opening.length > 0) e = Math.min(...opening.map((p) => p.from));
				else e = runStart(m, e);
				changed = true;
			}
		}
		if (!changed) break;
	}
	return { from: s, to: Math.max(s, e) };
}

function runEnd(m: string, pos: number): number {
	const c = m.charAt(pos);
	let end = pos + 1;
	while (end < m.length && m.charAt(end) === c) end++;
	return end;
}

function runStart(m: string, end: number): number {
	const c = m.charAt(end - 1);
	let start = end - 1;
	while (start > 0 && m.charAt(start - 1) === c) start--;
	return start;
}

function stripTerminal(m: string, range: Range): Range {
	let to = range.to;
	while (to > range.from && TERMINALS.has(m.charAt(to - 1))) to--;
	while (to > range.from && isWhitespace(m[to - 1])) to--;
	return { from: range.from, to };
}

/** Splits a sentence at commas, semicolons, colons and dashes that are not inside quotes or brackets. */
function clauses(m: string, index: PairIndex, sentence: Range): Range[] {
	const inside = index.pairs.filter((p) => p.from >= sentence.from && p.to <= sentence.to);
	const cuts: number[] = [];
	for (let q = sentence.from; q < sentence.to; q++) {
		const c = m.charAt(q);
		let separator = false;
		if (c === ',' || c === ';' || c === ':') {
			separator = q + 1 >= sentence.to || isWhitespace(m[q + 1]);
		} else if (c === '—') {
			separator = true;
		} else if (c === '–' || c === '-') {
			separator = isWhitespace(m[q - 1]) && isWhitespace(m[q + 1]);
		}
		if (separator && !inside.some((p) => p.openTo <= q && q < p.closeFrom)) cuts.push(q);
	}
	const parts: Range[] = [];
	let start = sentence.from;
	for (const cut of [...cuts, sentence.to]) {
		const part = stripTerminal(m, stripDelimiters(m, index, { from: start, to: cut }));
		if (part.from < part.to) parts.push(part);
		start = cut + 1;
	}
	return parts;
}

function tableCells(m: string): Range[] {
	const cells: Range[] = [];
	let start = 0;
	for (let i = 0; i <= m.length; i++) {
		if (i < m.length && m.charAt(i) !== '|') continue;
		const cell = trim(m, { from: start, to: i });
		if (cell.from < cell.to) cells.push(cell);
		start = i + 1;
	}
	return cells;
}
