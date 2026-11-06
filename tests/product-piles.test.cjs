const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PRODUCTS, productPile } = require('../.domain-build/art/ProductPileKit.js');
const { stackLimitFor } = require('../.domain-build/domain/foundation.js');
const { compileAsset } = require('../.domain-build/art/MeshCompiler.js');
for (const item of PRODUCTS)
  test(`${item} quantities have supported, distinct harvested models`, () => {
    for (let amount = 1; amount <= stackLimitFor(item); amount++) {
      const recipe = productPile(item, amount),
        mesh = compileAsset(recipe);
      assert.ok(Math.abs(mesh.min[1]) < 1e-8, 'pile must touch ground');
      assert.ok(
        mesh.max[0] - mesh.min[0] <= 1 && mesh.max[2] - mesh.min[2] <= 1,
        'stay within one tile',
      );
      assert.ok(mesh.indices.length / 3 <= 6000, 'bounded geometry budget');
      assert.equal(new Set(recipe.parts.map((p) => p.name.split('-')[1])).size, amount);
      for (let i = 1; i <= amount; i++) {
        const parts = recipe.parts.filter((p) => p.name.startsWith(`unit-${i}-`));
        const unit = compileAsset({ ...recipe, parts });
        assert.ok(unit.min[1] >= -1e-8);
        const baseCount = ['wheat', 'vegetable', 'rice'].includes(item) ? 4 : 3;
        if (
          !['wood', 'stone', 'soil', 'wheat', 'vegetable', 'rice'].includes(item) ||
          i <= baseCount
        )
          assert.ok(Math.abs(unit.min[1]) < 1e-8, 'base units must touch ground');
      }
    }
  });

test('model quantities cover exactly the business stack limits and reject invalid counts', () => {
  const { ASSETS } = require('../.domain-build/art/AssetCatalog.js');
  for (const item of PRODUCTS) {
    for (let amount = 1; amount <= stackLimitFor(item); amount++)
      assert.ok(ASSETS[`pile-${item}-${amount}`]);
    assert.equal(ASSETS[`pile-${item}-${stackLimitFor(item) + 1}`], undefined);
    for (const amount of [0, -1, 1.5, stackLimitFor(item) + 1])
      assert.throws(() => productPile(item, amount), RangeError);
  }
});
