const { assertCropDrops } = require('./helpers/loose-output.cjs');
/** Canonical CPU crop triangles and real input/domain/save routing, not WebGL or device QA. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, game, project, ray } = require('./helpers/farm-picking-ui.cjs');
const { pickFarmCrop } = require('../.domain-build/application/FarmPicking');
const { SAVE_KEY } = require('../.domain-build/domain/storage');

function denseFarm(options = {}) {
  const f = fixture({ ...options, occupied: false });
  f.setNow(Date.now());
  const b = f.session.state.buildings[1];
  const crops = b.irrigated ? ['rice'] : ['vegetable', 'wheat', 'lettuce'];
  b.cropJobs = b.cropJobs.map((_, cell) => ({
    id: `j${3 + cell}`,
    crop: crops[cell % crops.length],
    startedAt: f.now - game.CROPS[crops[cell % crops.length]].durationMs,
    readyAt: f.now,
    durationMs: game.CROPS[crops[cell % crops.length]].durationMs,
    yield: 2,
  }));
  f.session.state.nextId = 3 + b.cropJobs.length;
  f.sync();
  assert.equal(f.session.save(), true);
  return f;
}
function visiblePoint(f, item) {
  let first;
  for (const crop of f.crops()) {
    if (f.session.state.buildings[1].cropJobs[crop.cell].crop !== item) continue;
    const { mesh } = crop;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const p = { x: 0, y: 0, z: 0 };
      for (const j of mesh.indices.slice(i, i + 3)) {
        p.x += mesh.positions[j * 3] / 3;
        p.y += mesh.positions[j * 3 + 1] / 3;
        p.z += mesh.positions[j * 3 + 2] / 3;
      }
      if (p.y < 0.25) continue;
      const point = project(p),
        r = ray(point),
        visible = f.town.pickPlant(r);
      if (visible?.cell !== crop.cell) continue;
      const found = { point, r, cell: crop.cell, distance: visible.distance };
      first ??= found;
      const coarse = pickFarmCrop(f.session.state.buildings, r, f.now);
      if (coarse?.cell !== crop.cell) return { ...found, coarse: coarse?.cell };
    }
  }
  assert.ok(first, `Fixture exposes a visible ${item} triangle`);
  return first;
}

for (const large of [false, true])
  for (const rotation of [0, 1, 2, 3])
    for (const item of game.CROP_KEYS)
      test(`harvest visible ${item} before neighboring volumes: ${large ? 'large' : 'ordinary'} rotation ${rotation}`, () => {
        const f = denseFarm({ large, rotation, crop: item }),
          hit = visiblePoint(f, item);
        assert.equal(Boolean(f.farm.irrigated), game.CROPS[item].field === 'water');
        assert.equal(
          f.town.pickCrop(hit.r, f.session.state)?.cell,
          hit.cell,
          `Visible ${item} cell ${hit.cell} must beat neighboring volume ${hit.coarse}`,
        );
        const command = { type: 'harvestCell', buildingId: 'b2', cell: hit.cell };
        const expected = game.dispatch(f.session.state, command, f.now);
        assert.equal(expected.ok, true);
        const before = { ...f.session.state.inventory };
        f.tools.begin('harvest', 7, hit.point);
        assert.equal(f.tools.end(7, hit.point), true);
        assert.deepEqual(f.commands, [command]);
        assert.deepEqual(f.session.state, expected.state);
        assert.deepEqual(f.session.state.inventory, before);
        assertCropDrops(f.session.state, f.farm, [hit.cell], item);
        assert.deepEqual(game.importSave(f.values.get(SAVE_KEY), f.now), expected.state);
        const saved = [...f.values],
          writes = f.writes();
        assert.equal(f.tools.end(7, hit.point), false);
        f.tools.move(7, hit.point);
        assert.deepEqual([...f.values], saved);
        assert.equal(f.writes(), writes);
      });

const { load, Node, farmCellCenter } = require('./helpers/farm-picking-ui.cjs');
const { ModelPicking } = load('ModelPicking');
function panelAt(r, distance) {
  const p = {
    x: r.o.x + r.d.x * distance,
    y: r.o.y + r.d.y * distance,
    z: r.o.z + r.d.z * distance,
  };
  const node = new Node('OpaquePanel');
  node.renderers.push({
    node,
    enabled: true,
    mesh: {
      struct: { primitives: [{ primitiveMode: 4 }] },
      readAttribute: () => [p.x - 1, p.y, p.z - 1, p.x, p.y, p.z + 1, p.x + 1, p.y, p.z - 1],
      readIndices: () => [0, 1, 2],
    },
  });
  return node;
}

for (const blocker of ['pickTree', 'pickStack', 'pickNatural', 'shop', 'attachment'])
  test(`visible ${blocker} blocks harvest even when a neighboring empty crop volume begins in front of it`, () => {
    const f = denseFarm(),
      hit = visiblePoint(f, 'vegetable');
    const coarse = pickFarmCrop(f.session.state.buildings, hit.r, f.now);
    assert.ok(coarse.distance < hit.distance);
    const distance = (coarse.distance + hit.distance) / 2;
    if (blocker.startsWith('pick')) f.town.resources[blocker] = () => ({ id: 'blocker', distance });
    else {
      const panel = panelAt(hit.r, distance);
      if (blocker === 'shop')
        f.town.buildings.set('front', {
          kind: 'shop',
          node: panel,
          surface: new ModelPicking(panel),
        });
      else {
        const entry = f.town.buildings.get('b2');
        entry.node.addChild(panel);
        entry.surface = new ModelPicking(entry.node);
      }
    }
    assert.equal(f.town.pickCrop(hit.r, f.session.state), null);
    const before = game.exportSave(f.session.state),
      saved = [...f.values],
      writes = f.writes();
    f.tools.begin('harvest', 10, hit.point);
    assert.equal(f.tools.end(10, hit.point), false);
    assert.deepEqual(f.commands, []);
    assert.equal(game.exportSave(f.session.state), before);
    assert.deepEqual([...f.values], saved);
    assert.equal(f.writes(), writes);
  });

test('visible immature crop is rejected rather than harvesting a mature neighbor behind an empty volume', () => {
  const f = denseFarm();
  for (const job of f.session.state.buildings[1].cropJobs)
    if (job.crop === 'vegetable') {
      job.startedAt = f.now - 10000;
      job.readyAt = f.now + 5000;
    }
  f.sync();
  assert.equal(f.session.save(), true);
  const hit = visiblePoint(f, 'vegetable'),
    before = game.exportSave(f.session.state),
    saved = [...f.values];
  assert.equal(f.town.pickCrop(hit.r, f.session.state).cell, hit.cell);
  f.tools.begin('harvest', 11, hit.point);
  f.tools.move(11, hit.point);
  assert.equal(f.tools.end(11, hit.point), false);
  assert.equal(f.commands.length, 1);
  assert.equal(f.commands[0].cell, hit.cell);
  assert.equal(f.session.message, '此小格作物尚未成熟');
  assert.equal(game.exportSave(f.session.state), before);
  assert.deepEqual([...f.values], saved);
});

function airGap(f) {
  const b = f.session.state.buildings[1];
  for (const crop of f.crops()) {
    const center = farmCellCenter(b, crop.cell);
    for (let y = 0.35; y < 0.8; y += 0.025)
      for (let dx = -0.3; dx <= 0.3; dx += 0.025) {
        const point = project({ x: center.x + dx, y, z: center.z + 0.3 }),
          r = ray(point);
        const coarse = pickFarmCrop([b], r, f.now),
          visible = f.town.pickPlant(r);
        if (
          coarse &&
          visible?.buildingId === b.id &&
          visible.cell === null &&
          coarse.distance < visible.distance
        )
          return { point, r, coarse, visible };
      }
  }
  assert.fail('Fixture exposes a real crop air gap onto its own bed');
}

for (const large of [false, true])
  for (const rotation of [0, 1, 2, 3])
    test(`same-bed air-gap forgiveness remains usable: ${large ? 'large' : 'ordinary'} rotation ${rotation}`, () => {
      const f = fixture({ large, rotation }),
        gap = airGap(f);
      assert.deepEqual(f.town.pickCrop(gap.r, f.session.state), gap.coarse);
      const expected = game.dispatch(
        f.session.state,
        { type: 'harvestCell', buildingId: 'b2', cell: gap.coarse.cell },
        f.now,
      );
      f.tools.begin('harvest', 12, gap.point);
      assert.equal(f.tools.end(12, gap.point), true);
      assert.deepEqual(f.session.state, expected.state);
      assert.equal(f.session.state.inventory.wheat, 0);
      assertCropDrops(f.session.state, f.farm, [gap.coarse.cell], 'wheat');
      assert.deepEqual(game.importSave(f.values.get(SAVE_KEY), f.now), expected.state);
    });

test('stationary move/up does not harvest the neighbor exposed by the first cut and refresh', () => {
  const f = denseFarm();
  const point = { x: 638.4174093553713, y: 615.035030460478 },
    r = ray(point);
  assert.equal(f.town.pickCrop(r, f.session.state).cell, 1);
  f.tools.begin('harvest', 13, point);
  f.tools.move(13, point);
  assert.equal(f.commands.length, 1);
  assert.equal(f.commands[0].cell, 1);
  assert.equal(
    f.town.pickCrop(r, f.session.state).cell,
    0,
    'Refresh really exposes a different crop',
  );
  const saved = [...f.values],
    writes = f.writes();
  f.tools.move(13, point);
  assert.equal(f.tools.end(13, point), true);
  assert.equal(f.commands.length, 1);
  assert.deepEqual([...f.values], saved);
  assert.equal(f.writes(), writes);
  f.tools.begin('harvest', 14, point);
  assert.equal(
    f.tools.end(14, point),
    true,
    'A new intentional gesture may cut the newly visible cell',
  );
  assert.deepEqual(
    f.commands.map((c) => c.cell),
    [1, 0],
  );
});

test('a crop cut within an unrefreshed batch still occludes neighboring cells until the screen updates', () => {
  const f = denseFarm();
  const point = { x: 638.4174093553713, y: 615.035030460478 },
    r = ray(point);
  assert.equal(f.town.pickCrop(r, f.session.state).cell, 1);
  assert.equal(f.session.run({ type: 'harvestCell', buildingId: 'b2', cell: 1 }), true);
  assert.equal(f.session.state.buildings[1].cropJobs[1], null);
  assert.equal(
    f.town.pickCrop(r, f.session.state).cell,
    1,
    'Preserve the identity actually still on screen',
  );
  f.sync();
  assert.equal(f.town.pickCrop(r, f.session.state).cell, 0);
});

for (const scenario of ['cancel', 'foreign', 'lifted', 'hidden', 'miss'])
  test(`${scenario} harvest leaves every crop, inventory and save unchanged`, () => {
    const f = denseFarm(),
      hit = visiblePoint(f, 'vegetable');
    if (scenario === 'lifted') f.town.setLifted('b2');
    if (scenario === 'hidden') f.town.buildings.get('b2').node.active = false;
    const before = game.exportSave(f.session.state),
      saved = [...f.values],
      writes = f.writes();
    const point = scenario === 'miss' ? { x: 2000, y: 2000 } : hit.point;
    f.tools.begin('harvest', 15, point);
    if (scenario === 'cancel') f.tools.cancel();
    const id = scenario === 'foreign' ? 16 : 15;
    f.tools.move(id, point);
    assert.equal(f.tools.end(id, point), false);
    assert.deepEqual(f.commands, []);
    assert.equal(game.exportSave(f.session.state), before);
    assert.deepEqual([...f.values], saved);
    assert.equal(f.writes(), writes);
  });

for (const large of [false, true])
  for (const rotation of [0, 1, 2, 3])
    for (const item of game.CROP_KEYS)
      test(`one coalesced sickle stroke harvests every ${item} in a row: ${large ? 'large' : 'ordinary'} rotation ${rotation}`, () => {
        const f = fixture({ large, rotation, crop: item, occupied: false });
        f.setNow(Date.now());
        f.session.state.inventory.vegetable = 0;
        for (let cell = 0; cell < f.size; cell++)
          f.session.state.buildings[1].cropJobs[cell] = {
            id: `j${3 + cell}`,
            crop: item,
            startedAt: f.now - game.CROPS[item].durationMs,
            readyAt: f.now,
            durationMs: game.CROPS[item].durationMs,
            yield: 2,
          };
        f.session.state.nextId = 3 + f.size;
        f.sync();
        assert.equal(f.session.save(), true);
        const height = item === 'wheat' || item === 'rice' ? 0.55 : item === 'lettuce' ? 0.3 : 0.4;
        const start = project({ ...farmCellCenter(f.farm, 0), y: height });
        const end = project({ ...farmCellCenter(f.farm, f.size - 1), y: height });
        const writes = f.writes();
        f.tools.begin('harvest', 17, start);
        assert.equal(f.tools.end(17, end), true);
        assert.equal(f.commands.length, f.size);
        assert.deepEqual(
          f.commands.map((c) => c.cell).sort((a, b) => a - b),
          Array.from({ length: f.size }, (_, i) => i),
        );
        assert.equal(f.session.state.inventory[item], 0);
        assertCropDrops(
          f.session.state,
          f.farm,
          Array.from({ length: f.size }, (_, i) => i),
          item,
        );
        assert.equal(f.session.state.buildings[1].cropJobs.filter(Boolean).length, 0);
        assert.equal(f.refreshes(), 1, 'No per-sample model rebuilds');
        assert.deepEqual(
          f.commandFrames.map((frame) => frame.rendered),
          Array(f.size).fill(f.size),
        );
        assert.equal(f.writes(), writes + 2 * f.size);
        assert.deepEqual(game.importSave(f.values.get(SAVE_KEY), f.now), f.session.state);
      });

for (const failure of ['capacity', 'quota', 'conflict', 'corrupt', 'recovered'])
  test(`harvest ${failure} keeps the right target and preserves persisted progress`, () => {
    const f = denseFarm(),
      hit = visiblePoint(f, 'vegetable');
    if (failure === 'capacity') {
      f.session.state.inventory.vegetable +=
        game.getCapacity(f.session.state) - game.getUsedStorage(f.session.state);
      assert.equal(f.session.save(), true);
    }
    const before = game.exportSave(f.session.state),
      command = { type: 'harvestCell', buildingId: 'b2', cell: hit.cell };
    const expected = game.dispatch(f.session.state, command, f.now);
    f.tools.begin('harvest', 18, hit.point);
    if (failure === 'corrupt' || failure === 'recovered') f.session.mode = failure;
    if (failure === 'conflict') {
      const { GameSession } = require('../.domain-build/application/GameSession');
      const rival = new GameSession(f.session.storage, () => f.now + 1);
      assert.equal(rival.run({ type: 'buyCrop', item: 'wheat', quantity: 1 }), true);
    }
    const setItem = f.session.storage.setItem;
    if (failure === 'quota')
      f.session.storage.setItem = () => {
        throw new Error('quota');
      };
    const saved = [...f.values];
    assert.equal(f.tools.end(18, hit.point), failure === 'quota' || failure === 'capacity');
    assert.deepEqual(f.commands, [command]);
    if (failure !== 'capacity') assert.deepEqual([...f.values], saved);
    if (failure === 'quota') {
      assert.deepEqual(f.session.state, expected.state);
      assert.equal(f.session.hasUnsavedChanges, true);
      assert.match(f.session.statusMessage, /保存失败/);
      f.session.storage.setItem = setItem;
      assert.equal(f.session.save(), true);
      assert.deepEqual(game.importSave(f.values.get(SAVE_KEY), f.now), expected.state);
    } else if (failure === 'capacity') {
      assert.deepEqual(f.session.state, expected.state);
      assert.equal(game.getUsedStorage(f.session.state), game.getCapacity(f.session.state));
      assertCropDrops(f.session.state, f.farm, [hit.cell], 'vegetable');
      assert.deepEqual(game.importSave(f.values.get(SAVE_KEY), f.now), expected.state);
      const snapshot = game.exportSave(f.session.state),
        values = [...f.values],
        writes = f.writes();
      const drop = f.session.state.looseDrops.find((d) => d.source.cell === hit.cell);
      assert.equal(f.session.run({ type: 'pickupDrop', dropId: drop.id }), false);
      assert.equal(game.exportSave(f.session.state), snapshot);
      assert.deepEqual([...f.values], values);
      assert.equal(f.writes(), writes);
      assert.equal(f.session.state.looseDrops.find((d) => d.id === drop.id).amount, 2);
    } else {
      assert.equal(game.exportSave(f.session.state), before);
      if (failure === 'conflict') assert.equal(f.session.hasSaveConflict, true);
    }
  });

for (const scenario of ['crop', 'soil', 'miss', 'resource', 'air gap'])
  test(`one primitive query per renderer and one resource query per harvest sample: ${scenario}`, () => {
    const f = denseFarm({ large: true });
    let point;
    if (scenario === 'air gap') point = airGap(f).point;
    else if (scenario === 'soil') {
      f.session.state.buildings[1].cropJobs[0] = null;
      f.sync();
      point = project({ ...farmCellCenter(f.farm, 0), y: 0.17 });
      assert.equal(f.town.pickPlant(ray(point)).cell, null);
    } else if (scenario === 'miss') point = { x: 2000, y: 2000 };
    else point = visiblePoint(f, 'vegetable').point;
    if (scenario === 'resource')
      f.town.resources.pickTree = () => {
        f.resourceQueries.push('pickTree');
        return { id: 'tree', distance: 0.1 };
      };
    f.map.ground = () => {
      throw new Error('Harvest already resolved its cell; do not cast a second camera ray');
    };
    f.tools.begin('harvest', 19, point);
    f.pickingVisits.length = f.pickingQueries.length = f.resourceQueries.length = 0;
    const count = f.crops().length + 1;
    f.tools.end(19, point);
    assert.equal(f.pickingVisits.length, count);
    assert.equal(f.pickingQueries.length, count);
    assert.equal(new Set(f.pickingQueries).size, count);
    assert.deepEqual(f.resourceQueries.sort(), ['pickNatural', 'pickStack', 'pickTree']);
  });

test('air-gap forgiveness cannot steal a crop from another field whose empty volume overlaps the visible bed', () => {
  for (const [x, z, point] of [
    [8, 6, { x: 748, y: 600 }],
    [6, 8, { x: 600, y: 738 }],
    [8, 8, { x: 748, y: 738 }],
  ]) {
    const f = fixture({ occupied: false }),
      other = fixture({ occupied: false });
    const adjacent = other.session.state.buildings[1];
    Object.assign(adjacent, { id: 'b3', x, z });
    adjacent.cropJobs = adjacent.cropJobs.map((_, cell) => ({
      id: `j${4 + cell}`,
      crop: 'wheat',
      startedAt: f.now - 15000,
      readyAt: f.now,
    }));
    other.sync();
    f.session.state.buildings.push(structuredClone(adjacent));
    f.session.state.nextId = 13;
    assert.equal(
      f.session.save(),
      true,
      'The adjacent field is valid under the real save validator',
    );
    f.town.buildings.set('b3', other.town.buildings.get('b3'));
    const r = ray(point),
      visible = f.town.pickPlant(r),
      coarse = pickFarmCrop(f.session.state.buildings, r, f.now);
    assert.equal(visible.buildingId, 'b2');
    assert.equal(visible.cell, null);
    assert.equal(coarse.buildingId, 'b3', 'Old all-town volumes intercepted the other field');
    assert.equal(f.town.pickCrop(r, f.session.state).buildingId, 'b2');
    const before = game.exportSave(f.session.state),
      saved = [...f.values];
    f.tools.begin('harvest', 20, point);
    assert.equal(f.tools.end(20, point), false);
    assert.deepEqual(f.commands, []);
    assert.equal(game.exportSave(f.session.state), before);
    assert.deepEqual([...f.values], saved);
  }
});

test('coalesced move rounding cannot turn a stationary pointer-up into a second harvest', () => {
  const f = denseFarm();
  const point = { x: 638.4174093553713, y: 615.035030460478 };
  const start = { x: point.x, y: 7.699999999999989 };
  // Simulate a toolbar drag whose intermediate samples are outside the actual map viewport.
  f.map.contains = (sample) =>
    Math.abs(sample.x - point.x) < 1e-5 && Math.abs(sample.y - point.y) < 1e-5;
  f.tools.begin('harvest', 21, start);
  f.tools.move(21, point);
  assert.deepEqual(
    f.commands.map((c) => c.cell),
    [1],
  );
  assert.equal(f.town.pickCrop(ray(point), f.session.state).cell, 0);
  const saved = [...f.values],
    writes = f.writes();
  assert.equal(f.tools.end(21, point), true);
  assert.deepEqual(
    f.commands.map((c) => c.cell),
    [1],
  );
  assert.deepEqual([...f.values], saved);
  assert.equal(f.writes(), writes);
});

for (const movement of ['subpixel', 'leave and re-enter'])
  test(`intentional ${movement} movement is not swallowed by stationary-point protection`, () => {
    const f = denseFarm();
    const point = { x: 638.4174093553713, y: 615.035030460478 };
    if (movement === 'leave and re-enter')
      f.map.contains = (sample) => Math.hypot(sample.x - point.x, sample.y - point.y) < 1e-5;
    f.tools.begin('harvest', 22, point);
    f.tools.move(22, point);
    assert.deepEqual(
      f.commands.map((c) => c.cell),
      [1],
    );
    if (movement === 'leave and re-enter') f.tools.move(22, { x: 2000, y: 2000 });
    const target = movement === 'subpixel' ? { x: point.x + 1e-8, y: point.y } : point;
    assert.equal(f.tools.end(22, target), true);
    assert.deepEqual(
      f.commands.map((c) => c.cell),
      [1, 0],
    );
  });
