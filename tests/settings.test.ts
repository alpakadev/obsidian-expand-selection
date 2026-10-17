import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	DEFAULT_ABBREVIATIONS,
	mergeAbbreviations,
	parseAbbreviationInput,
} from '../src/core/abbreviations';
import { DEFAULT_SETTINGS, readSettings, toOptions } from '../src/settings-data';

describe('settings', () => {
	it('uses the defaults when nothing is saved', () => {
		assert.deepEqual(readSettings(null), DEFAULT_SETTINGS);
	});

	it('reads abbreviations saved as one string by version 1.0.0', () => {
		const settings = readSettings({ abbreviations: 'e.g. z.B. usw', clauses: false });
		assert.deepEqual(settings.abbreviations, ['e.g.', 'z.B.', 'usw.']);
		assert.equal(settings.clauses, false);
		assert.ok(toOptions(settings).abbreviations.has('usw'));
	});

	it('ignores values of the wrong type', () => {
		const settings = readSettings({ lines: 'yes', abbreviations: [1, 'Dr.'] });
		assert.equal(settings.lines, true);
		assert.deepEqual(settings.abbreviations, ['Dr.']);
	});

	it('does not share the default list between settings objects', () => {
		const settings = readSettings({});
		settings.abbreviations.push('x.');
		assert.ok(!DEFAULT_ABBREVIATIONS.includes('x.'));
	});
});

describe('abbreviation editing', () => {
	it('adds a period and splits several words', () => {
		assert.deepEqual(parseAbbreviationInput(' usw, etc.  bzw '), ['usw.', 'etc.', 'bzw.']);
		assert.deepEqual(parseAbbreviationInput(' . , '), []);
	});

	it('merges without duplicates, ignoring case, sorted', () => {
		assert.deepEqual(mergeAbbreviations(['Dr.', 'e.g.'], ['dr.', 'ca.']), ['ca.', 'Dr.', 'e.g.']);
	});
});
