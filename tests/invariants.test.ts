import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Analysis } from '../src/core/analysis';
import {
	expandSelection,
	selectEnclosed,
	selectSibling,
	shrinkSelection,
} from '../src/core/operations';
import { DEFAULT_OPTIONS, Range, containsRange } from '../src/core/types';

const PIECES = [
	'word', 'Satz', 'don’t', 'e.g.', ' ', ' ', '  ', '\n', '\n\n', '. ', '! ', '? ', ', ', '; ', ': ',
	' – ', '—', '**', '*', '_', '__', '~~', '==', '%%', '`', '```', '$', '"', "'", '“', '”', '„',
	'‘', '’', '»', '«', '(', ')', '[', ']', '[[', ']]', '{', '}', '- ', '  - ', '1. ', '> ', '# ',
	'## ', '| ', ' |', '---', '[ ] ', '#tag', 'https://x.io/a_b', '\t', '…', '[^1]',
];

/** Small deterministic pseudo-random generator, so failures can be reproduced. */
function random(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state * 1103515245 + 12345) & 0x7fffffff;
		return state / 0x7fffffff;
	};
}

function randomNote(next: () => number): string {
	let text = '';
	const length = Math.floor(next() * 60);
	for (let i = 0; i < length; i++) text += PIECES[Math.floor(next() * PIECES.length)];
	return text;
}

describe('invariants on random notes', () => {
	it('expanding always grows the selection, other operations stay inside the note', () => {
		const next = random(42);
		for (let n = 0; n < 400; n++) {
			const text = randomNote(next);
			const analysis = new Analysis(text, DEFAULT_OPTIONS);
			const start = Math.floor(next() * (text.length + 1));
			let current: Range = { from: start, to: start };
			const context = () => `note ${JSON.stringify(text)} at ${start}`;
			for (let step = 0; step < 40; step++) {
				const unit = expandSelection(analysis, current);
				if (!unit) break;
				if (current.from !== current.to) assert.ok(containsRange(unit, current), context());
				assert.ok(unit.to - unit.from > current.to - current.from, context());
				assert.ok(unit.from >= 0 && unit.to <= text.length, context());
				const smaller = shrinkSelection(analysis, unit, unit.to);
				if (smaller) assert.ok(containsRange(unit, smaller), context());
				for (const direction of [1, -1] as const) {
					for (const found of [
						selectSibling(analysis, unit, direction),
						selectEnclosed(analysis, unit, direction),
					]) {
						if (found) assert.ok(found.from >= 0 && found.to <= text.length && found.from <= found.to, context());
					}
				}
				current = unit;
			}
			assert.equal(expandSelection(analysis, { from: 0, to: text.length }), null, context());
		}
	});

	it('stays fast on long notes', () => {
		const paragraph =
			'- **Subjective intuition should not be confused with objective condemnation.** An internal instinct, not a verdict. Reframing gut feelings as *“this is not right for me”* helps.\n\n';
		const text = `# Title\n\n${paragraph.repeat(3000)}`;
		const started = Date.now();
		const analysis = new Analysis(text, DEFAULT_OPTIONS);
		const middle = Math.floor(text.length / 2);
		let current: Range = { from: middle, to: middle };
		for (let unit = expandSelection(analysis, current); unit; unit = expandSelection(analysis, current)) {
			current = unit;
		}
		selectSibling(analysis, { from: middle, to: middle + 5 }, 1);
		selectEnclosed(analysis, { from: middle, to: middle }, -1);
		assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms`);
	});
});
