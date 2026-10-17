import { App, Modal, Setting, setIcon } from 'obsidian';
import {
	AbbreviationList,
	addAbbreviations,
	defaultAbbreviationLists,
	isBuiltInLanguage,
	otherListsWith,
	parseAbbreviationInput,
	restoreBuiltIn,
	sameWord,
} from '../core/abbreviations';

const quote = (words: string[]) => words.map((word) => `“${word}”`).join(', ');

/**
 * Edits the abbreviations, one list per language. Words are removable tags; typing a word
 * that is already in the list says so and points at it. Every change is saved right away.
 */
export class AbbreviationsModal extends Modal {
	private lists: AbbreviationList[];
	private selected = 0;
	private message: { text: string; warning: boolean } | null = null;
	private flash: string[] = [];
	private focusAdd = false;

	constructor(
		app: App,
		lists: readonly AbbreviationList[],
		private readonly save: (lists: AbbreviationList[]) => Promise<void>,
	) {
		super(app);
		this.lists = lists.map((list) => ({ ...list, words: [...list.words] }));
	}

	onOpen(): void {
		this.titleEl.setText('Abbreviations');
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('smart-select-abbreviations');
		contentEl.createEl('p', {
			cls: 'setting-item-description',
			text: 'A period after these words does not end the sentence. Keep a list for each language you write in.',
		});
		if (this.lists.length === 0) {
			this.lists = defaultAbbreviationLists();
			void this.save(this.lists.map((l) => ({ ...l, words: [...l.words] })));
		}
		this.selected = Math.min(this.selected, this.lists.length - 1);
		const list = this.lists[this.selected]!;

		const language = new Setting(contentEl).setName('Language').addDropdown((dropdown) => {
			for (const [i, l] of this.lists.entries()) {
				dropdown.addOption(String(i), `${l.language} (${l.words.length})`);
			}
			dropdown.setValue(String(this.selected)).onChange((value) => {
				this.selected = Number(value);
				this.message = null;
				this.render();
			});
		});
		if (!isBuiltInLanguage(list.language)) {
			language.addExtraButton((button) =>
				button
					.setIcon('trash-2')
					.setTooltip(`Remove ${list.language}`)
					.onClick(() => {
						this.lists.splice(this.selected, 1);
						this.selected = 0;
						this.message = { text: `Removed ${list.language}.`, warning: false };
						void this.commit();
					}),
			);
		}

		new Setting(contentEl)
			.setName(`Use ${list.language} abbreviations`)
			.setDesc('Turn off for languages you do not write in.')
			.addToggle((toggle) =>
				toggle.setValue(list.enabled).onChange((value) => {
					list.enabled = value;
					void this.commit(false);
				}),
			);

		const add = new Setting(contentEl).setName('Add').setDesc('Type one or more, separated by spaces.');
		let typed = '';
		const submit = () => {
			const words = parseAbbreviationInput(typed);
			if (words.length === 0) return;
			const result = addAbbreviations(list.words, words);
			list.words = result.words;
			this.flash = result.duplicates;
			this.message = this.describe(result.added, result.duplicates);
			this.focusAdd = true;
			void this.commit();
		};
		add.addText((text) => {
			text.setPlaceholder('For example: etc.').onChange((value) => (typed = value));
			text.inputEl.addEventListener('keydown', (event) => {
				if (event.key !== 'Enter') return;
				event.preventDefault();
				submit();
			});
			if (this.focusAdd) {
				this.focusAdd = false;
				window.setTimeout(() => text.inputEl.focus(), 0);
			}
		});
		add.addButton((button) => button.setButtonText('Add').setCta().onClick(submit));

		if (this.message) {
			contentEl.createDiv({
				cls: ['smart-select-message', this.message.warning ? 'mod-warning' : ''].filter(Boolean),
				text: this.message.text,
				attr: { role: 'status', 'aria-live': 'polite' },
			});
		}

		const tags = contentEl.createDiv({ cls: 'smart-select-tags' });
		if (list.words.length === 0) {
			tags.createSpan({ cls: 'smart-select-tags-empty', text: `No ${list.language} abbreviations yet.` });
		}
		for (const word of list.words) {
			const tag = tags.createDiv({ cls: 'smart-select-tag' });
			if (this.flash.includes(word)) tag.addClass('is-flashing');
			tag.createSpan({ text: word });
			const remove = tag.createEl('button', {
				cls: 'smart-select-tag-remove clickable-icon',
				attr: { 'aria-label': `Remove ${word}` },
			});
			setIcon(remove, 'x');
			remove.addEventListener('click', () => {
				list.words = list.words.filter((w) => w !== word);
				const others = otherListsWith(this.lists, list, word).map((l) => l.language);
				this.message = others.length
					? {
							text: `Removed “${word}” from ${list.language}. ${others.join(' and ')} still has it, so a period after it still does not end a sentence.`,
							warning: true,
						}
					: { text: `Removed “${word}”.`, warning: false };
				void this.commit();
			});
		}
		this.flash = [];

		let newLanguage = '';
		const addLanguage = () => {
			const name = newLanguage.trim();
			if (!name) return;
			const existing = this.lists.findIndex((l) => sameWord(l.language, name));
			if (existing >= 0) {
				this.selected = existing;
				this.message = { text: `${this.lists[existing]!.language} is already in the list.`, warning: true };
			} else {
				this.lists.push({ language: name, words: [], enabled: true });
				this.selected = this.lists.length - 1;
				this.message = { text: `Added ${name}. Now add its abbreviations.`, warning: false };
				this.focusAdd = true;
			}
			void this.commit();
		};
		new Setting(contentEl)
			.setName('Add a language')
			.addText((text) => {
				text.setPlaceholder('For example: French').onChange((value) => (newLanguage = value));
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key !== 'Enter') return;
					event.preventDefault();
					addLanguage();
				});
			})
			.addButton((button) => button.setButtonText('Add language').onClick(addLanguage));

		new Setting(contentEl)
			.setName('Restore built-in words')
			.setDesc('Adds back the words that come with the plugin if you removed some. Your own words and languages stay.')
			.addButton((button) =>
				button.setButtonText('Restore').onClick(() => {
					const { lists, restored } = restoreBuiltIn(this.lists);
					this.lists = lists;
					this.message = {
						text: restored === 0 ? 'Nothing to restore.' : `Restored ${restored} ${restored === 1 ? 'word' : 'words'}.`,
						warning: false,
					};
					void this.commit();
				}),
			);
	}

	private describe(added: string[], duplicates: string[]): { text: string; warning: boolean } {
		const parts: string[] = [];
		if (added.length > 0) parts.push(`Added ${quote(added)}.`);
		if (duplicates.length === 1) parts.push(`${quote(duplicates)} is already in the list.`);
		if (duplicates.length > 1) parts.push(`${quote(duplicates)} are already in the list.`);
		return { text: parts.join(' '), warning: duplicates.length > 0 };
	}

	private async commit(rerender = true): Promise<void> {
		if (rerender) this.render();
		await this.save(this.lists.map((list) => ({ ...list, words: [...list.words] })));
	}
}
