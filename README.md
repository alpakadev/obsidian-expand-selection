# Smart Select

Grow, shrink and move your selection in Obsidian one meaningful step at a time — word, text in quotes, sentence, list item, list, section, whole note — instead of dragging the mouse or holding <kbd>Shift</kbd> and counting arrow presses.

The plugin understands Markdown: bold and italic markers, quotes (“English”, „German“, »guillemets«, "straight"), brackets, `code`, `[[links]]`, list bullets, task checkboxes, headings, callouts, tables and code blocks.

## Example

Put the cursor in the word *intuition* and press **Expand selection** again and again:

```markdown
- **Subjective intuition should not be confused with objective condemnation.** An internal instinct …
```

| Press | Selected                                                                       | Status bar                         |
| ----- | ------------------------------------------------------------------------------ | ---------------------------------- |
| 1     | `intuition`                                                                    | Word                               |
| 2     | `Subjective intuition should not be confused with objective condemnation`      | Sentence without final punctuation |
| 3     | `Subjective intuition should not be confused with objective condemnation.`     | Sentence                           |
| 4     | `**Subjective intuition should not be confused with objective condemnation.**` | Including \*\*…\*\*                |
| 5     | the whole bullet text, without the `- `                                        | List item text                     |
| 6     | the whole bullet, with the `- `                                                | List item                          |
| 7     | the whole list                                                                 | List                               |
| 8     | the whole note                                                                 | Whole note                         |

With the cursor in *right* inside `*“this is not right for me”*`:

| Press | Selected                                       |
| ----- | ---------------------------------------------- |
| 1     | `right`                                        |
| 2     | `this is not right for me`                     |
| 3     | `“this is not right for me”`                   |
| 4     | `*“this is not right for me”*`                 |
| 5     | the sentence without the final `.`, then with it |
| …     | list item text, list item, list, note          |

**Shrink selection** walks the same steps back. **Select next of the same kind** then moves the selection along: from a sentence to the next sentence (also into the next bullet), from a word to the next word, from text in quotes to the next text in quotes, from a list item to the next list item. **Select next text in quotes, brackets or formatting** jumps straight to the next `“…”`, `(…)`, `**…**`, `` `…` `` or `[[…]]` and selects what is inside — with the cursor on *Reframing* in the example, one press selects `this is not right for me`.

## Commands

| Command                                                   | What it does                                                                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Expand selection**                                      | Selects the next larger unit around the selection.                                                                         |
| **Shrink selection**                                      | Goes back one expansion step. After a selection made by hand, selects the largest unit inside it.                          |
| **Select next of the same kind**                          | Selects the next word, sentence, quote, list item, section … — whatever kind the current selection is. Without a selection, selects the next word. |
| **Select previous of the same kind**                      | The same, backwards.                                                                                                       |
| **Select next text in quotes, brackets or formatting**    | Selects the text inside the next pair of quotes, brackets or formatting marks. Nested pairs like `*“…”*` select the innermost text; expand from there to include the marks. |
| **Select previous text in quotes, brackets or formatting** | The same, backwards.                                                                                                       |

All commands work with multiple cursors and keep the direction of a backward selection.

## Set up hotkeys

The plugin does not set any hotkeys. Open **Settings → Hotkeys**, search for **Smart Select** and assign your own. Suggestions, similar to VS Code's smart select:

| Command                                  | Windows / Linux          | macOS                     |
| ---------------------------------------- | ------------------------ | ------------------------- |
| Expand selection                         | <kbd>Alt+Shift+→</kbd>   | <kbd>Ctrl+Shift+Cmd+→</kbd> |
| Shrink selection                         | <kbd>Alt+Shift+←</kbd>   | <kbd>Ctrl+Shift+Cmd+←</kbd> |
| Select next of the same kind             | <kbd>Alt+Shift+↓</kbd>   | <kbd>Ctrl+Shift+Cmd+↓</kbd> |
| Select previous of the same kind         | <kbd>Alt+Shift+↑</kbd>   | <kbd>Ctrl+Shift+Cmd+↑</kbd> |
| Select next text in quotes, brackets …   | <kbd>Alt+Shift+]</kbd>   | <kbd>Ctrl+Shift+Cmd+]</kbd> |
| Select previous text in quotes, brackets … | <kbd>Alt+Shift+[</kbd> | <kbd>Ctrl+Shift+Cmd+[</kbd> |

Obsidian marks hotkeys that are already taken in red. On mobile, add the commands to the toolbar under **Settings → Toolbar**.

## What is a unit?

From small to large — steps that would select the same text are skipped:

- **Word**, including words with apostrophes like `don’t`.
- **Compound word**: hyphenated words, file names, URLs (`well-known`, `example.com/path`), and **tags** with `#`.
- **Text inside a pair**, then **the pair with its marks**: quotes `“…” „…“ »…« «…» ‘…’ "…" '…'`, brackets `(…) […] {…}`, formatting `**…** *…* __…__ _…_ ~~…~~ ==…== %%…%%`, `` `code` ``, `$math$`, `[[links]]`, and whole Markdown links `[text](url)`.
- **Part of a sentence** between commas, semicolons, colons or dashes.
- **Sentence without final punctuation**, then the **sentence**. Abbreviations like `e.g.`, `z.B.` or initials like `J. R. R.` don't end a sentence. Formatting that wraps the sentence is left out until the next step.
- **Line** of a paragraph that has line breaks, or of a code block.
- **Paragraph**, **list item text** (without bullet, number or checkbox), **heading text**, **table cell**, **table row**.
- **List item** with its bullet, then the item **with its sub-items**, the **nested list**, the parent item, … the whole **list**.
- **Code** inside a code block, then the code block with its fences. The same for the note's properties (front matter).
- **Blockquote** or **callout**.
- **Section** under each heading, from the innermost heading outward.
- **Whole note**.

## Settings

- **Expansion steps**: turn off steps you don't want to stop at — compound words, parts of sentences, sentences without final punctuation, lines, heading sections.
- **Abbreviations**: words ending with a period that don't end a sentence. Add your own, separated by spaces.
- **Show what is selected**: show the name of the selected unit in the status bar (desktop).

## Install

Until the plugin is in the community catalog:

1. Download `main.js` and `manifest.json` from the latest [release](../../releases), or build them yourself (see below).
2. Copy them to `<your vault>/.obsidian/plugins/smart-select/`.
3. Reload Obsidian and enable **Smart Select** under **Settings → Community plugins**.

You can also install it with the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin by adding this repository.

## Development

```bash
npm install
npm run dev     # rebuild main.js on every change
npm test        # unit tests
npm run lint
npm run build   # type check and production build
```

The selection logic in `src/core/` is plain TypeScript without Obsidian imports, so it can be tested with Node. `src/editor/` and `src/main.ts` connect it to Obsidian's editor. See [AGENTS.md](AGENTS.md) for an overview of the code.

The plugin works offline, reads only the note you are editing, and changes nothing but the selection.
