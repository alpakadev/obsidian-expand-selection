export const DEFAULT_ABBREVIATIONS: readonly string[] = [
	'Mr.', 'Mrs.', 'Ms.', 'Dr.', 'Prof.', 'Sr.', 'Jr.', 'St.', 'vs.',
	'e.g.', 'i.e.', 'cf.', 'approx.', 'fig.', 'vol.', 'al.', 'ca.',
	'z.B.', 'd.h.', 'u.a.', 'bzw.', 'vgl.', 'ggf.', 'evtl.', 'inkl.',
	'sog.', 'bspw.', 'Nr.', 'Abs.', 'Hr.', 'Fr.', 'o.ä.', 'u.U.', 'z.T.',
];

/** Lowercase lookup keys without the trailing period. */
export function abbreviationSet(words: readonly string[]): Set<string> {
	const result = new Set<string>();
	for (const word of words) {
		const key = word.trim().replace(/\.+$/, '').toLowerCase();
		if (key) result.add(key);
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

/** Adds words to a list, skipping ones that are already in it (ignoring case), sorted alphabetically. */
export function mergeAbbreviations(words: readonly string[], added: readonly string[]): string[] {
	const seen = new Set(words.map((word) => word.toLowerCase()));
	const merged = [...words];
	for (const word of added) {
		if (seen.has(word.toLowerCase())) continue;
		seen.add(word.toLowerCase());
		merged.push(word);
	}
	return merged.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
