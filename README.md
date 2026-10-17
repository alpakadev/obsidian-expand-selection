# Smart Select

Grow, shrink and move your selection in Obsidian one meaningful step at a time — word, text in quotes, sentence, list item, list, section, whole note — instead of dragging the mouse or holding <kbd>Shift</kbd> and counting arrow presses. Or open a small list of all steps at the cursor and pick one.

The plugin understands Markdown: bold and italic markers, quotes (“English”, „German“, »guillemets«, "straight"), brackets, `code`, `[[links]]`, `![[embeds]]`, `[links](https://…)`, list bullets, task checkboxes, headings, callouts, tables and code blocks.

## Example

Put the cursor in the word *intuition* and press **Expand selection** again and again:

```markdown
- **Subjective intuition should not be confused with objective condemnation.** An internal instinct …
```

| Press | Selected                                                                       | Status bar                         |
| ----- | ------------------------------------------------------------------------------ | ---------------------------------- |
| 1     | `intuition`                                                                    | Word                               |
| 2     | `Subjective intuition should not be confused with objective condemnation`      | Sentence without final punctuation |
| 3     | `Subjective intuition should not be confused with objective condemnation.`     | Inside \*\*…\*\*                  |
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

Links and embeds work the same way: in `![[Rising status invites strategic deception]]` the steps are the word, the link text, `[[…]]`, then `![[…]]`. In `[Link name](https://…)` they are the word, `Link name`, then the whole link — or, from inside the URL, the URL, then the whole link.

**Reduce selection** walks the same steps back. It also works on a selection you made with the mouse: it selects the largest step inside it, on the side where the cursor is.

**Select same kind: next** moves the selection along and keeps both the kind and the size you chose:

- a word → the next word; a sentence → the next sentence, also into the next bullet; a list item → the next list item;
- bold text or text in quotes **without** its marks → the next bold, italic, quoted or bracketed text, again without marks. `Moral intellectualizing often masks shame.` → `Investigating family narratives reveals inherited life scripts.` → `patterns across generations`;
- the same **with** its marks → the next one with its marks: `**Moral …**` → `**Investigating …**` → `"patterns across generations"`.

**Select text in quotes, brackets or formatting: next** jumps from anywhere straight into the next `“…”`, `(…)`, `**…**`, `` `…` ``, `[[…]]` or link text — with the cursor on *Reframing* in the example, one press selects `this is not right for me`.

## Choose what to select

**Choose what to select** opens a small list right below the cursor with every step, from the word to the whole note, and a preview of each:

```
 1  Word                                intellectualizing
 2  Sentence without final punctuation  Moral intellectualizing often masks shame
 3  Inside **…**                        Moral intellectualizing often masks shame.
 4  Including **…**                     **Moral intellectualizing often masks shame.**
 5  List item text                      **Moral intellectualizing … stems from fear.
 6  List item                           - **Moral intellectualizing … stems from fear.
 …
 ↑↓ size   ←→ move   ↵ select   esc cancel
```

The highlighted step is selected in the note right away, so you see exactly what you will get.

- <kbd>↑</kbd> <kbd>↓</kbd> or the mouse: bigger or smaller.
- <kbd>←</kbd> <kbd>→</kbd>: the previous or next one of the same kind and size — the next sentence, the next bold text, the next list item.
- <kbd>Enter</kbd>, a click, or a number key <kbd>1</kbd>–<kbd>9</kbd>: keep it. **Shrink selection** afterwards steps down the same list.
- <kbd>Esc</kbd> or a click elsewhere: put the selection back as it was.
- Pressing the hotkey of **Choose what to select**, **Expand selection** or **Shrink selection** while the list is open moves the highlight.

## Commands

| Command                                                   | What it does                                                                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Expand selection**                                      | Selects the next larger unit around the selection.                                                                         |
| **Reduce selection**                                      | Goes back one expansion step. After a selection made by hand, selects the largest unit inside it.                          |
| **Choose what to select**                                 | Shows all steps around the cursor in a list to pick from, with a live preview.                                             |
| **Select same kind: next**                                | Selects the next word, sentence, quote, list item, section … — whatever kind the current selection is, with or without marks as before. Without a selection, selects the next word. |
| **Select same kind: previous**                            | The same, backwards.                                                                                                       |
| **Select text in quotes, brackets or formatting: next**   | Selects the text inside the next pair of quotes, brackets or formatting marks. Nested pairs like `*“…”*` select the innermost text; expand from there to include the marks. |
| **Select text in quotes, brackets or formatting: previous** | The same, backwards.                                                                                                       |

All commands work with multiple cursors and keep the direction of a backward selection.

## Set up hotkeys

The plugin does not set any hotkeys. Open **Settings → Hotkeys**, search for **Smart Select** and assign your own. The commands are named so that Obsidian's alphabetical list keeps opposites together: Expand next to Reduce, next above previous. Suggestions, similar to VS Code's smart select (`.` and `,` are single keys on German and US keyboards alike):

| Command                                    | Windows / Linux        | macOS                       |
| ------------------------------------------ | ---------------------- | --------------------------- |
| Expand selection                           | <kbd>Alt+Shift+→</kbd> | <kbd>Ctrl+Shift+Cmd+→</kbd> |
| Reduce selection                           | <kbd>Alt+Shift+←</kbd> | <kbd>Ctrl+Shift+Cmd+←</kbd> |
| Choose what to select                      | <kbd>Alt+Shift+S</kbd> | <kbd>Ctrl+Shift+Cmd+S</kbd> |
| Select same kind: next                     | <kbd>Alt+Shift+↓</kbd> | <kbd>Ctrl+Shift+Cmd+↓</kbd> |
| Select same kind: previous                 | <kbd>Alt+Shift+↑</kbd> | <kbd>Ctrl+Shift+Cmd+↑</kbd> |
| Select text in quotes, …: next             | <kbd>Alt+Shift+.</kbd> | <kbd>Ctrl+Shift+Cmd+.</kbd> |
| Select text in quotes, …: previous         | <kbd>Alt+Shift+,</kbd> | <kbd>Ctrl+Shift+Cmd+,</kbd> |

Obsidian marks hotkeys that are already taken in red. On mobile, add the commands to the toolbar under **Settings → Toolbar**.

## What is a unit?

From small to large — steps that would select the same text are skipped:

- **Word**, including words with apostrophes like `don’t`.
- **Compound word**: hyphenated words, file names, URLs (`well-known`, `example.com/path`), and **tags** with `#`.
- **Link parts**: the target or the shown text of `[[target|text]]`, the URL of `[text](url)`.
- **Text inside a pair**, then **the pair with its marks**: quotes `“…” „…“ »…« «…» ‘…’ "…" '…'`, brackets `(…) […] {…}`, formatting `**…** *…* __…__ _…_ ~~…~~ ==…== %%…%%`, `` `code` ``, `$math$`, `[[links]]`, then `![[embeds]]` with their `!`; Markdown links `[text](url)` and images `![text](url)`.
- **Part of a sentence** between commas, semicolons, colons or dashes.
- **Sentence without final punctuation**, then the **sentence**. Abbreviations like `e.g.`, `z.B.` or initials like `J. R. R.` don't end a sentence. Formatting that wraps the sentence is left out until the next step. A sentence that is all bold counts as bold text, so “next” goes to the next bold text.
- **Line** of a paragraph that has line breaks, or of a code block.
- **Paragraph**, **list item text** (without bullet, number or checkbox), **heading text**, **table cell**, **table row**.
- **List item** with its bullet, then the item **with its sub-items**, the **nested list**, the parent item, … the whole **list**.
- **Code** inside a code block, then the code block with its fences. The same for the note's properties (front matter).
- **Blockquote** or **callout**.
- **Section** under each heading, from the innermost heading outward.
- **Whole note**.

## Settings

- **Expansion steps**: turn off steps you don't want to stop at — compound words, parts of sentences, sentences without final punctuation, lines, heading sections.
- **Abbreviations**: words ending with a period that don't end a sentence, one list per language. **Edit** opens them: pick a language, add words (it tells you when a word is already there), remove a word with its ×, turn a language off, or **Add a language** of your own. English and German come filled in; **Restore** adds back built-in words you removed and keeps your own words, languages and on/off choices. Removing a word that another language you use still has tells you so.
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

The selection logic in `src/core/` is plain TypeScript without Obsidian imports, so it can be tested with Node. `src/editor/`, `src/ui/` and `src/main.ts` connect it to Obsidian. See [AGENTS.md](AGENTS.md) for an overview of the code.

### How it should feel

The behavior follows what people know from other editors:

- Each press grows the selection by one meaningful unit, inside before outside — like Word's <kbd>F8</kbd> (word, sentence, paragraph, document), JetBrains' Extend Selection, VS Code's smart select and Emacs' expand-region (inside quotes, then the quotes).
- Reducing retraces the exact steps back, like <kbd>Shift+F8</kbd> in Word or Shrink Selection in JetBrains.
- "Next" stays at the same level, like Helix' <kbd>Alt+n</kbd> (select next sibling), and keeps whether the marks were included.
- Steps that would not change the selection are skipped, and the status bar names what is selected.

The plugin works offline, reads only the note you are editing, and changes nothing but the selection.
