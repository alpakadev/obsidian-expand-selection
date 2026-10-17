import { Plugin } from 'obsidian';
import { registerCommands } from './commands';
import type { SelectionOptions } from './core/types';
import { SelectionController } from './editor/controller';
import { SelectionStatus } from './editor/status';
import {
	DEFAULT_SETTINGS,
	SmartSelectSettingTab,
	SmartSelectSettings,
	toOptions,
} from './settings';

export default class SmartSelectPlugin extends Plugin {
	settings!: SmartSelectSettings;
	private options!: SelectionOptions;

	async onload() {
		await this.loadSettings();
		const status = new SelectionStatus(this, () => this.settings.showStatus);
		const controller = new SelectionController(() => this.options, status);
		registerCommands(this, controller);
		this.addSettingTab(new SmartSelectSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<SmartSelectSettings>,
		);
		this.options = toOptions(this.settings);
	}

	async saveSettings() {
		this.options = toOptions(this.settings);
		await this.saveData(this.settings);
	}
}
