/** Abbreviations of one language. A period after one of them does not end a sentence. */
export interface AbbreviationList {
	language: string;
	words: string[];
	enabled: boolean;
}

/** The lists that come with the plugin. Other languages can be added by the user. */
export const BUILT_IN_ABBREVIATIONS: readonly { language: string; words: readonly string[] }[] = [
	{
		language: 'English',
		words: [
			'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Sr.', 'Jr.', 'St.', 'vs.',
			'e.g.', 'i.e.', 'cf.', 'approx.', 'fig.', 'vol.', 'al.', 'ca.',
		],
	},
	{
		language: 'German',
		words: [
			'z.B.', 'd.h.', 'u.a.', 'bzw.', 'vgl.', 'ggf.', 'evtl.', 'inkl.', 'sog.', 'bspw.',
			'Nr.', 'Abs.', 'Hr.', 'Fr.', 'Dr.', 'Prof.', 'ca.', 'o.ä.', 'u.U.', 'z.T.',
		],
	},
];

export function defaultAbbreviationLists(): AbbreviationList[] {
	return BUILT_IN_ABBREVIATIONS.map(({ language, words }) => ({
		language,
		words: sortWords(words),
		enabled: true,
	}));
}

/**
 * Adds back the built-in words the user removed. Keeps words the user added, which lists are
 * turned on, and the languages the user added. Returns how many words came back.
 */
export function restoreBuiltIn(lists: readonly AbbreviationList[]): { lists: AbbreviationList[]; restored: number } {
	let restored = 0;
	const result = lists.map((list) => ({ ...list, words: [...list.words] }));
	for (const builtIn of BUILT_IN_ABBREVIATIONS) {
		const list = result.find((l) => sameWord(l.language, builtIn.language));
		if (!list) {
			result.push({ language: builtIn.language, words: sortWords(builtIn.words), enabled: true });
			restored += builtIn.words.length;
			continue;
		}
		const added = addAbbreviations(list.words, builtIn.words);
		list.words = added.words;
		restored += added.added.length;
	}
	return { lists: result, restored };
}

/** Other lists that are turned on and contain the word. */
export function otherListsWith(
	lists: readonly AbbreviationList[],
	except: AbbreviationList,
	word: string,
): AbbreviationList[] {
	return lists.filter((l) => l !== except && l.enabled && l.words.some((w) => sameWord(w, word)));
}

export function isBuiltInLanguage(language: string): boolean {
	return BUILT_IN_ABBREVIATIONS.some((list) => sameWord(list.language, language));
}

/** Lowercase lookup keys without the trailing period, from every list that is turned on. */
export function abbreviationSet(lists: readonly AbbreviationList[]): Set<string> {
	const result = new Set<string>();
	for (const list of lists) {
		if (!list.enabled) continue;
		for (const word of list.words) {
			const key = word.trim().replace(/\.+$/, '').toLowerCase();
			if (key) result.add(key);
		}
	}
	return result;
}

/** Splits typed text into abbreviations, each ending with a period. */
export function parseAbbreviationInput(value: string): string[] {
	return value
		.split(/[\s,;]+/)
		.map((word) => word.trim())
		.filter((word) => word.replace(/\.+$/, '') !== '')
		.map((word) => (word.endsWith('.') ? word : `${word}.`));
}

export interface AddResult {
	words: string[];
	added: string[];
	/** Typed words that were already in the list (as written in the list). */
	duplicates: string[];
}

/** Adds typed words to a list, skipping ones already in it (ignoring case). */
export function addAbbreviations(words: readonly string[], typed: readonly string[]): AddResult {
	const result: AddResult = { words: [...words], added: [], duplicates: [] };
	for (const word of typed) {
		if (result.added.some((w) => sameWord(w, word))) continue; // typed twice
		const existing = result.words.find((w) => sameWord(w, word));
		if (existing !== undefined) {
			if (!result.duplicates.includes(existing)) result.duplicates.push(existing);
			continue;
		}
		result.words.push(word);
		result.added.push(word);
	}
	result.words = sortWords(result.words);
	return result;
}

/** Turns the single list of earlier versions into lists per language. */
export function splitIntoLanguages(words: readonly string[]): AbbreviationList[] {
	const lists = BUILT_IN_ABBREVIATIONS.map(({ language, words: builtIn }) => ({
		language,
		words: sortWords(words.filter((word) => builtIn.some((b) => sameWord(b, word)))),
		enabled: true,
	}));
	const other = words.filter(
		(word) => !BUILT_IN_ABBREVIATIONS.some((list) => list.words.some((b) => sameWord(b, word))),
	);
	if (other.length > 0) lists.push({ language: 'Other', words: sortWords(other), enabled: true });
	return lists;
}

export function sameWord(a: string, b: string): boolean {
	return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
}

function sortWords(words: readonly string[]): string[] {
	return [...new Set(words)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
