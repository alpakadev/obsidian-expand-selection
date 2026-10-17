import { App, PluginSettingTab, Setting } from 'obsidian';
import type SmartSelectPlugin from './main';
import type { SmartSelectSettings } from './settings-data';
import { AbbreviationsModal } from './ui/abbreviations-modal';

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

		const count = this.plugin.settings.abbreviations.length;
		new Setting(containerEl)
			.setName('Abbreviations')
			.setDesc(`A period after these doesn’t end a sentence, like “e.g.” or “z.B.” (${count} words).`)
			.addButton((button) =>
				button.setButtonText('Edit').onClick(() => {
					new AbbreviationsModal(this.app, this.plugin.settings.abbreviations, async (words) => {
						this.plugin.settings.abbreviations = words;
						await this.plugin.saveSettings();
						this.display();
					}).open();
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
