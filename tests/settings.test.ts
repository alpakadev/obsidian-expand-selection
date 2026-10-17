import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	BUILT_IN_ABBREVIATIONS,
	abbreviationSet,
	addAbbreviations,
	defaultAbbreviationLists,
	otherListsWith,
	parseAbbreviationInput,
	restoreBuiltIn,
	splitIntoLanguages,
} from '../src/core/abbreviations';
import { DEFAULT_SETTINGS, readSettings, toOptions } from '../src/settings-data';

describe('settings', () => {
	it('uses the defaults when nothing is saved', () => {
		assert.deepEqual(readSettings(null), DEFAULT_SETTINGS);
		assert.deepEqual(
			readSettings(null).abbreviations.map((list) => list.language),
			['English', 'German'],
		);
	});

	it('splits abbreviations saved as one string (1.0.0) into languages', () => {
		const settings = readSettings({ abbreviations: 'e.g. z.B. usw', clauses: false });
		assert.deepEqual(settings.abbreviations, [
			{ language: 'English', words: ['e.g.'], enabled: true },
			{ language: 'German', words: ['z.B.'], enabled: true },
			{ language: 'Other', words: ['usw.'], enabled: true },
		]);
		assert.equal(settings.clauses, false);
		assert.ok(toOptions(settings).abbreviations.has('usw'));
	});

	it('splits a saved single list, keeping words the user removed removed', () => {
		const settings = readSettings({ abbreviations: ['Dr.', 'bzw.', 'e.g.'] });
		assert.deepEqual(settings.abbreviations[0]!.words, ['Dr.', 'e.g.']);
		assert.deepEqual(settings.abbreviations[1]!.words, ['bzw.', 'Dr.']);
	});

	it('reads lists per language and ignores broken entries', () => {
		const settings = readSettings({
			lines: 'yes',
			abbreviations: [{ language: 'French', words: ['M.', 3], enabled: false }, { words: [] }, 7],
		});
		assert.equal(settings.lines, true);
		assert.deepEqual(settings.abbreviations, [{ language: 'French', words: ['M.'], enabled: false }]);
	});

	it('keeps the words of a mixed list and falls back to the built-in lists when nothing is usable', () => {
		const mixed = readSettings({ abbreviations: [1, 'Dr.'] });
		assert.deepEqual(mixed.abbreviations.map((list) => [list.language, list.words]), [
			['English', ['Dr.']],
			['German', ['Dr.']],
		]);
		assert.deepEqual(readSettings({ abbreviations: [1, {}, { language: ' ', words: [] }] }).abbreviations, defaultAbbreviationLists());
		assert.deepEqual(readSettings({ abbreviations: [] }).abbreviations, defaultAbbreviationLists());
	});

	it('only uses lists that are turned on', () => {
		const lists = defaultAbbreviationLists();
		lists[1]!.enabled = false;
		const set = abbreviationSet(lists);
		assert.ok(set.has('e.g'));
		assert.ok(!set.has('bzw'));
		assert.ok(set.has('dr'), 'Dr. is also English');
	});

	it('does not share the built-in lists between settings objects', () => {
		const settings = readSettings({});
		settings.abbreviations[0]!.words.push('x.');
		assert.ok(!BUILT_IN_ABBREVIATIONS[0]!.words.includes('x.'));
		assert.ok(!readSettings({}).abbreviations[0]!.words.includes('x.'));
	});
});

describe('abbreviation editing', () => {
	it('adds a period and splits several words', () => {
		assert.deepEqual(parseAbbreviationInput(' usw, etc.  bzw '), ['usw.', 'etc.', 'bzw.']);
		assert.deepEqual(parseAbbreviationInput(' . , '), []);
	});

	it('reports words that are already in the list, ignoring case', () => {
		const result = addAbbreviations(['Dr.', 'e.g.'], ['dr.', 'ca.', 'E.G.', 'ca.']);
		assert.deepEqual(result.words, ['ca.', 'Dr.', 'e.g.']);
		assert.deepEqual(result.added, ['ca.']);
		assert.deepEqual(result.duplicates, ['Dr.', 'e.g.']);
	});

	it('keeps words with different accents apart', () => {
		assert.deepEqual(addAbbreviations(['o.ä.'], ['o.a.']).added, ['o.a.']);
	});

	it('restores removed built-in words without touching anything else', () => {
		const lists = defaultAbbreviationLists();
		lists[0]!.words = ['e.g.', 'etc.'];
		lists[1]!.enabled = false;
		lists.push({ language: 'French', words: ['M.'], enabled: true });
		const { lists: restored, restored: count } = restoreBuiltIn(lists);
		assert.equal(count, BUILT_IN_ABBREVIATIONS[0]!.words.length - 1);
		assert.ok(restored[0]!.words.includes('etc.'), 'own words stay');
		assert.ok(restored[0]!.words.includes('Dr.'), 'removed words come back');
		assert.equal(restored[1]!.enabled, false, 'turned-off lists stay off');
		assert.deepEqual(restored[2], { language: 'French', words: ['M.'], enabled: true });
		assert.equal(restoreBuiltIn(restored).restored, 0);
	});

	it('finds other lists that still contain a word', () => {
		const lists = defaultAbbreviationLists();
		assert.deepEqual(otherListsWith(lists, lists[0]!, 'dr.').map((l) => l.language), ['German']);
		lists[1]!.enabled = false;
		assert.deepEqual(otherListsWith(lists, lists[0]!, 'Dr.'), []);
	});

	it('puts unknown words of earlier versions under Other', () => {
		assert.deepEqual(
			splitIntoLanguages(['etc.']).map((list) => [list.language, list.words]),
			[['English', []], ['German', []], ['Other', ['etc.']]],
		);
	});
});
