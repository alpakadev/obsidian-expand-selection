import { App, PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_ABBREVIATIONS, SelectionOptions, parseAbbreviations } from './core/types';
import type SmartSelectPlugin from './main';

export interface SmartSelectSettings {
	compoundWords: boolean;
	clauses: boolean;
	sentenceWithoutPunctuation: boolean;
	lines: boolean;
	sections: boolean;
	abbreviations: string;
	showStatus: boolean;
}

export const DEFAULT_SETTINGS: SmartSelectSettings = {
	compoundWords: true,
	clauses: true,
	sentenceWithoutPunctuation: true,
	lines: true,
	sections: true,
	abbreviations: DEFAULT_ABBREVIATIONS,
	showStatus: true,
};

export function toOptions(settings: SmartSelectSettings): SelectionOptions {
	return {
		compoundWords: settings.compoundWords,
		clauses: settings.clauses,
		sentenceWithoutPunctuation: settings.sentenceWithoutPunctuation,
		lines: settings.lines,
		sections: settings.sections,
		abbreviations: parseAbbreviations(settings.abbreviations),
	};
}

type ToggleKey = {
	[K in keyof SmartSelectSettings]: SmartSelectSettings[K] extends boolean ? K : never;
}[keyof SmartSelectSettings];

export class SmartSelectSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: SmartSelectPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Expansion steps')
			.setDesc(
				'Expanding always goes word → text inside quotes, brackets or formatting → sentence → paragraph or list item → list → note. Choose which extra steps to stop at.',
			)
			.setHeading();
		this.toggle(
			'compoundWords',
			'Compound words',
			'After a word, select the whole hyphenated word, file name or link, like “well-known” or “example.com”.',
		);
		this.toggle(
			'clauses',
			'Parts of sentences',
			'Select the part of a sentence between commas, semicolons, colons or dashes.',
		);
		this.toggle(
			'sentenceWithoutPunctuation',
			'Sentences without final punctuation',
			'Select a sentence without its period, question mark or exclamation mark first.',
		);
		this.toggle(
			'lines',
			'Lines',
			'In a paragraph with line breaks, select the current line before the whole paragraph.',
		);
		this.toggle('sections', 'Heading sections', 'Select the section under each heading before the whole note.');

		new Setting(containerEl).setName('Sentences').setHeading();
		new Setting(containerEl)
			.setName('Abbreviations')
			.setDesc('Words that end with a period but do not end a sentence. Separate them with spaces.')
			.addTextArea((text) => {
				text.inputEl.rows = 4;
				text.setValue(this.plugin.settings.abbreviations).onChange(async (value) => {
					this.plugin.settings.abbreviations = value;
					await this.plugin.saveSettings();
				});
			})
			.addExtraButton((button) =>
				button
					.setIcon('rotate-ccw')
					.setTooltip('Restore default abbreviations')
					.onClick(async () => {
						this.plugin.settings.abbreviations = DEFAULT_ABBREVIATIONS;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		new Setting(containerEl).setName('Display').setHeading();
		this.toggle(
			'showStatus',
			'Show what is selected',
			'Show the name of the selected unit, like “Sentence” or “Inside “…””, in the status bar.',
		);
	}

	private toggle(key: ToggleKey, name: string, description: string): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(description)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings[key]).onChange(async (value) => {
					this.plugin.settings[key] = value;
					await this.plugin.saveSettings();
				}),
			);
	}
}
