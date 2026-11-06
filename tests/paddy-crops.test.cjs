const { pickupDrops, assertCropDrops } = require('./helpers/loose-output.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { FarmSweep } = require('../.domain-build/application/FarmSweep');
const { cropSupportsField } = require('../.domain-build/domain/crops');
const { townSession, DEMO_REVISION_KEY } = require('../.domain-build/application/TownProfiles');
const { SAVE_KEY } = require('../.domain-build/domain/storage');
const { handbookEntry } = require('../.domain-build/application/HandbookModel');

function fixture(size = 3, irrigated = false) {
  const state = g.createDemoGame(100000);
  const farm = state.buildings.find(
    (b) => b.kind === 'farm' && g.farmGridSize(b) === size && Boolean(b.irrigated) === irrigated,
  );
  farm.cropJobs.fill(null);
  return { state, id: farm.id, cell: size * size - 1 };
}
function reject(state, command, pattern) {
  const before = g.exportSave(state);
  const result = g.dispatch(state, command, state.lastSeenAt + 1);
  assert.equal(result.ok, false);
  assert.match(result.error, pattern);
  assert.equal(result.state, state);
  assert.equal(g.exportSave(state), before, 'no inventory, time, ID, tools or save mutation');
}
function accept(state, command, now = state.lastSeenAt) {
  const before = g.exportSave(state);
  const result = g.dispatch(state, command, now);
  assert.equal(result.ok, true, result.error);
  assert.equal(g.exportSave(state), before);
  return result.state;
}

test('irrigation recipe describes dryland limits and remains undiscovered after a blocked attempt', () => {
  const recipe = g.RECIPE_DEFINITIONS.find((entry) => entry.id === 'irrigate-farm');
  assert.match(recipe.description, /空田地或空大田地/);
  assert.match(recipe.description, /有旱作物时须先收获/);
  assert.match(recipe.description, /胡萝卜、小麦、生菜只能种在旱田/);
  assert.match(recipe.description, /水稻|稻谷/);
  assert.doesNotMatch(recipe.description, /水田作物尚未开放/);
  assert.match(recipe.description, /旧档水田已有作物保留原计时和产量/);
  assert.doesNotMatch(recipe.description, /保留全部作物|沿用原有作物/);
  let state = g.createGame(100000);
  assert.equal(handbookEntry(state, recipe).discovered, false);
  state = accept(state, { type: 'plantCell', buildingId: 'b2', cell: 0 });
  const irrigation = { type: 'useTool', tool: 'wateringCan', buildingId: 'b2' };
  reject(state, irrigation, /请先收获.*旱作物/);
  assert.equal(handbookEntry(state, recipe).discovered, false);
  state = accept(state, { type: 'harvestCell', buildingId: 'b2', cell: 0 }, 115000);
  state = accept(state, irrigation);
  assert.equal(handbookEntry(state, recipe).discovered, true);
});

for (const size of [3, 6])
  for (const crop of g.CROP_KEYS.filter((crop) => g.CROPS[crop].field === 'dry')) {
    test(`${size}x${size} water field rejects direct and repeated swept ${crop} planting atomically`, () => {
      const { state, id, cell } = fixture(size, true);
      assert.equal(cropSupportsField(crop, true), false);
      assert.equal(cropSupportsField(crop, false), true);
      const reason = new RegExp(`${g.CROPS[crop].label}.*旱田.*水田`);
      reject(state, { type: 'plantCell', buildingId: id, cell, crop }, reason);
      const sweep = new FarmSweep();
      for (const rotation of [0, 1, 2, 3]) {
        state.buildings.find((b) => b.id === id).rotation = rotation;
        sweep.begin('plant', crop);
        for (const index of [0, cell]) {
          const command = sweep.command(state, id, index);
          assert.ok(command);
          reject(state, command, reason);
          assert.equal(sweep.command(state, id, index), null);
        }
        sweep.cancel();
        assert.equal(sweep.command(state, id, cell), null);
      }
      state.inventory[crop] = 0;
      reject(state, { type: 'plantCell', buildingId: id, cell, crop }, reason);
    });

    test(`${size}x${size} ${crop} field cannot be flooded before harvest, including mature crops`, () => {
      const { state: initial, id, cell } = fixture(size);
      let state = accept(initial, { type: 'plantCell', buildingId: id, cell, crop });
      const snapshot = structuredClone(state.buildings.find((b) => b.id === id).cropJobs[cell]);
      const command = { type: 'useTool', tool: 'wateringCan', buildingId: id };
      reject(state, command, /请先收获.*旱作物/);
      state = g.importSave(g.exportSave(state), snapshot.readyAt);
      reject(state, command, /请先收获.*旱作物/);
      assert.deepEqual(state.buildings.find((b) => b.id === id).cropJobs[cell], snapshot);
      state = accept(state, { type: 'harvestCell', buildingId: id, cell });
      const before = structuredClone(state);
      state = accept(state, command);
      assert.equal(state.buildings.find((b) => b.id === id).irrigated, true);
      assert.deepEqual(state.inventory, before.inventory);
      assert.deepEqual(state.tools, before.tools);
      assert.equal(state.coins, before.coins);
      assert.deepEqual(g.importSave(g.exportSave(state), state.lastSeenAt), state);
      assertCropDrops(
        state,
        state.buildings.find((b) => b.id === id),
        [cell],
        crop,
        snapshot.yield,
      );
      reject(state, { type: 'plantCell', buildingId: id, cell, crop }, /拾取.*掉落物/);
      state = pickupDrops(
        state,
        (drop) => drop.source.type === 'crop' && drop.source.jobId === snapshot.id,
      );
      reject(state, { type: 'plantCell', buildingId: id, cell, crop }, /旱田.*水田/);
    });

    test(`${size}x${size} old water-field ${crop} saves keep crop identity, timers and promised output`, () => {
      const { state: original, id, cell } = fixture(size);
      let state = accept(original, { type: 'plantCell', buildingId: id, cell, crop });
      const farm = state.buildings.find((b) => b.id === id);
      farm.irrigated = true; // A pre-fix save, not a newly permitted command.
      farm.cropJobs[cell].yield = 3;
      const snapshot = structuredClone(farm.cropJobs[cell]);
      state = g.importSave(g.exportSave(state), state.lastSeenAt);
      assert.deepEqual(state.buildings.find((b) => b.id === id).cropJobs[cell], snapshot);
      reject(state, { type: 'harvestCell', buildingId: id, cell }, /尚未成熟/);
      const full = structuredClone(state);
      full.inventory.wood += g.getCapacity(full) - g.getUsedStorage(full);
      full.lastSeenAt = snapshot.readyAt;
      const fullHarvest = accept(full, { type: 'harvestCell', buildingId: id, cell });
      assert.deepEqual(fullHarvest.inventory, full.inventory);
      assertCropDrops(
        fullHarvest,
        full.buildings.find((b) => b.id === id),
        [cell],
        crop,
        snapshot.yield,
      );
      const fullDrop = fullHarvest.looseDrops.find((drop) => drop.source.jobId === snapshot.id);
      reject(fullHarvest, { type: 'pickupDrop', dropId: fullDrop.id }, /仓.*空间不足/);
      assert.equal(
        fullHarvest.looseDrops.find((drop) => drop.id === fullDrop.id).amount,
        snapshot.yield,
      );
      const before = state.inventory[crop];
      state = accept(state, { type: 'harvestCell', buildingId: id, cell }, snapshot.readyAt);
      assert.equal(state.inventory[crop], before);
      assertCropDrops(state, farm, [cell], crop, snapshot.yield);
      state = pickupDrops(
        state,
        (drop) => drop.source.type === 'crop' && drop.source.jobId === snapshot.id,
      );
      assert.equal(state.inventory[crop], before + snapshot.yield);
      assert.equal(state.buildings.find((b) => b.id === id).cropJobs[cell], null);
      reject(state, { type: 'plantCell', buildingId: id, cell, crop }, /旱田.*水田/);
      assert.deepEqual(g.importSave(g.exportSave(state), state.lastSeenAt), state);
    });
  }

for (const size of [3, 6])
  test(`legacy start/default carrot planting also rejects ${size}x${size} water fields`, () => {
    const { state, id, cell } = fixture(size, true);
    reject(state, { type: 'start', buildingId: id }, /胡萝卜.*旱田.*水田/);
    reject(state, { type: 'plantCell', buildingId: id, cell }, /胡萝卜.*旱田.*水田/);
  });

test('an old water-field carrot job without economic snapshots keeps its original yield', () => {
  const { state, id, cell } = fixture(3, true);
  const job = { id: `j${state.nextId++}`, crop: 'vegetable', startedAt: 100000, readyAt: 115000 };
  state.buildings.find((b) => b.id === id).cropJobs[cell] = job;
  const saved = g.importSave(g.exportSave(state), 100000);
  assert.deepEqual(saved.buildings.find((b) => b.id === id).cropJobs[cell], job);
  let next = accept(saved, { type: 'harvestCell', buildingId: id, cell }, job.readyAt);
  assert.equal(next.inventory.vegetable, state.inventory.vegetable);
  assertCropDrops(
    next,
    state.buildings.find((b) => b.id === id),
    [cell],
    'vegetable',
  );
  next = pickupDrops(next, (drop) => drop.source.type === 'crop' && drop.source.jobId === job.id);
  assert.equal(next.inventory.vegetable, state.inventory.vegetable + 2);
});

test('updating the demo does not rewrite saved paddy crops or the normal town', () => {
  const data = new Map();
  const store = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  const normal = g.exportSave(g.createGame(100000));
  store.setItem(SAVE_KEY, normal);
  const { state, id, cell } = fixture(6, true);
  state.buildings.find((b) => b.id === id).cropJobs[cell] = {
    id: `j${state.nextId++}`,
    crop: 'wheat',
    startedAt: 100000,
    readyAt: 115000,
    durationMs: 15000,
    yield: 4,
  };
  const raw = g.exportSave(state);
  const demoKey = `town-evolution.demo.${SAVE_KEY}`;
  store.setItem(demoKey, raw);
  store.setItem(DEMO_REVISION_KEY, '2026-11-05-playable-catalog-3');
  const session = townSession(store, 'demo', () => 100000);
  assert.match(session.message, /模板已更新/);
  assert.deepEqual(session.state, state);
  assert.equal(store.getItem(demoKey), raw);
  assert.equal(store.getItem(SAVE_KEY), normal);
  assert.ok(session.reset());
  const paddies = session.state.buildings.filter((b) => b.irrigated);
  const large = paddies.find((b) => b.farmSize === 6);
  assert.equal(large.cropJobs.filter(Boolean).length, 9);
  assert.ok(large.cropJobs.filter(Boolean).every((j) => j.crop === 'rice'));
  const small = paddies.filter((b) => b.farmSize !== 6);
  assert.equal(small.length, 3);
  assert.ok(small.every((b) => b.cropJobs.every((j) => !j)));
  assert.equal(store.getItem(SAVE_KEY), normal);
});
