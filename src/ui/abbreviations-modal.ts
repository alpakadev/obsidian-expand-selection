import { App, Modal, Setting, TextComponent, setIcon } from 'obsidian';
import {
	DEFAULT_ABBREVIATIONS,
	mergeAbbreviations,
	parseAbbreviationInput,
} from '../core/abbreviations';

/** Edits the abbreviations as removable tags with a field to add new ones. Changes are saved right away. */
export class AbbreviationsModal extends Modal {
	private words: string[];
	private tags: HTMLElement | null = null;

	constructor(
		app: App,
		words: readonly string[],
		private readonly save: (words: string[]) => Promise<void>,
	) {
		super(app);
		this.words = mergeAbbreviations([], words);
	}

	onOpen(): void {
		const { contentEl } = this;
		this.titleEl.setText('Abbreviations');
		contentEl.createEl('p', {
			cls: 'setting-item-description',
			text: 'A period after these words does not end the sentence.',
		});

		let input: TextComponent | null = null;
		const add = async () => {
			if (!input) return;
			const added = parseAbbreviationInput(input.getValue());
			input.setValue('');
			if (added.length === 0) return;
			await this.change(mergeAbbreviations(this.words, added));
		};
		new Setting(contentEl)
			.setName('Add')
			.setDesc('Type one or more, separated by spaces.')
			.addText((text) => {
				input = text;
				text.setPlaceholder('For example: etc.');
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key !== 'Enter') return;
					event.preventDefault();
					void add();
				});
			})
			.addButton((button) => button.setButtonText('Add').setCta().onClick(() => void add()));

		this.tags = contentEl.createDiv({ cls: 'smart-select-tags' });
		this.render();

		new Setting(contentEl).addButton((button) =>
			button
				.setButtonText('Restore defaults')
				.onClick(() => void this.change(mergeAbbreviations([], DEFAULT_ABBREVIATIONS))),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async change(words: string[]): Promise<void> {
		this.words = words;
		this.render();
		await this.save([...words]);
	}

	private render(): void {
		const tags = this.tags;
		if (!tags) return;
		tags.empty();
		if (this.words.length === 0) {
			tags.createSpan({ cls: 'smart-select-tags-empty', text: 'No abbreviations.' });
		}
		for (const word of this.words) {
			const tag = tags.createDiv({ cls: 'smart-select-tag' });
			tag.createSpan({ text: word });
			const remove = tag.createEl('button', {
				cls: 'smart-select-tag-remove clickable-icon',
				attr: { 'aria-label': `Remove ${word}` },
			});
			setIcon(remove, 'x');
			remove.addEventListener('click', () => {
				void this.change(this.words.filter((w) => w !== word));
			});
		}
	}
}
