import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expansionLabels, expansions, shrink } from './helpers';

const ITEM_1 =
	'- **Subjective intuition should not be confused with objective condemnation.** An internal instinct that someone is not a fit indicates subjective incompatibility, not an objective verdict that the other person is malicious. Reframing gut feelings as *“this is not right for me”* eliminates the burden of compiling forensic evidence before stepping away.';
const ITEM_2 =
	'- **Intuition operates faster than rational analysis.** Gut reactions signal interpersonal alignment or danger far quicker than conscious thought can assemble proof. Demanding logical arguments before respecting internal discomfort wastes time and creates avoidable entanglements.';
const NOTE = `${ITEM_1}\n\n${ITEM_2}\n`;

function cursorIn(word: string): string {
	const at = NOTE.indexOf(word) + 2;
	return NOTE.slice(0, at) + '¦' + NOTE.slice(at);
}

describe('expand selection in the example note', () => {
	it('grows from a word in a bold sentence to the whole note', () => {
		assert.deepEqual(expansions(cursorIn('intuition')), [
			'intuition',
			'Subjective intuition should not be confused with objective condemnation',
			'Subjective intuition should not be confused with objective condemnation.',
			'**Subjective intuition should not be confused with objective condemnation.**',
			ITEM_1.slice(2),
			ITEM_1,
			`${ITEM_1}\n\n${ITEM_2}`,
			NOTE,
		]);
		assert.deepEqual(expansionLabels(cursorIn('intuition')), [
			'Word',
			'Sentence without final punctuation',
			'Sentence',
			'Including **…**',
			'List item text',
			'List item',
			'List',
			'Whole note',
		]);
	});

	it('steps through quotes and emphasis one delimiter at a time', () => {
		assert.deepEqual(expansions(cursorIn('right')).slice(0, 6), [
			'right',
			'this is not right for me',
			'“this is not right for me”',
			'*“this is not right for me”*',
			'Reframing gut feelings as *“this is not right for me”* eliminates the burden of compiling forensic evidence before stepping away',
			'Reframing gut feelings as *“this is not right for me”* eliminates the burden of compiling forensic evidence before stepping away.',
		]);
	});

	it('stops at parts of a sentence between commas', () => {
		assert.deepEqual(expansions(cursorIn('instinct')).slice(0, 3), [
			'instinct',
			'An internal instinct that someone is not a fit indicates subjective incompatibility',
			'An internal instinct that someone is not a fit indicates subjective incompatibility, not an objective verdict that the other person is malicious',
		]);
	});

	it('skips steps that are turned off', () => {
		const steps = expansions(cursorIn('instinct'), {
			clauses: false,
			sentenceWithoutPunctuation: false,
		});
		assert.equal(
			steps[1],
			'An internal instinct that someone is not a fit indicates subjective incompatibility, not an objective verdict that the other person is malicious.',
		);
	});
});

describe('expand selection: quotes and brackets', () => {
	it('handles German quotes', () => {
		assert.deepEqual(expansions('Er sagte: „Das ist gu¦t.“ Dann ging er.'), [
			'gut',
			'Das ist gut',
			'Das ist gut.',
			'„Das ist gut.“',
			'Er sagte: „Das ist gut.“',
			'Er sagte: „Das ist gut.“ Dann ging er.',
		]);
	});

	it('handles guillemets', () => {
		assert.deepEqual(expansions('Sie sagte »Hallo W¦elt« und ging.').slice(0, 3), [
			'Welt',
			'Hallo Welt',
			'»Hallo Welt«',
		]);
	});

	it('does not treat apostrophes as quotes', () => {
		assert.deepEqual(expansions('I don’¦t know what ‘that’ means.').slice(0, 2), [
			'don’t',
			'I don’t know what ‘that’ means',
		]);
		assert.deepEqual(expansions('I don’t know what ‘th¦at’ means.').slice(0, 2), [
			'that',
			'‘that’',
		]);
	});

	it('handles straight quotes and parentheses', () => {
		assert.deepEqual(expansions('He said "hel¦lo, friend" and left.').slice(0, 3), [
			'hello',
			'hello, friend',
			'"hello, friend"',
		]);
		assert.deepEqual(expansions('Use this (or th¦at) option.').slice(0, 3), [
			'that',
			'or that',
			'(or that)',
		]);
	});

	it('handles Markdown formatting, code, links and highlights', () => {
		assert.deepEqual(expansions('Run `npm run bu¦ild` now.').slice(0, 3), [
			'build',
			'npm run build',
			'`npm run build`',
		]);
		assert.deepEqual(expansions('See [[My No¦te|alias]] here.').slice(0, 3), [
			'Note',
			'My Note|alias',
			'[[My Note|alias]]',
		]);
		assert.deepEqual(expansions('Read [foo b¦ar](https://example.com/a_b) today.').slice(0, 4), [
			'bar',
			'foo bar',
			'[foo bar]',
			'[foo bar](https://example.com/a_b)',
		]);
		assert.deepEqual(expansions('This is ==very imp¦ortant== stuff.').slice(0, 3), [
			'important',
			'very important',
			'==very important==',
		]);
	});

	it('keeps bold text that spans several sentences together', () => {
		assert.deepEqual(expansions('**First sen¦tence. Second sentence.** Third.'), [
			'sentence',
			'First sentence',
			'First sentence.',
			'First sentence. Second sentence.',
			'**First sentence. Second sentence.**',
			'**First sentence. Second sentence.** Third.',
		]);
	});
});

describe('expand selection: words', () => {
	it('stops at hyphenated words, URLs and tags', () => {
		assert.deepEqual(expansions('A well-kn¦own fact.').slice(0, 2), ['known', 'well-known']);
		assert.deepEqual(expansions('See https://exa¦mple.com/path for more.').slice(0, 2), [
			'example',
			'https://example.com/path',
		]);
		assert.deepEqual(expansions('Tagged #pro¦ject/alpha today.').slice(0, 3), [
			'project',
			'project/alpha',
			'#project/alpha',
		]);
	});

	it('does not end sentences at abbreviations or initials', () => {
		assert.deepEqual(expansions('Use e.g. th¦is one. Next one.').slice(1, 3), [
			'Use e.g. this one',
			'Use e.g. this one.',
		]);
		assert.equal(expansions('Ich mag z.B. Ä¦pfel. Und Birnen.')[2], 'Ich mag z.B. Äpfel.');
		assert.equal(expansions('Read J. R. R. Tol¦kien. Then rest.')[2], 'Read J. R. R. Tolkien.');
	});
});

describe('expand selection: blocks', () => {
	it('walks up nested lists', () => {
		assert.deepEqual(expansions('- parent\n  - chi¦ld one\n  - child two\n    - grandchild\n- sibling\n'), [
			'child',
			'child one',
			'- child one',
			'- child one\n  - child two\n    - grandchild',
			'- parent\n  - child one\n  - child two\n    - grandchild',
			'- parent\n  - child one\n  - child two\n    - grandchild\n- sibling',
			'- parent\n  - child one\n  - child two\n    - grandchild\n- sibling\n',
		]);
	});

	it('excludes task checkboxes and numbers from the item text', () => {
		assert.deepEqual(expansions('- [ ] Buy mi¦lk and eggs\n- [x] Done\n').slice(0, 3), [
			'milk',
			'Buy milk and eggs',
			'- [ ] Buy milk and eggs',
		]);
		assert.deepEqual(expansions('1. First st¦ep.\n2. Second step.\n').slice(2, 4), [
			'First step.',
			'1. First step.',
		]);
	});

	it('walks up heading sections', () => {
		assert.deepEqual(expansions('# A\nintro\n\n## B\nmore te¦xt here.\n\n## C\nend\n').slice(3), [
			'## B\nmore text here.',
			'# A\nintro\n\n## B\nmore text here.\n\n## C\nend',
			'# A\nintro\n\n## B\nmore text here.\n\n## C\nend\n',
		]);
		assert.deepEqual(expansions('## My hea¦ding\n\nBody.'), [
			'heading',
			'My heading',
			'## My heading',
			'## My heading\n\nBody.',
		]);
	});

	it('handles code blocks', () => {
		assert.deepEqual(expansions('Text\n\n```js\nconst x = foo(b¦ar, 2);\nreturn x;\n```\n'), [
			'bar',
			'bar, 2',
			'(bar, 2)',
			'const x = foo(bar, 2);',
			'const x = foo(bar, 2);\nreturn x;',
			'```js\nconst x = foo(bar, 2);\nreturn x;\n```',
			'Text\n\n```js\nconst x = foo(bar, 2);\nreturn x;\n```\n',
		]);
	});

	it('handles callouts', () => {
		assert.deepEqual(expansions('> [!note] Title\n> Some te¦xt here. More text.\n').slice(3), [
			'Some text here. More text.',
			'> [!note] Title\n> Some text here. More text.',
			'> [!note] Title\n> Some text here. More text.\n',
		]);
	});

	it('handles tables', () => {
		assert.deepEqual(expansions('| a | b c¦d |\n| --- | --- |\n| 1 | 2 |\n'), [
			'cd',
			'b cd',
			'| a | b cd |',
			'| a | b cd |\n| --- | --- |\n| 1 | 2 |',
			'| a | b cd |\n| --- | --- |\n| 1 | 2 |\n',
		]);
	});

	it('stops at lines of a paragraph with line breaks', () => {
		assert.deepEqual(expansions('One line\nsecond li¦ne here\nthird.\n\nOther.').slice(1, 3), [
			'second line here',
			'One line\nsecond line here\nthird',
		]);
	});

	it('handles front matter', () => {
		assert.deepEqual(expansions('---\ntitle: My No¦te\ntags: [a, b]\n---\n# H\n').slice(1, 4), [
			'title: My Note',
			'title: My Note\ntags: [a, b]',
			'---\ntitle: My Note\ntags: [a, b]\n---',
		]);
	});

	it('does nothing in an empty note', () => {
		assert.deepEqual(expansions('¦'), []);
	});
});

describe('shrink selection without history', () => {
	it('selects the largest unit inside the selection, at the cursor end', () => {
		assert.equal(shrink('- «Some sentence here. Another one.»'), 'Another one.');
		assert.equal(shrink('«Another one.»'), 'Another one');
		assert.equal(shrink('«intuition»'), null);
	});
});
