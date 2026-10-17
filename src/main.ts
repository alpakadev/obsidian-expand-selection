import { Plugin } from 'obsidian';
import { registerCommands } from './commands';
import type { SelectionOptions } from './core/types';
import { SelectionController } from './editor/controller';
import { previewExtension } from './editor/preview-mark';
import { SelectionStatus } from './editor/status';
import { SelectionPicker } from './ui/picker';
import { SmartSelectSettingTab } from './settings';
import { SmartSelectSettings, readSettings, toOptions } from './settings-data';

export default class SmartSelectPlugin extends Plugin {
	settings!: SmartSelectSettings;
	private options!: SelectionOptions;

	async onload() {
		await this.loadSettings();
		this.registerEditorExtension(previewExtension);
		const status = new SelectionStatus(this, () => this.settings.showStatus);
		const controller = new SelectionController(() => this.options, status, new SelectionPicker());
		this.register(() => controller.closePicker());
		registerCommands(this, controller);
		this.addSettingTab(new SmartSelectSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = readSettings(await this.loadData());
		this.options = toOptions(this.settings);
	}

	async saveSettings() {
		this.options = toOptions(this.settings);
		await this.saveData(this.settings);
	}
}
