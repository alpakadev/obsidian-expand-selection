import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Analysis } from '../src/core/analysis';
import { stepsForSelection } from '../src/core/operations';
import { DEFAULT_OPTIONS } from '../src/core/types';
import { parse } from './helpers';

function picker(marked: string, head: 'start' | 'end' = 'end') {
	const { text, selection } = parse(marked);
	const analysis = new Analysis(text, DEFAULT_OPTIONS);
	const { steps, index } = stepsForSelection(
		analysis,
		selection,
		head === 'end' ? selection.to : selection.from,
	);
	return { rows: steps.map((unit) => text.slice(unit.from, unit.to)), index };
}

describe('steps shown by the picker', () => {
	it('lists every step from the word at the cursor to the whole note', () => {
		const { rows, index } = picker('- **Bo¦ld words.** Rest.');
		assert.equal(index, 0);
		assert.deepEqual(rows, [
			'Bold',
			'Bold words',
			'Bold words.',
			'**Bold words.**',
			'**Bold words.** Rest.',
			'- **Bold words.** Rest.',
		]);
	});

	it('highlights the current selection when it is one of the steps', () => {
		const { rows, index } = picker('- «**Bold words.**» Rest.');
		assert.equal(rows[index], '**Bold words.**');
		assert.equal(rows[0], 'words');
	});

	it('highlights the next larger step for a selection made by hand', () => {
		const { rows, index } = picker('- **Bold «words.** Re»st.');
		assert.equal(rows[index], '**Bold words.** Rest.');
	});
});
