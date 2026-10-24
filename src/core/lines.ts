export type LineKind =
	| 'blank'
	| 'text'
	| 'list'
	| 'heading'
	| 'table'
	| 'hr'
	| 'fence'
	| 'code';

export interface Line {
	index: number;
	/** Offset of the first character of the line. */
	from: number;
	/** Offset of the end of the line, before the line break. */
	to: number;
	kind: LineKind;
	quoteDepth: number;
	/** Offset of the first `>` when the line is inside a blockquote, otherwise `from`. */
	quoteFrom: number;
	/** Indentation width after the quote markers (a tab counts as 4). */
	indent: number;
	/** First non-whitespace character after the quote markers. */
	textFrom: number;
	/** Start of the text after list markers, task checkboxes and heading marks. */
	contentFrom: number;
	/** End of the text without trailing whitespace. */
	contentTo: number;
	headingLevel: number;
	/** For `fence` and `code` lines: index of the opening fence line. */
	fenceOpen: number;
	/** True for the YAML front matter at the top of a note. */
	frontmatter: boolean;
	/** For `code` lines in a code block without a language or with a text one like `md`: read as text. */
	plainText: boolean;
}

const QUOTE = /^[ \t]{0,3}>[ \t]?/;
const HEADING = /^(#{1,6})(?:[ \t]+|$)/;
const RULE = /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const LIST = /^(?:[-*+]|\d{1,9}[.)])(?:[ \t]+(?:\[[^\]\n]\](?:[ \t]+|$))?|$)/;
const FENCE = /^(`{3,}|~{3,})/;
/** Code block languages whose lines are text, not code. Obsidian shows a block without a language as plain text. */
const TEXT_LANGUAGES: ReadonlySet<string> = new Set(['', 'text', 'txt', 'plain', 'plaintext', 'md', 'markdown']);

export function parseLines(text: string): Line[] {
	const lines: Line[] = [];
	let fence: { char: string; length: number; open: number; frontmatter: boolean; text: boolean } | null = null;
	let from = 0;
	for (let index = 0; ; index++) {
		const end = text.indexOf('\n', from);
		const to = end < 0 ? text.length : end;
		const raw = text.slice(from, to);
		const line = parseLine(raw, from, index);

		if (index === 0 && raw === '---') {
			line.kind = 'fence';
			line.frontmatter = true;
			line.fenceOpen = 0;
			fence = { char: '-', length: 3, open: 0, frontmatter: true, text: false };
		} else if (fence) {
			const rest = raw.slice(line.textFrom - from);
			const closes = fence.frontmatter
				? raw === '---' || raw === '...'
				: rest.startsWith(fence.char.repeat(fence.length)) &&
					new RegExp(`^\\${fence.char}+[ \\t]*$`).test(rest);
			line.kind = closes ? 'fence' : 'code';
			line.fenceOpen = fence.open;
			line.frontmatter = fence.frontmatter;
			line.plainText = fence.text && !closes;
			// Text lines keep their content start after a bullet, checkbox or heading marks.
			if (!line.plainText) line.contentFrom = line.textFrom;
			line.headingLevel = 0;
			if (closes) fence = null;
		} else {
			const rest = raw.slice(line.textFrom - from);
			const opening = FENCE.exec(rest);
			if (opening && !(opening[1]!.startsWith('`') && rest.slice(opening[1]!.length).includes('`'))) {
				line.kind = 'fence';
				line.fenceOpen = index;
				line.contentFrom = line.textFrom;
				const language = rest.slice(opening[1]!.length).trim().split(/\s/)[0]!.toLowerCase();
				fence = {
					char: opening[1]!.charAt(0),
					length: opening[1]!.length,
					open: index,
					frontmatter: false,
					text: TEXT_LANGUAGES.has(language),
				};
			}
		}
		lines.push(line);
		if (end < 0) break;
		from = end + 1;
	}
	return lines;
}

function parseLine(raw: string, from: number, index: number): Line {
	let pos = 0;
	let quoteDepth = 0;
	let quoteFrom = from;
	for (let match = QUOTE.exec(raw); match; match = QUOTE.exec(raw.slice(pos))) {
		if (quoteDepth === 0) quoteFrom = from + pos + match[0].indexOf('>');
		quoteDepth++;
		pos += match[0].length;
	}
	let indent = 0;
	let textStart = pos;
	while (textStart < raw.length && (raw[textStart] === ' ' || raw[textStart] === '\t')) {
		indent += raw[textStart] === '\t' ? 4 - (indent % 4) : 1;
		textStart++;
	}
	const textFrom = from + textStart;
	const contentTo = Math.max(textFrom, from + raw.trimEnd().length);
	const rest = raw.slice(textStart);
	const line: Line = {
		index,
		from,
		to: from + raw.length,
		kind: 'text',
		quoteDepth,
		quoteFrom,
		indent,
		textFrom,
		contentFrom: textFrom,
		contentTo,
		headingLevel: 0,
		fenceOpen: -1,
		frontmatter: false,
		plainText: false,
	};
	if (rest.trim() === '') {
		line.kind = 'blank';
		return line;
	}
	const heading = HEADING.exec(rest);
	if (heading) {
		line.kind = 'heading';
		line.headingLevel = heading[1]!.length;
		line.contentFrom = Math.min(contentTo, textFrom + heading[0].length);
		return line;
	}
	if (RULE.test(rest)) {
		line.kind = 'hr';
		return line;
	}
	const list = LIST.exec(rest);
	if (list) {
		line.kind = 'list';
		line.contentFrom = Math.min(contentTo, textFrom + list[0].length);
		return line;
	}
	if (rest.startsWith('|')) line.kind = 'table';
	return line;
}
