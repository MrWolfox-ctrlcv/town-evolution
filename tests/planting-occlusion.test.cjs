const { assertCropDrops } = require('./helpers/loose-output.cjs');
/** Production input and save rules using canonical CPU meshes, not GPU/device validation. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  fixture,
  game,
  project,
  ray,
  farmCellCenter,
  load,
  Node,
} = require('./helpers/farm-picking-ui.cjs');
const { SAVE_KEY } = require('../.domain-build/domain/storage');

for (const large of [false, true])
  for (const rotation of [0, 1, 2, 3])
    for (const crop of game.CROP_KEYS)
      test(`${large ? 'large' : 'ordinary'} farm rotation ${rotation}: touching visible ${crop} cannot plant through it`, () => {
        const f = fixture({ large, rotation, crop }),
          hit = f.cropPoint();
        assert.notEqual(hit.soilCell, f.occupiedCell);
        const saved = f.values.get(SAVE_KEY),
          before = game.exportSave(f.session.state),
          writes = f.writes();
        f.tools.begin('plant', 7, hit.point, 'vegetable');
        f.tools.move(7, hit.point);
        f.tools.end(7, hit.point);
        assert.equal(game.exportSave(f.session.state), before);
        assert.equal(f.values.get(SAVE_KEY), saved);
        assert.equal(f.writes(), writes);
        assert.equal(f.commands.length, 1);
        assert.ok(
          f.commands.every((c) => c.cell === f.occupiedCell),
          'Never dispatch a neighboring soil cell',
        );
        assert.equal(f.session.message, '此小格已经种植');
        assert.equal(f.tools.hasActed, false);
      });

test('crop air gaps do not block visible empty soil with an oversized crop volume', () => {
  const f = fixture(),
    crop = f.crops()[0];
  let point;
  for (let y = 0.35; y < 0.8 && !point; y += 0.025)
    for (let dx = -0.3; dx <= 0.3 && !point; dx += 0.025) {
      const center = farmCellCenter(f.farm, f.occupiedCell),
        p = project({ x: center.x + dx, y, z: center.z + 0.3 });
      const coarse = f.town.pickCrop(ray(p), f.session.state);
      if (coarse && crop.surface.distance(ray(p)) === null && f.town.pickBuilding(ray(p)))
        point = p;
    }
  assert.ok(point, 'Ray passes through crop volume air onto visible soil');
  assert.equal(f.town.pickCrop(ray(point), f.session.state, 'plant'), null);
  f.tools.begin('plant', 7, point);
  assert.equal(f.tools.end(7, point), true);
  assert.equal(f.session.state.inventory.vegetable, 7);
});

for (const large of [false, true])
  for (const rotation of [0, 1, 2, 3])
    test(`fast planting and harvest keep every crossed cell for ${large ? 'large' : 'ordinary'} rotation ${rotation}`, () => {
      const f = fixture({ large, rotation, occupied: false });
      const a = farmCellCenter(f.farm, 0),
        b = farmCellCenter(f.farm, f.size - 1);
      const first = project({ ...a, y: 0.17 }),
        last = project({ ...b, y: 0.17 });
      f.tools.begin('plant', 7, first);
      f.tools.move(7, first);
      f.tools.end(7, last);
      assert.equal(f.session.state.inventory.vegetable, 8 - f.size);
      assert.equal(f.session.state.buildings[1].cropJobs.filter(Boolean).length, f.size);
      assert.equal(new Set(f.commands.map((c) => c.cell)).size, f.size);
      assert.deepEqual(game.importSave(f.values.get(SAVE_KEY), f.now), f.session.state);
      f.setNow(f.now + 15000);
      f.commands.length = 0;
      const start = project({ ...a, y: 0.4 }),
        end = project({ ...b, y: 0.4 });
      f.tools.begin('harvest', 8, start);
      f.tools.move(8, start);
      f.tools.end(8, end);
      assert.equal(f.session.state.inventory.vegetable, 8 - f.size);
      assertCropDrops(
        f.session.state,
        f.farm,
        Array.from({ length: f.size }, (_, i) => i),
        'vegetable',
      );
      assert.equal(f.session.state.buildings[1].cropJobs.filter(Boolean).length, 0);
      assert.equal(new Set(f.commands.map((c) => c.cell)).size, f.size);
      assert.deepEqual(game.importSave(f.values.get(SAVE_KEY), f.now), f.session.state);
    });

for (const resource of ['pickTree', 'pickNatural', 'pickStack'])
  test(`${resource} foreground occlusion prevents planting; cancelled and foreign gestures preserve saves`, () => {
    const f = fixture(),
      hit = f.cropPoint(),
      before = game.exportSave(f.session.state);
    f.town.resources[resource] = () => ({ id: 'occluder', distance: hit.distance - 1 });
    assert.equal(f.town.pickCrop(hit.r, f.session.state, 'plant'), null);
    f.tools.begin('plant', 7, hit.point);
    f.tools.move(8, hit.point);
    f.tools.end(8, hit.point);
    f.tools.end(7, hit.point);
    f.tools.begin('plant', 9, hit.point);
    f.tools.cancel();
    f.tools.end(9, hit.point);
    assert.equal(f.commands.length, 0);
    assert.equal(game.exportSave(f.session.state), before);
  });

test('mature harvest retains its original cell and two-unit reward instead of cutting the projected neighbor', () => {
  const f = fixture(),
    hit = f.cropPoint();
  f.tools.begin('harvest', 7, hit.point);
  assert.equal(f.tools.end(7, hit.point), true);
  assert.deepEqual(f.commands, [{ type: 'harvestCell', buildingId: 'b2', cell: f.occupiedCell }]);
  assert.equal(f.session.state.inventory.wheat, 0);
  assertCropDrops(f.session.state, f.farm, [f.occupiedCell], 'wheat');
  assert.equal(f.session.state.buildings[1].cropJobs.filter(Boolean).length, 0);
  assert.deepEqual(game.importSave(f.values.get(SAVE_KEY), f.now), f.session.state);
});

test('foreground buildings and lifted farms cannot route planting through hidden crops', () => {
  for (const lifted of [false, true]) {
    const f = fixture(),
      hit = f.cropPoint(),
      before = game.exportSave(f.session.state);
    if (lifted) f.town.lifted = f.farm.id;
    else
      f.town.buildings.set('front', {
        kind: 'shop',
        node: { active: true },
        surface: {
          distance: () => hit.distance - 1,
          hit: () => ({ node: new Node('shop'), distance: hit.distance - 1 }),
        },
      });
    assert.equal(f.town.pickCrop(hit.r, f.session.state, 'plant'), null);
    f.tools.begin('plant', 7, hit.point);
    f.tools.end(7, hit.point);
    assert.equal(f.commands.length, 0);
    assert.equal(game.exportSave(f.session.state), before);
  }
});

test('depleted stock and water fields still reject direct and swept planting without writes', () => {
  for (const failure of ['stock', 'water']) {
    const f = fixture({ occupied: false });
    if (failure === 'stock') f.session.state.inventory.vegetable = 0;
    else f.session.state.buildings[1].irrigated = true;
    f.sync();
    assert.equal(f.session.save(), true);
    const before = game.exportSave(f.session.state),
      saved = f.values.get(SAVE_KEY),
      writes = f.writes();
    const point = project({ ...farmCellCenter(f.farm, 4), y: 0.17 });
    f.tools.begin('plant', 7, point);
    assert.equal(f.tools.end(7, point), false);
    assert.equal(game.exportSave(f.session.state), before);
    assert.equal(f.values.get(SAVE_KEY), saved);
    assert.equal(f.writes(), writes);
  }
});

test('rendered hit identity includes crop descendants but never soil, empty cells or attachments', () => {
  const root = new Node('farm'),
    grid = new Node('FarmGrid');
  root.addChild(grid);
  const soil = new Node('Soil'),
    empty = new Node('Cell0');
  grid.addChild(soil);
  grid.addChild(empty);
  const descendants = [];
  for (const cell of [8, 35]) {
    const node = new Node(`Cell${cell}`),
      pivot = new Node('CropSoilPivot'),
      batch = new Node('CropPalette'),
      child = new Node('GeneratedWoodMaterial');
    node.addChild(pivot);
    pivot.addChild(batch);
    batch.addChild(child);
    grid.addChild(node);
    descendants.push({ cell, pivot, batch, child, node });
  }
  const attachment = new Node('Attachment');
  descendants[0].node.addChild(attachment);
  const { RenderedCropPicking } = load('RenderedCropPicking');
  const picker = new RenderedCropPicking(root);
  for (const entry of descendants)
    for (const node of [entry.pivot, entry.batch, entry.child])
      assert.equal(picker.cellAt(node), entry.cell);
  for (const node of [root, grid, soil, empty, attachment, ...descendants.map((e) => e.node)])
    assert.equal(picker.cellAt(node), null);
  assert.equal(new RenderedCropPicking(new Node('house')).cellAt(soil), null);
  assert.equal(new RenderedCropPicking(root).cellAt(new Node('CropPalette')), null);
});

for (const large of [false, true])
  for (const rotation of [0, 1, 2, 3])
    test(`production batch-end refresh preserves planting and harvest on ${large ? 'large' : 'ordinary'} rotation ${rotation}`, () => {
      const f = fixture({ large, rotation, occupied: false });
      const first = farmCellCenter(f.farm, 0),
        last = farmCellCenter(f.farm, f.size - 1);
      const start = project({ ...first, y: 0.17 }),
        end = project({ ...last, y: 0.17 });
      const writes = f.writes();
      f.tools.begin('plant', 71, start);
      assert.equal(f.tools.end(71, end), true);
      assert.equal(f.refreshes(), 1, 'Only refresh after all coalesced samples finish');
      assert.equal(
        f.writes(),
        writes + f.size * 2,
        'Each successful command writes the main save and its backup',
      );
      assert.deepEqual(
        f.commandFrames.map((frame) => frame.rendered),
        Array(f.size).fill(0),
      );
      assert.deepEqual(
        f.commandFrames.map((frame) => frame.live),
        Array.from({ length: f.size }, (_, i) => i),
      );
      assert.deepEqual(
        f.commandFrames.map((frame) => frame.refreshes),
        Array(f.size).fill(0),
      );
      assert.equal(f.session.state.inventory.vegetable, 8 - f.size);
      assert.equal(f.crops().length, f.size);
      assert.deepEqual(game.importSave(f.values.get(SAVE_KEY), f.now), f.session.state);
      f.setNow(f.now + 15000);
      f.commands.length = f.commandFrames.length = 0;
      const cutStart = project({ ...first, y: 0.4 }),
        cutEnd = project({ ...last, y: 0.4 });
      f.tools.begin('harvest', 72, cutStart);
      assert.equal(f.tools.end(72, cutEnd), true);
      assert.equal(f.refreshes(), 2);
      assert.deepEqual(
        f.commandFrames.map((frame) => frame.rendered),
        Array(f.size).fill(f.size),
      );
      assert.deepEqual(
        f.commandFrames.map((frame) => frame.live),
        Array.from({ length: f.size }, (_, i) => f.size - i),
      );
      assert.deepEqual(
        f.commandFrames.map((frame) => frame.refreshes),
        Array(f.size).fill(1),
      );
      assert.equal(f.session.state.inventory.vegetable, 8 - f.size);
      assertCropDrops(
        f.session.state,
        f.farm,
        Array.from({ length: f.size }, (_, i) => i),
        'vegetable',
      );
      assert.equal(f.crops().length, 0);
      assert.equal(new Set(f.commands.map((command) => command.cell)).size, f.size);
      assert.deepEqual(game.importSave(f.values.get(SAVE_KEY), f.now), f.session.state);
      const saved = f.values.get(SAVE_KEY),
        afterWrites = f.writes();
      assert.equal(f.tools.end(72, cutEnd), false);
      f.tools.move(72, cutStart);
      assert.equal(f.values.get(SAVE_KEY), saved);
      assert.equal(f.writes(), afterWrites);
      assert.equal(f.refreshes(), 2);
    });

for (const scenario of ['visible crop', 'bare soil', 'miss', 'resource blocker'])
  test(`plant picking queries each actual renderer primitive only once: ${scenario}`, () => {
    const f = fixture({ large: true });
    const cropHit = f.cropPoint();
    // Keep one empty cell while loading the dense 6x6 field with mature actual crop meshes.
    for (let cell = 1; cell < 36; cell++)
      f.session.state.buildings[1].cropJobs[cell] = {
        id: `j${cell + 4}`,
        crop: 'wheat',
        startedAt: f.now - 15000,
        readyAt: f.now,
      };
    f.session.state.nextId = 40;
    f.sync();
    const point =
      scenario === 'bare soil'
        ? project({ ...farmCellCenter(f.farm, 0), y: 0.17 })
        : scenario === 'miss'
          ? { x: 2000, y: 2000 }
          : cropHit.point;
    const other = fixture();
    other.session.state.buildings[1].x = other.session.state.buildings[1].z = 15;
    other.sync();
    f.town.buildings.set('other', other.town.buildings.get('b2'));
    if (scenario === 'bare soil') assert.equal(f.town.pickPlant(ray(point))?.cell, null);
    if (scenario === 'visible crop')
      assert.equal(f.town.pickPlant(ray(point))?.cell, f.occupiedCell);
    if (scenario === 'miss') assert.equal(f.town.pickPlant(ray(point)), null);
    if (scenario === 'resource blocker')
      f.town.resources.pickTree = () => {
        f.resourceQueries.push('pickTree');
        return { id: 'tree', distance: 0.1 };
      };
    f.pickingQueries.length = f.pickingVisits.length = f.resourceQueries.length = 0;
    other.pickingQueries.length = other.pickingVisits.length = 0;
    f.tools.begin('plant', 80, point);
    f.tools.end(80, point);
    const counts = new Map();
    for (const name of f.pickingQueries) counts.set(name, (counts.get(name) ?? 0) + 1);
    assert.equal(
      counts.size,
      36,
      'The soil and all 35 populated cells take part in actual mesh picking',
    );
    assert.ok(
      [...counts.values()].every((count) => count === 1),
      JSON.stringify([...counts]),
    );
    assert.equal(f.pickingVisits.length, 36, 'No duplicate world transforms either');
    assert.deepEqual(f.resourceQueries.sort(), ['pickNatural', 'pickStack', 'pickTree']);
    assert.deepEqual(other.pickingQueries.sort(), ['Crop8', 'Soil']);
    assert.equal(other.pickingVisits.length, 2);
  });
