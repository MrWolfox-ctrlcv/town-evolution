const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  CROP_KEYS,
  createGame,
  dispatch,
  importSave,
  exportSave,
} = require('../.domain-build/domain/game');
const { productPile } = require('../.domain-build/art/ProductPileKit');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');
const principal = {
  vegetable: 'carrot-root',
  wheat: 'twine',
  lettuce: 'lettuce-heart',
  rice: 'rice-sheaf-twine',
};
for (const crop of CROP_KEYS) {
  test(`${crop} has exactly one harvested good per count within a ground heap through ten`, () => {
    let previous = null;
    for (let amount = 1; amount <= 10; amount++) {
      const recipe = productPile(crop, amount),
        mesh = compileAsset(recipe);
      assert.equal(
        recipe.parts.filter((p) => p.name.endsWith(`-${principal[crop]}`)).length,
        amount,
      );
      assert.ok(recipe.parts.every((p) => !/text|label|badge|number/i.test(p.name)));
      const units = Array.from({ length: amount }, (_, i) =>
        compileAsset({
          ...recipe,
          parts: recipe.parts.filter((p) => p.name.startsWith(`unit-${i + 1}-`)),
        }),
      );
      assert.ok(Math.abs(mesh.min[1]) < 1e-8, 'the heap rests on the ground');
      for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        assert.ok(unit.min[1] >= -1e-8);
        for (const axis of [0, 2]) assert.ok(unit.min[axis] >= -0.5 && unit.max[axis] <= 0.5);
        const overlaps = (other) =>
          [0, 2].every(
            (axis) =>
              Math.min(unit.max[axis], other.max[axis]) -
                Math.max(unit.min[axis], other.min[axis]) >
              1e-7,
          );
        if (crop === 'lettuce') {
          assert.ok(Math.abs(unit.min[1]) < 1e-8);
          for (let j = 0; j < i; j++) assert.equal(overlaps(units[j]), false);
        } else if (i < 4) {
          assert.ok(Math.abs(unit.min[1]) < 1e-8, 'the base layer rests on the ground');
        } else {
          assert.ok(
            unit.min[1] > 0,
            'extra goods stack upward instead of forming a new ground row',
          );
          assert.ok(
            units
              .slice(0, i)
              .some(
                (lower) =>
                  lower.min[1] < unit.min[1] && lower.max[1] >= unit.min[1] && overlaps(lower),
              ),
            `good ${i + 1} must rest on an earlier layer, not float`,
          );
        }
      }
      if (crop !== 'lettuce') {
        assert.ok(mesh.max[1] < 0.55, 'harvested goods stay a low heap, not standing plants');
        assert.ok(mesh.max[2] - mesh.min[2] < 0.75, 'counts share one compact footprint');
        const layers = new Set(units.map((unit) => unit.min[1].toFixed(3)));
        assert.equal(layers.size, amount <= 4 ? 1 : amount <= 7 ? 2 : amount <= 9 ? 3 : 4);
        const roots = recipe.parts.filter((p) =>
          p.name.endsWith(
            crop === 'wheat' ? '-cut-straw' : crop === 'rice' ? '-rice-cut-straw' : '-carrot-root',
          ),
        );
        assert.ok(
          roots.every((p) => p.rotation[0] === 90),
          'cut goods lie horizontally',
        );
        if (amount > 1)
          assert.ok(
            new Set(roots.map((p) => p.rotation[1])).size > 1,
            'loose goods fan out naturally',
          );
      }
      if (previous) assert.notDeepEqual(mesh.positions, previous);
      previous = mesh.positions;
      assert.ok(mesh.positions.length / 3 < 6000);
      assert.ok(mesh.indices.length / 3 < 6000);
    }
  });
  test(`${crop} partial merges fill ten, conserve surplus, reload and reject the eleventh`, () => {
    const state = createGame(0, 1, 1);
    state.trees = [];
    state.groundStacks = [
      { x: 8, z: 5, item: crop, amount: 7 },
      { x: 11, z: 5, item: crop, amount: 7 },
    ];
    const before = JSON.stringify(state);
    const merged = dispatch(state, { type: 'moveStack', fromX: 8, fromZ: 5, x: 11, z: 5 }, 0);
    assert.equal(merged.ok, true, merged.error);
    assert.equal(JSON.stringify(state), before);
    assert.deepEqual(
      merged.state.groundStacks.map((pile) => pile.amount),
      [4, 10],
    );
    assert.deepEqual(importSave(exportSave(merged.state), 0), merged.state);
    const full = dispatch(merged.state, { type: 'moveStack', fromX: 8, fromZ: 5, x: 11, z: 5 }, 0);
    assert.equal(full.ok, false);
    assert.equal(full.state, merged.state);
    const invalid = structuredClone(merged.state);
    invalid.groundStacks[1].amount = 11;
    assert.throws(() => importSave(JSON.stringify(invalid), 0));
  });
}
test('existing five-crop ground piles preserve quantity when imported under the ten-item policy', () => {
  const state = createGame(0, 1, 1);
  state.trees = [];
  state.groundStacks = [{ x: 8, z: 5, item: 'vegetable', amount: 5 }];
  const text = exportSave(state);
  assert.equal(importSave(text, 0).groundStacks[0].amount, 5);
});

for (const crop of ['wheat', 'vegetable', 'rice'])
  test(`${crop} overlapping heaps leave every physical unit visible from the game camera`, () => {
    const { visibleUnitPixels } = require('./helpers/pile-projection.cjs');
    for (let amount = 1; amount <= 10; amount++) {
      const recipe = productPile(crop, amount);
      const units = Array.from({ length: amount }, (_, i) =>
        compileAsset({
          ...recipe,
          parts: recipe.parts.filter((p) => p.name.startsWith(`unit-${i + 1}-`)),
        }),
      );
      const visible = visibleUnitPixels(units);
      for (let i = 0; i < amount; i++) {
        const isolated = visibleUnitPixels([units[i]])[0];
        assert.ok(visible[i] >= isolated * 0.15, `${crop} ${amount}: unit ${i + 1} is hidden`);
      }
    }
  });
