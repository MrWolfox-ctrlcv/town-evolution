const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const build = process.env.BARREL_ROAST_ART_BUILD || '../.domain-build';
const load = (id) => require(path.resolve(__dirname, build, 'art', id));
const {
  BARREL_CRATE_SCALE,
  barrelCrateReinforcements,
  woodenBarrelParts,
  compostBarrel,
  compostBarrelAssets,
  roastedCarrotProductUnit,
  roastedCarrot,
  roastedCarrotPile,
  roastedCarrotOvenPreview,
} = load('BarrelRoastKit');
const { woodenCrate } = load('BuildingAccessories');
const { move } = load('AssetTypes');
const { cropProductUnit } = load('CropPileKit');
const { stoneOven } = load('BakeryKit');
const { compileAsset } = load('MeshCompiler');

test('barrel visibly inherits actual crate posts, paired slats and iron pins', () => {
  const crate = woodenCrate(),
    snapshot = JSON.stringify(crate);
  const expected = move(
    crate.filter((p) => p.name === 'crate-post'),
    [0, 0, 0],
    BARREL_CRATE_SCALE,
  );
  for (const side of [-1, 1])
    expected.push(
      ...move(
        crate.filter(
          (p) =>
            p.position[2] * side > 0 &&
            (p.name === 'crate-iron-pin' ||
              (p.name === 'crate-slat-front' && (p.position[1] < 0.2 || p.position[1] > 0.3))),
        ),
        [0, 0.1, side * 0.085],
        BARREL_CRATE_SCALE,
      ),
    );
  assert.deepEqual(barrelCrateReinforcements(), expected);
  assert.deepEqual(woodenBarrelParts().slice(0, expected.length), expected);
  assert.equal(JSON.stringify(woodenCrate()), snapshot);
  assert.equal(expected.filter((p) => p.name === 'crate-slat-front').length, 4);
  assert.equal(expected.filter((p) => p.name === 'crate-iron-pin').length, 8);
});

test('compost barrel has an open stave interior, real hinged slat lid and state-specific contents', () => {
  const [empty, working, ready] = compostBarrelAssets();
  assert.deepEqual(
    [empty.id, working.id, ready.id],
    ['compost-barrel', 'compost-barrel-working', 'compost-barrel-ready'],
  );
  for (const model of [empty, working, ready]) {
    assert.equal(model.parts.filter((p) => p.name === 'barrel-vertical-stave').length, 12);
    assert.equal(model.parts.filter((p) => p.name === 'barrel-lid-reused-slat').length, 5);
    assert.equal(model.parts.filter((p) => p.name === 'barrel-lid-handle').length, 1);
    assert.ok(!model.parts.some((p) => p.name === 'barrel-body'));
  }
  assert.ok(!empty.parts.some((p) => p.name.includes('compost')));
  assert.ok(!working.parts.some((p) => p.name.includes('compost')));
  assert.ok(ready.parts.some((p) => p.name === 'barrel-ready-compost'));
  assert.ok(compileAsset(empty).max[1] > compileAsset(working).max[1] + 0.3);
});

test('one roast output is one tray with two reused carrot silhouettes and visible browning', () => {
  const raw = cropProductUnit('vegetable'),
    root = raw.find((p) => p.name === 'carrot-root');
  const dish = roastedCarrot(),
    roots = dish.parts.filter((p) => p.name === 'roasted-carrot-root');
  assert.deepEqual(dish.parts, roastedCarrotProductUnit());
  assert.equal(dish.parts.filter((p) => p.name === 'roast-serving-tray').length, 1);
  assert.equal(roots.length, 2);
  for (const cooked of roots) {
    assert.equal(cooked.shape, root.shape);
    assert.deepEqual(
      cooked.size,
      root.size.map((v) => v * 0.85),
    );
    assert.notEqual(cooked.color, root.color);
  }
  assert.equal(dish.parts.filter((p) => p.name === 'roasted-carrot-browning').length, 12);
  assert.ok(
    !dish.parts.some((p) => /fire|flame|smoke/.test(p.name)),
    'ground food has no permanent oven effects',
  );
});

test('ground piles preserve exact dish counts and fit one cell without oversized tray overlap', () => {
  for (let amount = 1; amount <= 5; amount++) {
    const pile = roastedCarrotPile(amount),
      mesh = compileAsset(pile);
    assert.equal(pile.id, `pile-roastedCarrot-${amount}`);
    assert.equal(pile.parts.filter((p) => p.name.endsWith('-roast-serving-tray')).length, amount);
    assert.equal(
      pile.parts.filter((p) => p.name.endsWith('-roasted-carrot-root')).length,
      amount * 2,
    );
    assert.ok(mesh.min[0] >= -0.5 && mesh.max[0] <= 0.5);
    assert.ok(mesh.min[2] >= -0.5 && mesh.max[2] <= 0.5);
    const trays = pile.parts.filter((p) => p.name.endsWith('-roast-serving-tray'));
    for (let i = 0; i < trays.length; i++)
      for (let j = i + 1; j < trays.length; j++)
        assert.ok(
          Math.abs(trays[i].position[0] - trays[j].position[0]) >= trays[i].size[0] ||
            Math.abs(trays[i].position[2] - trays[j].position[2]) >= trays[i].size[2],
        );
  }
  for (const bad of [0, -1, 1.5, 6, NaN, Infinity]) assert.throws(() => roastedCarrotPile(bad));
});

test('oven handbook combination preserves the exact existing stone oven and actual finished dish', () => {
  const oven = stoneOven(),
    snapshot = JSON.stringify(oven),
    preview = roastedCarrotOvenPreview();
  assert.deepEqual(preview.parts.slice(0, oven.parts.length), move(oven.parts, [-0.5, 0, 0]));
  assert.deepEqual(
    preview.parts.slice(oven.parts.length),
    move(roastedCarrotProductUnit(), [0.55, 0, 0]),
  );
  assert.equal(JSON.stringify(stoneOven()), snapshot);
});

test('new models have finite normalized geometry within the existing asset budgets', () => {
  const models = [
    ...compostBarrelAssets(),
    roastedCarrot(),
    roastedCarrotOvenPreview(),
    ...Array.from({ length: 5 }, (_, i) => roastedCarrotPile(i + 1)),
  ];
  for (const model of models) {
    const m = compileAsset(model),
      budget = model.id.startsWith('pile-') ? 6000 : 3000;
    assert.ok(m.indices.length / 3 < budget, model.id);
    assert.ok(m.positions.length / 3 < 6000, model.id);
    assert.ok([...m.positions, ...m.normals, ...m.uvs].every(Number.isFinite), model.id);
    assert.ok(m.texturedIndices.length > 0, model.id);
    for (let i = 0; i < m.normals.length; i += 3)
      assert.ok(Math.abs(Math.hypot(...m.normals.slice(i, i + 3)) - 1) < 1e-6, model.id);
    assert.ok(m.min[0] >= -model.footprint[0] / 2 && m.max[0] <= model.footprint[0] / 2, model.id);
    assert.ok(m.min[2] >= -model.footprint[1] / 2 && m.max[2] <= model.footprint[1] / 2, model.id);
  }
  assert.deepEqual(compostBarrel(), compostBarrel());
});
