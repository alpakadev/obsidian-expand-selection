/** Character classes shared by the text scanners. `undefined` means start or end of text. */

export function isWhitespace(c: string | undefined): boolean {
	return c === undefined || /\s/.test(c);
}

export function isWordChar(c: string | undefined): boolean {
	return c !== undefined && /[\p{L}\p{N}\p{M}]/u.test(c);
}

export function isPunctuation(c: string | undefined): boolean {
	return c !== undefined && /[\p{P}\p{S}]/u.test(c);
}

export function isLowercaseLetter(c: string | undefined): boolean {
	return c !== undefined && /\p{Ll}/u.test(c);
}

export function isUppercaseLetter(c: string | undefined): boolean {
	return c !== undefined && /\p{Lu}/u.test(c);
}

/** Characters that end a sentence. */
export const TERMINALS: ReadonlySet<string> = new Set([
	'.', '!', '?', '…', '‽', '。', '！', '？',
]);

/** Characters that may follow the end of a sentence and still belong to it. */
export const SENTENCE_CLOSERS: ReadonlySet<string> = new Set([
	')', ']', '}', '"', "'", '”', '’', '“', '‘', '»', '«', '›', '‹',
	'*', '_', '~', '=', '%', '」', '』', '）', '】',
]);

/** Characters that can be part of a delimiter pair (quotes, brackets, formatting). */
export const DELIMITER_CHARS: ReadonlySet<string> = new Set([
	'*', '_', '~', '=', '%', '"', "'", '“', '”', '„', '‘', '’', '‚',
	'«', '»', '‹', '›', '(', ')', '[', ']', '{', '}', '「', '」', '『', '』',
	'（', '）', '【', '】',
]);
