import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Analysis } from '../src/core/analysis';
import { expandSelection, selectSibling } from '../src/core/operations';
import { jumpNoun, pickerRows, rowPreview, versionsOf } from '../src/core/rows';
import { DEFAULT_OPTIONS, Range, SelectionOptions, sameRange } from '../src/core/types';
import { parse } from './helpers';

function rows(marked: string, options: Partial<SelectionOptions> = {}, prefer: Parameters<typeof pickerRows>[3] = null) {
	const { text, selection } = parse(marked);
	const analysis = new Analysis(text, { ...DEFAULT_OPTIONS, ...options });
	const result = pickerRows(analysis, selection, selection.to, prefer);
	const slice = (r: Range) => text.slice(r.from, r.to);
	return {
		rows: result.rows,
		index: result.index,
		startsWide: result.wide,
		labels: result.rows.map((row) => row.label),
		tight: result.rows.map((row) => slice(row.tight)),
		wide: result.rows.map((row) => slice(row.wide)),
		marks: result.rows.map((row) => row.marks ?? ''),
		analysis,
		text,
	};
}

const NOTE =
	'Notes on shame.\n\n- **Moral intellectualizing often masks shame.** Rigid rule-following stems from fear.\n- **Investigating family narratives.** More.\n- Third.\n';
const at = (word: string) => NOTE.replace(word, word.slice(0, 2) + '¦' + word.slice(2));

describe('picker rows', () => {
	it('has one row per thing, with and without marks', () => {
		const r = rows(at('intellectualizing'));
		assert.deepEqual(r.labels, ['Word', 'Sentence', 'Bold', 'Line', 'List', 'Whole note']);
		assert.deepEqual(r.marks, ['', '.', '**…**', '-', '', '']);
		assert.equal(r.tight[1], 'Moral intellectualizing often masks shame');
		assert.equal(r.wide[1], 'Moral intellectualizing often masks shame.');
		assert.equal(r.tight[2], 'Moral intellectualizing often masks shame.');
		assert.equal(r.wide[2], '**Moral intellectualizing often masks shame.**');
		assert.equal(r.tight[3], '**Moral intellectualizing often masks shame.** Rigid rule-following stems from fear.');
		assert.equal(r.wide[3], '- **Moral intellectualizing often masks shame.** Rigid rule-following stems from fear.');
		assert.deepEqual([r.index, r.startsWide], [0, true]);
	});

	it('keeps every Expand step reachable', () => {
		const r = rows(at('intellectualizing'));
		let current: Range = { from: r.text.indexOf('intellectualizing') + 2, to: r.text.indexOf('intellectualizing') + 2 };
		for (let unit = expandSelection(r.analysis, current); unit; unit = expandSelection(r.analysis, current)) {
			const step = unit;
			assert.ok(
				r.rows.some((row) => sameRange(row.tight, step) || sameRange(row.wide, step)),
				`step ${r.text.slice(step.from, step.to)}`,
			);
			current = unit;
		}
	});

	it('keeps a nested bullet apart from its line', () => {
		const r = rows('- Item\n  - **Nested child.** More *“this is not ri¦ght for me”* here.\n');
		assert.deepEqual(r.labels, ['Word', 'Quote', 'Italic', 'Sentence', 'List item', 'Line', 'List item with sub-items', 'Whole note']);
		assert.equal(r.wide[5], '  - **Nested child.** More *“this is not right for me”* here.');
		assert.equal(r.marks[5], '');
	});

	it('pairs the first line of a longer list item with its bullet', () => {
		const topNote = '- *8:50* Before just shows t¦he Timestamp.\n*Somewhere* Before just shows the word.\n';
		const nestedNote = '- Item\n  - *8:50* Nested li¦ne\n  continued\n';
		const top = rows(topNote);
		assert.deepEqual(top.labels, ['Word', 'Sentence', 'Line', 'List item', 'Whole note']);
		assert.deepEqual([top.tight[2], top.wide[2]], [
			'*8:50* Before just shows the Timestamp.',
			'- *8:50* Before just shows the Timestamp.',
		]);
		assert.equal(top.tight[3], '*8:50* Before just shows the Timestamp.\n*Somewhere* Before just shows the word.');
		const nested = rows(nestedNote);
		assert.deepEqual(nested.labels, ['Word', 'Line with bullet', 'Line', 'List item', 'List item with sub-items', 'Whole note']);
		assert.deepEqual([nested.tight[1], nested.wide[1]], ['*8:50* Nested line', '- *8:50* Nested line']);
		for (const [r, note] of [[top, topNote], [nested, nestedNote]] as const) {
			let current: Range = parse(note).selection;
			for (let unit = expandSelection(r.analysis, current); unit; unit = expandSelection(r.analysis, current)) {
				const step = unit;
				assert.ok(r.rows.some((row) => sameRange(row.tight, step) || sameRange(row.wide, step)), r.text.slice(step.from, step.to));
				current = unit;
			}
		}
	});

	it('folds headings and quoted lines into Line', () => {
		const heading = rows('## To¦pic\n\nBody.\n');
		assert.deepEqual(heading.labels, ['Word', 'Line', 'Section (##)', 'Whole note']);
		assert.deepEqual([heading.tight[1], heading.wide[1], heading.marks[1]], ['Topic', '## Topic', '##']);
		const quote = rows('> Quoted line one\n> sec¦ond line.\n');
		assert.deepEqual(quote.labels, ['Word', 'Line', 'Sentence', 'Blockquote', 'Whole note']);
		assert.deepEqual([quote.tight[1], quote.wide[1], quote.marks[1]], ['second line.', '> second line.', '>']);
	});

	it('shows Line only for a selection on one line', () => {
		assert.deepEqual(rows('Hello wo¦rld.\n').labels, ['Word', 'Sentence', 'Line', 'Whole note']);
		assert.ok(!rows('- «a\n- b»').labels.includes('Line'));
		assert.ok(!rows('a\n¦\nb').labels.includes('Line'));
		const triple = rows('«Hello world.\n»Next.\n');
		assert.equal(triple.labels[triple.index], 'Line');
	});

	it('names links, embeds and code', () => {
		assert.deepEqual(rows('- ![[Rising sta¦tus]]\n').labels, ['Word', 'Link', 'Embed', 'Line', 'Whole note']);
		const link = rows('Read [Link na¦me](https://x.io) now.\n');
		assert.deepEqual([link.labels[1], link.marks[1]], ['Link', '[…](…)']);
		const code = rows('```js\n  const a¦ = 1;\n```\n');
		assert.deepEqual(code.labels, ['Word', 'Line', 'Code block', 'Whole note']);
		assert.deepEqual([code.marks[1], code.marks[2]], ['⇥', '```js…```']);
	});

	it('opens on the row of the current selection', () => {
		const bold = rows('- «**Moral intellectualizing often masks shame.**» Rigid.\n');
		assert.deepEqual([bold.labels[bold.index], bold.startsWide], ['Bold', true]);
		const inner = rows('- **«Moral intellectualizing often masks shame.»** Rigid.\n');
		assert.deepEqual([inner.labels[inner.index], inner.startsWide], ['Sentence', true], 'a wide match wins');
		const preferred = rows('- **«Moral intellectualizing often masks shame.»** Rigid.\n', {}, { kind: 'pair-inner', key: 'emphasis' });
		assert.deepEqual([preferred.labels[preferred.index], preferred.startsWide], ['Bold', false]);
	});

	it('follows the settings', () => {
		const r = rows(at('intellectualizing'), { sentenceWithoutPunctuation: false });
		assert.equal(r.marks[1], '');
	});

	it('finds the other version of a unit and names jumps', () => {
		const r = rows(at('intellectualizing'));
		const versions = versionsOf(r.analysis, r.rows[2]!.wide);
		assert.equal(versions?.marks, '**…**');
		assert.equal(jumpNoun(r.rows[1]!.wide), 'sentence');
		assert.equal(jumpNoun(r.rows[2]!.wide), 'text in quotes, brackets or formatting, with marks');
		assert.equal(jumpNoun(r.rows[3]!.wide), 'line');
		assert.equal(jumpNoun(r.rows[5]!.wide), null);
		assert.deepEqual(rowPreview(r.text, r.rows[4]!.wide), { text: '- **Moral intellectualizing…', lines: 3 });
	});

	it('jumps by whole lines, skipping blank ones', () => {
		const text = 'one\n\n  two\nthree';
		const analysis = new Analysis(text, DEFAULT_OPTIONS);
		const line = { kind: 'line' as const, key: 'whole' };
		const next = selectSibling(analysis, { from: 0, to: 3 }, 1, line);
		assert.equal(next && text.slice(next.from, next.to), '  two');
		const back = next && selectSibling(analysis, next, -1, line);
		assert.equal(back && text.slice(back.from, back.to), 'one');
	});
});
