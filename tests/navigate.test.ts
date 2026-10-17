import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { enclosed, siblings } from './helpers';

const NOTE = `- **Subjective intuition should not be confused with objective condemnation.** An internal instinct that someone is not a fit indicates subjective incompatibility, not an objective verdict that the other person is malicious. Reframing gut feelings as *“this is not right for me”* eliminates the burden of compiling forensic evidence before stepping away.

- **Intuition operates faster than rational analysis.** Gut reactions signal interpersonal alignment or danger far quicker than conscious thought can assemble proof.
`;

function cursorIn(word: string): string {
	const at = NOTE.indexOf(word) + 2;
	return NOTE.slice(0, at) + '¦' + NOTE.slice(at);
}

describe('select next/previous unit of the same kind', () => {
	it('moves by words from a cursor', () => {
		assert.deepEqual(siblings(cursorIn('intuition'), 0, 3), ['should', 'not', 'be']);
		assert.deepEqual(siblings(cursorIn('intuition'), 0, 2, -1), ['Subjective']);
	});

	it('moves by sentences across list items, keeping the variant', () => {
		assert.deepEqual(siblings(cursorIn('instinct'), 4, 3), [
			'Reframing gut feelings as *“this is not right for me”* eliminates the burden of compiling forensic evidence before stepping away.',
			'Intuition operates faster than rational analysis.',
			'Gut reactions signal interpersonal alignment or danger far quicker than conscious thought can assemble proof.',
		]);
		assert.deepEqual(siblings(cursorIn('intuition'), 2, 1), [
			'An internal instinct that someone is not a fit indicates subjective incompatibility, not an objective verdict that the other person is malicious',
		]);
		assert.deepEqual(siblings(cursorIn('Gut'), 3, 2, -1), [
			'Intuition operates faster than rational analysis.',
			'Reframing gut feelings as *“this is not right for me”* eliminates the burden of compiling forensic evidence before stepping away.',
		]);
	});

	it('moves by list items', () => {
		assert.deepEqual(siblings(cursorIn('intuition'), 6, 2), [
			'- **Intuition operates faster than rational analysis.** Gut reactions signal interpersonal alignment or danger far quicker than conscious thought can assemble proof.',
		]);
	});

	it('moves from text in delimiters to the next text in delimiters, with or without the marks', () => {
		const text = '“One a” and (x y) and “Tw¦o b” and “Three c”.';
		assert.deepEqual(siblings(text, 2, 2), ['Three c']);
		assert.deepEqual(siblings(text, 2, 2, -1), ['x y', 'One a']);
		assert.deepEqual(siblings(text, 3, 1), ['“Three c”']);
		assert.deepEqual(siblings(text, 3, 2, -1), ['(x y)', '“One a”']);
	});

	it('moves between list items, items with sub-items, and sections of the same level', () => {
		assert.deepEqual(siblings('- a\n  - b¦1\n  - b2\n    - c\n- d\n', 2, 3), ['- b2', '- c', '- d']);
		assert.deepEqual(siblings('- ¦a\n  - x\n- b\n  - y\n- c\n', 3, 2), ['- b\n  - y', '- c']);
		const note = '# A\n## B\ntext¦\n## C\nmore\n# D\n## E\n';
		assert.deepEqual(siblings(note, 2, 2), ['## C\nmore', '## E']);
		assert.deepEqual(siblings(note, 3, 1), ['# D\n## E']);
	});
});

describe('select next/previous: bold summaries and quotes', () => {
	const NOTES = `- **Moral intellectualizing often masks shame.** Rigid rule-following and analytical ethical systems frequently stem from childhood fear of being deemed bad rather than intrinsic empathy. Genuine generosity arises spontaneously from connection.
- **Investigating family narratives reveals inherited life scripts.** Gathering detailed personal memories uncovers behavioral "patterns across generations". Understanding this lineage clarifies which habits to break.
`;
	const at = (word: string) => {
		const i = NOTES.indexOf(word) + 2;
		return NOTES.slice(0, i) + '¦' + NOTES.slice(i);
	};

	it('goes from bold text to the next bold or quoted text, without the marks', () => {
		assert.deepEqual(siblings(at('intellectualizing'), 3, 2), [
			'Investigating family narratives reveals inherited life scripts.',
			'patterns across generations',
		]);
	});

	it('goes from bold text with its marks to the next one with its marks', () => {
		assert.deepEqual(siblings(at('intellectualizing'), 4, 2), [
			'**Investigating family narratives reveals inherited life scripts.**',
			'"patterns across generations"',
		]);
	});

	it('keeps moving by sentences when it started on a plain sentence', () => {
		assert.deepEqual(siblings(at('analytical'), 3, 3), [
			'Genuine generosity arises spontaneously from connection.',
			'Investigating family narratives reveals inherited life scripts.',
			'Gathering detailed personal memories uncovers behavioral "patterns across generations".',
		]);
	});

	it('moves between links', () => {
		const text = 'See [one](a.md), **bold**, [two](https://b.io/x) and [[three]].';
		assert.deepEqual(enclosed(text.replace('See', 'S¦ee'), 4), ['one', 'bold', 'two', 'three']);
		assert.deepEqual(siblings(text.replace('a.md', 'a.¦md'), 2, 1), ['https://b.io/x']);
	});
});

describe('select next/previous enclosed text', () => {
	it('jumps to the innermost text of the next quotes, brackets or formatting', () => {
		assert.deepEqual(enclosed(cursorIn('Reframing'), 2), [
			'this is not right for me',
			'Intuition operates faster than rational analysis.',
		]);
		assert.deepEqual(enclosed(cursorIn('Gut'), 3, -1), [
			'Intuition operates faster than rational analysis.',
			'this is not right for me',
			'Subjective intuition should not be confused with objective condemnation.',
		]);
	});

	it('skips empty pairs and stops at the end of the note', () => {
		assert.deepEqual(enclosed('¦a () b [c] d', 3), ['c']);
	});
});
