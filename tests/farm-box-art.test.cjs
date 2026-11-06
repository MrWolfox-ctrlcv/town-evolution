const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const build = process.env.FARM_BOX_ART_BUILD || '../.domain-build';
const load = (name) => require(path.resolve(__dirname, build, name));
const {
  farmBoxLocalCenter,
  farmCollectionBox,
  farmCollectionBoxAssets,
  farmWithBox,
  FARM_BOX_SCALE,
} = load('art/FarmBoxKit');
const { farmBed } = load('art/FarmCellKit');
const { woodenCrate, woodenBoard } = load('art/BuildingAccessories');
const { move } = load('art/AssetTypes');
const { compileAsset } = load('art/MeshCompiler');
const { farmBoxCell } = load('domain/building-cells');
const { threeComponentDock, DOCK_BOARD_POSITION, DOCK_BOARD_SCALE } =
  load('art/DockNoticeBoardKit');
const { simpleDock } = load('art/DockPierKit');

test('empty farm collection box reuses the entire open crate and never invents stored crops', () => {
  assert.deepEqual(farmCollectionBox().parts, move(woodenCrate(), [0, 0, 0], FARM_BOX_SCALE));
  assert.equal(farmCollectionBox().id, 'farm-collection-box-0');
  const stock = { vegetable: 2, wheat: 0, lettuce: 0, rice: 0 };
  const before = JSON.stringify(stock),
    parts = farmCollectionBox(stock).parts;
  assert.equal(JSON.stringify(stock), before);
  assert.ok(parts.some((p) => p.name.startsWith('farm-box-vegetable-')));
  assert.ok(!parts.some((p) => /farm-box-(wheat|lettuce|rice)-/.test(p.name)));
  assert.equal(farmCollectionBox({ vegetable: 16 }).id, farmCollectionBox({ vegetable: 1 }).id);
  assert.equal(farmCollectionBox({ vegetable: 0 }).id, 'farm-collection-box-0');
});

test('16 stock silhouettes use separate stable cache IDs and only actual crop kinds', () => {
  const assets = farmCollectionBoxAssets();
  assert.equal(new Set(assets.map((a) => a.id)).size, 16);
  const crops = ['vegetable', 'wheat', 'lettuce', 'rice'];
  assets.forEach((recipe, mask) => {
    assert.equal(recipe.id, `farm-collection-box-${mask}`);
    crops.forEach((crop, bit) =>
      assert.equal(
        recipe.parts.some((p) => p.name.startsWith(`farm-box-${crop}-`)),
        Boolean(mask & (1 << bit)),
      ),
    );
  });
});

test('box fits its exact outside tile and matches domain placement in all farm sizes and rotations', () => {
  const box = compileAsset(farmCollectionBox({ vegetable: 1, wheat: 1, lettuce: 1, rice: 1 }));
  assert.ok(box.min[0] >= -0.5 && box.max[0] <= 0.5);
  assert.ok(box.min[2] >= -0.5 && box.max[2] <= 0.5);
  for (const size of [3, 6]) {
    const n = (size * 2) / 3,
      center = farmBoxLocalCenter(size);
    assert.ok(center[0] + box.min[0] > n / 2, 'box and contents never cover crop cells');
    for (let rotation = 0; rotation < 4; rotation++) {
      const farm = {
        kind: 'farm',
        x: 10,
        z: 20,
        rotation,
        ...(size === 6 ? { farmSize: 6 } : {}),
        collectionBox: {},
      };
      const cell = farmBoxCell(farm),
        a = (rotation * Math.PI) / 2;
      const x = 10 + n / 2 + center[0] * Math.cos(a) + center[2] * Math.sin(a);
      const z = 20 + n / 2 - center[0] * Math.sin(a) + center[2] * Math.cos(a);
      assert.ok(Math.abs(x - cell.x - 0.5) < 1e-8);
      assert.ok(Math.abs(z - cell.z - 0.5) < 1e-8);
    }
  }
});

test('farmWithBox handbook model is the exact real bed and empty box, including wet and large farms', () => {
  for (const size of [3, 6])
    for (const irrigated of [false, true]) {
      const recipe = farmWithBox(size, irrigated),
        bed = farmBed(size, irrigated);
      const expected = move(
        [...bed.parts, ...move(farmCollectionBox().parts, farmBoxLocalCenter(size))],
        [-0.5, 0, 0],
      );
      assert.deepEqual(recipe.parts, expected);
      assert.equal(recipe.parts.filter((p) => p.name.startsWith('soil-')).length, size * size);
      assert.equal(recipe.parts.filter((p) => p.name === 'crate-floor').length, 1);
      assert.ok(!recipe.parts.some((p) => p.name.startsWith('farm-box-')));
      const m = compileAsset(recipe);
      // The established field's corner pegs overhang their logical edge by 0.005 units.
      const margin = 0.006;
      assert.ok(
        m.min[0] >= -recipe.footprint[0] / 2 - margin &&
          m.max[0] <= recipe.footprint[0] / 2 + margin,
      );
      assert.ok(
        m.min[2] >= -recipe.footprint[1] / 2 - margin &&
          m.max[2] <= recipe.footprint[1] / 2 + margin,
      );
    }
});

test('three-component dock preserves its structural pier, crate and complete existing notice board', () => {
  const old = simpleDock(),
    original = JSON.stringify(old),
    dock = threeComponentDock();
  assert.equal(JSON.stringify(simpleDock()), original);
  assert.equal(dock.id, 'dock-simple-three');
  const retained = old.parts.filter((p) => p.name !== 'pier-post-endgrain');
  assert.deepEqual(dock.parts.slice(0, retained.length), retained);
  assert.deepEqual(
    dock.parts.slice(retained.length),
    move(woodenBoard(), DOCK_BOARD_POSITION, DOCK_BOARD_SCALE),
  );
  for (const name of [
    'pier-deck-plank',
    'pier-piling',
    'pier-rope-rail',
    'crate-floor',
    'crate-slat-front',
    'board-post',
    'board-plank',
  ])
    assert.ok(
      dock.parts.some((p) => p.name === name),
      name,
    );
  assert.ok(!dock.parts.some((p) => /boat|shelf|kiosk/.test(p.name)));
  const m = compileAsset(dock);
  assert.ok(m.min[0] >= -1 && m.max[0] <= 1 && m.min[2] >= -1 && m.max[2] <= 1);
});

test('farm box and three-part dock models stay finite, outward-faced and within existing mesh budgets', () => {
  const recipes = [
    ...farmCollectionBoxAssets(),
    farmWithBox(),
    farmWithBox(6),
    farmWithBox(3, true),
    farmWithBox(6, true),
    threeComponentDock(),
  ];
  for (const recipe of recipes) {
    const m = compileAsset(recipe),
      n = m.positions.length / 3;
    assert.ok(m.indices.length / 3 < 3000, recipe.id);
    assert.ok(n < 6000, recipe.id);
    assert.ok([...m.positions, ...m.normals, ...m.uvs].every(Number.isFinite), recipe.id);
    assert.ok(m.texturedIndices.length > 0, recipe.id);
    for (let i = 0; i < m.normals.length; i += 3)
      assert.ok(Math.abs(Math.hypot(...m.normals.slice(i, i + 3)) - 1) < 1e-6, recipe.id);
  }
});
