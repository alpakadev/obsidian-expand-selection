import {
	DEFAULT_ABBREVIATIONS,
	abbreviationSet,
	parseAbbreviationInput,
} from './core/abbreviations';
import type { SelectionOptions } from './core/types';

export interface SmartSelectSettings {
	compoundWords: boolean;
	clauses: boolean;
	sentenceWithoutPunctuation: boolean;
	lines: boolean;
	sections: boolean;
	abbreviations: string[];
	showStatus: boolean;
}

export const DEFAULT_SETTINGS: SmartSelectSettings = {
	compoundWords: true,
	clauses: true,
	sentenceWithoutPunctuation: true,
	lines: true,
	sections: true,
	abbreviations: [...DEFAULT_ABBREVIATIONS],
	showStatus: true,
};

/** Reads saved settings, including the abbreviations of version 1.0.0, which were one string. */
export function readSettings(data: unknown): SmartSelectSettings {
	const saved = (data ?? {}) as Partial<Record<keyof SmartSelectSettings, unknown>>;
	const settings: SmartSelectSettings = { ...DEFAULT_SETTINGS, abbreviations: [...DEFAULT_ABBREVIATIONS] };
	for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof SmartSelectSettings)[]) {
		const value = saved[key];
		if (key === 'abbreviations') continue;
		if (typeof value === 'boolean') settings[key] = value;
	}
	const abbreviations = saved.abbreviations;
	if (typeof abbreviations === 'string') settings.abbreviations = parseAbbreviationInput(abbreviations);
	else if (Array.isArray(abbreviations)) {
		settings.abbreviations = abbreviations.filter((word): word is string => typeof word === 'string');
	}
	return settings;
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
