import {
	AbbreviationList,
	abbreviationSet,
	defaultAbbreviationLists,
	parseAbbreviationInput,
	splitIntoLanguages,
} from './core/abbreviations';
import type { SelectionOptions } from './core/types';

export interface SmartSelectSettings {
	compoundWords: boolean;
	clauses: boolean;
	sentenceWithoutPunctuation: boolean;
	lines: boolean;
	sections: boolean;
	abbreviations: AbbreviationList[];
	showStatus: boolean;
}

export const DEFAULT_SETTINGS: Readonly<SmartSelectSettings> = {
	compoundWords: true,
	clauses: true,
	sentenceWithoutPunctuation: true,
	lines: true,
	sections: true,
	abbreviations: defaultAbbreviationLists(),
	showStatus: true,
};

type Saved = Partial<Record<keyof SmartSelectSettings, unknown>>;

/**
 * Reads saved settings. Abbreviations were one string in 1.0.0 and one list before languages
 * were added; both are split into the built-in languages, unknown words go to “Other”.
 */
export function readSettings(data: unknown): SmartSelectSettings {
	const saved = (data ?? {}) as Saved;
	const settings: SmartSelectSettings = { ...DEFAULT_SETTINGS, abbreviations: defaultAbbreviationLists() };
	for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof SmartSelectSettings)[]) {
		const value = saved[key];
		if (key !== 'abbreviations' && typeof value === 'boolean') settings[key] = value;
	}
	const abbreviations = readAbbreviations(saved.abbreviations);
	if (abbreviations) settings.abbreviations = abbreviations;
	return settings;
}

/** Saved abbreviations in any earlier format, or null to use the built-in lists. */
function readAbbreviations(value: unknown): AbbreviationList[] | null {
	if (typeof value === 'string') return splitIntoLanguages(parseAbbreviationInput(value));
	if (!Array.isArray(value)) return null;
	const lists: AbbreviationList[] = [];
	const loose: string[] = [];
	for (const item of value as unknown[]) {
		if (typeof item === 'string') {
			loose.push(item);
			continue;
		}
		if (!item || typeof item !== 'object') continue;
		const { language, words, enabled } = item as Record<string, unknown>;
		if (typeof language !== 'string' || !language.trim() || !Array.isArray(words)) continue;
		lists.push({
			language,
			words: words.filter((word): word is string => typeof word === 'string'),
			enabled: enabled !== false,
		});
	}
	if (loose.length > 0) lists.push(...splitIntoLanguages(loose));
	return lists.length > 0 ? lists : null;
}

export function toOptions(settings: SmartSelectSettings): SelectionOptions {
	return {
		compoundWords: settings.compoundWords,
		clauses: settings.clauses,
		sentenceWithoutPunctuation: settings.sentenceWithoutPunctuation,
		lines: settings.lines,
		sections: settings.sections,
		abbreviations: abbreviationSet(settings.abbreviations),
	};
}
