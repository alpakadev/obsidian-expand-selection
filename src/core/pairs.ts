import { isPunctuation, isWhitespace, isWordChar } from './chars';

export type PairFamily =
	| 'quote'
	| 'bracket'
	| 'emphasis'
	| 'code'
	| 'math'
	| 'link'
	| 'comment';

/** Matching delimiters like `“…”`, `(…)` or `**…**`. Offsets are relative to the scanned text. */
export interface Pair {
	from: number;
	openTo: number;
	closeFrom: number;
	to: number;
	open: string;
	close: string;
	family: PairFamily;
	/** Labels for pairs whose delimiters make poor names, like Markdown links. */
	innerLabel?: string;
	outerLabel?: string;
}

/** Link pieces that are not delimiter pairs: link targets, URLs, and embeds including their `!`. */
export interface LinkPart {
	kind: 'link' | 'link-part';
	key?: string;
	label: string;
	from: number;
	to: number;
}

export interface PairScan {
	pairs: Pair[];
	/**
	 * The scanned text with code, math, links and URLs replaced by `x`, so their content
	 * can neither end a sentence nor open a pair. Same length as the input.
	 * The text of Markdown links stays visible, so formatting inside it is found.
	 */
	masked: string;
	links: LinkPart[];
}

interface AsymmetricType {
	open: string;
	close: string;
	family: PairFamily;
}

// Some characters open one kind of quote and close another (“ opens English quotes and
// closes German „…“). A character closes when a matching pair is open, otherwise it opens.
const ASYMMETRIC: readonly AsymmetricType[] = [
	{ open: '(', close: ')', family: 'bracket' },
	{ open: '[', close: ']', family: 'bracket' },
	{ open: '{', close: '}', family: 'bracket' },
	{ open: '（', close: '）', family: 'bracket' },
	{ open: '【', close: '】', family: 'bracket' },
	{ open: '“', close: '”', family: 'quote' },
	{ open: '‘', close: '’', family: 'quote' },
	{ open: '„', close: '“', family: 'quote' },
	{ open: '‚', close: '‘', family: 'quote' },
	{ open: '«', close: '»', family: 'quote' },
	{ open: '»', close: '«', family: 'quote' },
	{ open: '‹', close: '›', family: 'quote' },
	{ open: '›', close: '‹', family: 'quote' },
	{ open: '「', close: '」', family: 'quote' },
	{ open: '『', close: '』', family: 'quote' },
];

const CODE_BRACKETS: readonly AsymmetricType[] = ASYMMETRIC.slice(0, 3);

const SYMMETRIC_FAMILY: Readonly<Record<string, PairFamily>> = {
	'*': 'emphasis',
	_: 'emphasis',
	'~': 'emphasis',
	'=': 'emphasis',
	'%': 'comment',
	'"': 'quote',
	"'": 'quote',
};

const BARE_URL = /[a-z][a-z0-9+.-]*:\/\/[^\s<>]*[^\s<>.,;:!?"'”’)\]*_~]/gi;
const MARKDOWN_LINK = /(!?)\[([^[\]\n]*)\]\(([^()\n]*(?:\([^()\n]*\)[^()\n]*)*)\)/g;
const WIKI_LINK = /!?\[\[[^[\]\n]+?\]\]/g;
const DISPLAY_MATH = /\$\$[\s\S]+?\$\$/g;
// No lookbehind anywhere: it is a syntax error on iOS before 16.4.
const INLINE_MATH = /\$[^\s$](?:[^$\n]*[^\s$])?\$(?!\d)/g;
const ESCAPE = /\\[\\`*_{}[\]()#+\-.!|~=%$"'<>]/g;

/** Finds the delimiter pairs of a text block. `prose` enables Markdown rules; otherwise code rules apply. */
export function scanPairs(text: string, prose: boolean): PairScan {
	return prose ? scanProse(text) : scanCode(text);
}

function scanProse(text: string): PairScan {
	const chars = text.split('');
	const pairs: Pair[] = [];
	const links: LinkPart[] = [];
	const mask = (from: number, to: number) => {
		for (let i = from; i < to; i++) {
			if (chars[i] !== '\n') chars[i] = 'x';
		}
	};
	const each = (pattern: RegExp, fn: (match: RegExpExecArray) => void) => {
		const current = chars.join('');
		pattern.lastIndex = 0;
		for (const match of current.matchAll(pattern)) fn(match);
	};

	each(ESCAPE, (m) => mask(m.index, m.index + m[0].length));
	findCodeSpans(chars, pairs, mask);
	each(DISPLAY_MATH, (m) => {
		const to = m.index + m[0].length;
		pairs.push(makePair(text, m.index, m.index + 2, to - 2, to, 'math'));
		mask(m.index, to);
	});
	each(INLINE_MATH, (m) => {
		const to = m.index + m[0].length;
		pairs.push(makePair(text, m.index, m.index + 1, to - 1, to, 'math'));
		mask(m.index, to);
	});
	each(WIKI_LINK, (m) => {
		wikiLink(text, m.index, m.index + m[0].length, pairs, links);
		mask(m.index, m.index + m[0].length);
	});
	each(MARKDOWN_LINK, (m) => markdownLink(text, m, pairs, links, mask));
	each(BARE_URL, (m) => mask(m.index, m.index + m[0].length));

	const masked = chars.join('');
	matchDelimiters(masked, text, pairs);
	pairs.sort((a, b) => a.from - b.from || b.to - a.to);
	return { pairs, masked, links };
}

/** `[[target|text]]`, and `![[…]]` embeds as one step larger. */
function wikiLink(text: string, from: number, to: number, pairs: Pair[], links: LinkPart[]): void {
	const embed = text.charAt(from) === '!';
	const start = embed ? from + 1 : from;
	pairs.push(makePair(text, start, start + 2, to - 2, to, 'link'));
	if (embed) links.push({ kind: 'link', label: 'Including ![[…]]', from, to });
	const bar = text.indexOf('|', start + 2);
	if (bar >= 0 && bar < to - 2) {
		// In tables the separator is escaped: [[target\|text]]
		const targetEnd = text.charAt(bar - 1) === '\\' ? bar - 1 : bar;
		links.push({ kind: 'link-part', key: 'target', label: 'Link target', from: start + 2, to: targetEnd });
		links.push({ kind: 'link-part', key: 'text', label: 'Link text', from: bar + 1, to: to - 2 });
	}
}

/** `[text](url)`: the text, the URL, the whole link, and for images `![…](…)` as one step larger. */
function markdownLink(
	text: string,
	match: RegExpExecArray,
	pairs: Pair[],
	links: LinkPart[],
	mask: (from: number, to: number) => void,
): void {
	const image = match[1] === '!';
	const start = match.index + match[1]!.length;
	const textFrom = start + 1;
	const textTo = textFrom + match[2]!.length;
	const to = match.index + match[0].length;
	pairs.push({
		...makePair(text, start, textFrom, textTo, to, 'link'),
		innerLabel: image ? 'Image description' : 'Link text',
		outerLabel: 'Link',
	});
	if (image) links.push({ kind: 'link', label: 'Image', from: match.index, to });
	const destination = /^\s*(?:<([^>]*)>|(\S+))/.exec(match[3]!);
	if (destination) {
		const url = destination[1] ?? destination[2]!;
		const urlFrom = textTo + 2 + destination[0].length - url.length - (destination[1] === undefined ? 0 : 1);
		links.push({ kind: 'link-part', key: 'url', label: 'Link URL', from: urlFrom, to: urlFrom + url.length });
	}
	// Hide the brackets and the target; keep the link text visible.
	mask(match.index, textFrom);
	mask(textTo, to);
}

function findCodeSpans(
	chars: string[],
	pairs: Pair[],
	mask: (from: number, to: number) => void,
): void {
	const n = chars.length;
	const text = chars.join('');
	let i = 0;
	while (i < n) {
		if (chars[i] !== '`') {
			i++;
			continue;
		}
		let j = i;
		while (j < n && chars[j] === '`') j++;
		const length = j - i;
		let k = j;
		let close = -1;
		while (k < n) {
			if (chars[k] !== '`') {
				k++;
				continue;
			}
			let e = k;
			while (e < n && chars[e] === '`') e++;
			if (e - k === length) {
				close = k;
				break;
			}
			k = e;
		}
		if (close < 0) {
			i = j;
			continue;
		}
		pairs.push(makePair(text, i, j, close, close + length, 'code'));
		mask(i, close + length);
		i = close + length;
	}
}

interface Opener {
	pos: number;
	length: number;
}

/** Matches brackets, quotes and Markdown formatting on the masked text. */
function matchDelimiters(s: string, original: string, pairs: Pair[]): void {
	const n = s.length;
	const stacks: number[][] = ASYMMETRIC.map(() => []);
	const symmetric = new Map<string, Opener[]>();

	let i = 0;
	while (i < n) {
		const c = s.charAt(i);
		if (c in SYMMETRIC_FAMILY) {
			i = matchSymmetric(s, original, i, symmetric, pairs);
			continue;
		}
		if (c === '’' && isWordChar(s[i - 1]) && isWordChar(s[i + 1])) {
			i++; // apostrophe as in “don’t”
			continue;
		}
		let closed = false;
		for (let t = 0; t < ASYMMETRIC.length && !closed; t++) {
			const type = ASYMMETRIC[t]!;
			const stack = stacks[t]!;
			if (type.close === c && stack.length > 0) {
				const open = stack.pop()!;
				pairs.push(makePair(original, open, open + 1, i, i + 1, type.family));
				closed = true;
			}
		}
		if (!closed) {
			const t = ASYMMETRIC.findIndex((type) => type.open === c);
			if (t >= 0) stacks[t]!.push(i);
		}
		i++;
	}
}

function matchSymmetric(
	s: string,
	original: string,
	i: number,
	stacks: Map<string, Opener[]>,
	pairs: Pair[],
): number {
	const c = s.charAt(i);
	const isQuote = c === '"' || c === "'";
	let j = i + 1;
	if (!isQuote) {
		while (j < s.length && s[j] === c) j++;
	}
	const length = j - i;
	const needsDouble = c === '~' || c === '=' || c === '%';
	if (needsDouble && length !== 2) return j;

	// Simplified CommonMark flanking rules.
	const prev = s[i - 1];
	const next = s[j];
	const left =
		!isWhitespace(next) &&
		(!isPunctuation(next) || isWhitespace(prev) || isPunctuation(prev));
	const right =
		!isWhitespace(prev) &&
		(!isPunctuation(prev) || isWhitespace(next) || isPunctuation(next));
	// `_` and quotes do not work inside words (snake_case, don't).
	const strict = c === '_' || isQuote;
	const canOpen = strict ? left && (!right || isPunctuation(prev)) : left;
	const canClose = strict ? right && (!left || isPunctuation(next)) : right;

	let stack = stacks.get(c);
	if (!stack) {
		stack = [];
		stacks.set(c, stack);
	}
	let pos = i;
	let remaining = length;
	if (canClose) {
		while (remaining > 0 && stack.length > 0) {
			const opener = stack[stack.length - 1]!;
			let used = 1;
			if (needsDouble) used = 2;
			else if (!isQuote && opener.length >= 2 && remaining >= 2) used = 2;
			const openEnd = opener.pos + opener.length;
			pairs.push(
				makePair(original, openEnd - used, openEnd, pos, pos + used, SYMMETRIC_FAMILY[c]!),
			);
			opener.length -= used;
			if (opener.length === 0) stack.pop();
			pos += used;
			remaining -= used;
		}
	}
	if (remaining > 0 && canOpen) stack.push({ pos, length: remaining });
	return j;
}

/** Code blocks: brackets plus quotes that simply toggle. */
function scanCode(text: string): PairScan {
	const pairs: Pair[] = [];
	const stacks: number[][] = CODE_BRACKETS.map(() => []);
	const quotes = new Map<string, number>();
	for (let i = 0; i < text.length; i++) {
		const c = text.charAt(i);
		if (c === '\\') {
			i++;
			continue;
		}
		if (c === '"' || c === "'" || c === '`') {
			const open = quotes.get(c);
			if (open === undefined) {
				quotes.set(c, i);
			} else {
				pairs.push(makePair(text, open, open + 1, i, i + 1, c === '`' ? 'code' : 'quote'));
				quotes.delete(c);
			}
			continue;
		}
		CODE_BRACKETS.forEach((type, t) => {
			const stack = stacks[t]!;
			if (type.open === c) stack.push(i);
			else if (type.close === c && stack.length > 0) {
				const open = stack.pop()!;
				pairs.push(makePair(text, open, open + 1, i, i + 1, type.family));
			}
		});
	}
	pairs.sort((a, b) => a.from - b.from || b.to - a.to);
	return { pairs, masked: text, links: [] };
}

function makePair(
	text: string,
	from: number,
	openTo: number,
	closeFrom: number,
	to: number,
	family: PairFamily,
): Pair {
	return {
		from,
		openTo,
		closeFrom,
		to,
		open: text.slice(from, openTo),
		close: text.slice(closeFrom, to),
		family,
	};
}
