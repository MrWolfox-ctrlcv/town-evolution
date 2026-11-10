const test = require('node:test');
const assert = require('node:assert/strict');
const expected = require('../scripts/preview/expected-recipes.cjs');
const { ACTIVE_RECIPE_DEFINITIONS } = require('../.domain-build/domain/recipes');
test('browser handbook acceptance enumerates all 38 approved recipes including bridge and sapling planting', () => {
  assert.equal(expected.length, 38);
  assert.equal(new Set(expected).size, 38);
  assert.ok(expected.includes('build-wooden-bridge'));
  assert.ok(expected.includes('plant-sapling'));
  assert.deepEqual(
    ACTIVE_RECIPE_DEFINITIONS.map((recipe) => recipe.id),
    expected,
  );
});
