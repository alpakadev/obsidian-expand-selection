import type { Editor, Plugin } from 'obsidian';
import type { SelectionController } from './editor/controller';

interface CommandSpec {
	id: string;
	name: string;
	icon: string;
	run: (editor: Editor) => void;
}

/**
 * Registers the editor commands. No default hotkeys: assign them in Settings → Hotkeys.
 * Obsidian lists commands alphabetically there, so the names are chosen to keep opposites
 * together: choose, expand, reduce, same kind next/previous, quotes or formatting next/previous.
 */
export function registerCommands(plugin: Plugin, controller: SelectionController): void {
	const commands: CommandSpec[] = [
		{
			id: 'choose-selection',
			name: 'Choose what to select',
			icon: 'list',
			run: (editor) => controller.pick(editor),
		},
		{
			id: 'expand-selection',
			name: 'Expand selection',
			icon: 'expand',
			run: (editor) => controller.expand(editor),
		},
		{
			id: 'shrink-selection',
			name: 'Reduce selection',
			icon: 'shrink',
			run: (editor) => controller.shrink(editor),
		},
		{
			id: 'select-next-unit',
			name: 'Select same kind: next',
			icon: 'arrow-right',
			run: (editor) => controller.selectSibling(editor, 1),
		},
		{
			id: 'select-previous-unit',
			name: 'Select same kind: previous',
			icon: 'arrow-left',
			run: (editor) => controller.selectSibling(editor, -1),
		},
		{
			id: 'select-next-enclosed',
			name: 'Select text in quotes, brackets or formatting: next',
			icon: 'chevron-right',
			run: (editor) => controller.selectEnclosed(editor, 1),
		},
		{
			id: 'select-previous-enclosed',
			name: 'Select text in quotes, brackets or formatting: previous',
			icon: 'chevron-left',
			run: (editor) => controller.selectEnclosed(editor, -1),
		},
	];
	for (const command of commands) {
		plugin.addCommand({
			id: command.id,
			name: command.name,
			icon: command.icon,
			editorCallback: (editor) => command.run(editor),
		});
	}
}
