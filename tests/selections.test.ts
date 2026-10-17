import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { widenedOverMarkup } from '../src/editor/selections';

const TEXT = '**Moral intellectualizing often masks shame.** Rigid rule-following.';
const at = (text: string) => ({ anchor: TEXT.indexOf(text), head: TEXT.indexOf(text) + text.length });

describe('noticing selections widened over hidden marks', () => {
	it('notices when an edge moved onto ** around the intended text', () => {
		const intended = [at('Moral intellectualizing often masks shame')];
		assert.equal(widenedOverMarkup(TEXT, [at('**Moral intellectualizing often masks shame')], intended), true);
		const sentence = [at('Moral intellectualizing often masks shame.')];
		assert.equal(widenedOverMarkup(TEXT, [at('**Moral intellectualizing often masks shame.**')], sentence), true);
	});

	it('ignores exact selections and any other change', () => {
		const intended = [at('Moral intellectualizing often masks shame')];
		assert.equal(widenedOverMarkup(TEXT, intended, intended), false);
		assert.equal(widenedOverMarkup(TEXT, [at('Rigid')], intended), false);
		assert.equal(widenedOverMarkup(TEXT, [at('Moral intellectualizing often masks shame.')], intended), false);
		assert.equal(widenedOverMarkup(TEXT, [at('Moral')], intended), false);
		assert.equal(widenedOverMarkup(TEXT, [], intended), false);
	});
});
