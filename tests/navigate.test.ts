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
		assert.deepEqual(siblings(cursorIn('intuition'), 3, 3), [
			'An internal instinct that someone is not a fit indicates subjective incompatibility, not an objective verdict that the other person is malicious.',
			'Reframing gut feelings as *“this is not right for me”* eliminates the burden of compiling forensic evidence before stepping away.',
			'Intuition operates faster than rational analysis.',
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

	it('moves to the next text in the same kind of delimiters', () => {
		const text = '“One a” and (x) and “Tw¦o b” and “Three c”.';
		assert.deepEqual(siblings(text, 2, 2), ['Three c']);
		assert.deepEqual(siblings(text, 2, 2, -1), ['One a']);
		assert.deepEqual(siblings(text, 3, 1), ['“Three c”']);
	});

	it('moves between list items, items with sub-items, and sections of the same level', () => {
		assert.deepEqual(siblings('- a\n  - b¦1\n  - b2\n    - c\n- d\n', 2, 3), ['- b2', '- c', '- d']);
		assert.deepEqual(siblings('- ¦a\n  - x\n- b\n  - y\n- c\n', 3, 2), ['- b\n  - y', '- c']);
		const note = '# A\n## B\ntext¦\n## C\nmore\n# D\n## E\n';
		assert.deepEqual(siblings(note, 2, 2), ['## C\nmore', '## E']);
		assert.deepEqual(siblings(note, 3, 1), ['# D\n## E']);
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
