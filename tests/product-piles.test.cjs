const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PRODUCTS, productPile } = require('../.domain-build/art/ProductPileKit.js');
const { compileAsset } = require('../.domain-build/art/MeshCompiler.js');
for (const item of PRODUCTS)
  test(`${item} quantities have supported, distinct harvested models`, () => {
    for (let amount = 1; amount <= 5; amount++) {
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
        if (!['wood', 'stone', 'lettuce'].includes(item) || i <= 3)
          assert.ok(Math.abs(unit.min[1]) < 1e-8, 'loose produce must touch ground');
      }
    }
  });
