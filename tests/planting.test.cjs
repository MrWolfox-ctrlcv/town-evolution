const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGame, dispatch, importSave, exportSave } = require('../.domain-build/domain/game.js');
const { SAVE_KEY, BACKUP_KEY, loadGame, saveGame } = require('../.domain-build/domain/storage.js');

const { validatePlacement } = require('../.domain-build/domain/geometry.js');
const {
  CONFIG,
  isDockShore,
  isLandCell,
  landCellCount,
} = require('../.domain-build/domain/game.js');
function place(s, kind) {
  for (let z = 0; z < CONFIG.gridSize; z++) {
    for (let x = 0; x < CONFIG.gridSize; x++) {
      const b = { id: `b${s.nextId}`, kind, x, z, rotation: 0 };
      try {
        validatePlacement(s, b);
      } catch {
        continue;
      }
      if (kind === 'dock' && !isDockShore(b, s.mapSeed)) continue;
      return run(s, { type: 'place', kind, x, z });
    }
  }
  assert.fail(`No legal placement for ${kind}`);
}

function run(s, c, t = s.lastSeenAt) {
  const before = JSON.stringify(s),
    r = dispatch(s, c, t);
  assert.equal(r.ok, true, r.error);
  assert.equal(JSON.stringify(s), before);
  return r.state;
}
function fail(s, c, t = s.lastSeenAt) {
  const before = JSON.stringify(s),
    r = dispatch(s, c, t);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), before);
}
const plant = (cell) => ({ type: 'plantCell', buildingId: 'b2', cell });
const harvest = (cell) => ({ type: 'harvestCell', buildingId: 'b2', cell });
test('nine cells plant independently, consuming one each and yielding two only per touched cell', () => {
  let s = {
    ...createGame(0),
    inventory: { vegetable: 9, chilledVegetable: 0, wheat: 0, lettuce: 0, wood: 0, stone: 0 },
  };
  for (let cell = 0; cell < 9; cell++) s = run(s, plant(cell), cell * 1000);
  assert.equal(s.inventory.vegetable, 0);
  assert.equal(s.buildings[1].cropJobs.filter(Boolean).length, 9);
  fail(s, plant(0), 9000);
  fail(s, harvest(8), 15000);
  s = run(s, harvest(0), 15000);
  assert.equal(s.inventory.vegetable, 2);
  assert.equal(s.buildings[1].cropJobs[0], null);
  assert.equal(s.buildings[1].cropJobs.filter(Boolean).length, 8);
  fail(s, harvest(0));
  for (let cell = 1; cell < 8; cell++) s = run(s, harvest(cell), 23000);
  assert.equal(s.inventory.vegetable, 16);
  fail(s, harvest(8));
  assert.ok(s.buildings[1].cropJobs[8]);
  s = run(s, plant(0));
  s = run(s, plant(1));
  s = run(s, harvest(8));
  assert.equal(s.inventory.vegetable, 16);
});
test('bad cell indices, empty inventory and failed clocks preserve all crops and ids', () => {
  const s = createGame(0);
  for (const cell of [-1, 9, 1.5, NaN, Infinity]) {
    fail(s, plant(cell));
    fail(s, harvest(cell));
  }
  fail(
    {
      ...s,
      inventory: { vegetable: 0, chilledVegetable: 3, wheat: 0, lettuce: 0, wood: 0, stone: 0 },
    },
    plant(0),
  );
  fail(s, { ...plant(0), buildingId: 'b1' });
  fail({ ...s, nextId: 1000000000 }, plant(0));
  fail(s, plant(0), NaN);
});
test('direct purchase works without shop, charges exact price and rejects invalid or full purchases', () => {
  let s = {
    ...createGame(0),
    inventory: { vegetable: 0, chilledVegetable: 0, wheat: 0, lettuce: 0, wood: 0, stone: 0 },
  };
  s = run(s, { type: 'buyCrop', item: 'vegetable', quantity: 9 });
  assert.equal(s.coins, 48);
  assert.equal(s.inventory.vegetable, 9);
  for (const quantity of [0, -1, 0.5, NaN, 1000000001])
    fail(s, { type: 'buyCrop', item: 'vegetable', quantity });
  fail(s, { type: 'buyCrop', item: 'chilledVegetable', quantity: 1 });
  fail(s, { type: 'buyCrop', item: 'vegetable', quantity: 8 });
  fail({ ...s, coins: 0 }, { type: 'buyCrop', item: 'vegetable', quantity: 1 });
});
test('last crop sale is allowed and there is no automatic seed grant', () => {
  let s = place(createGame(0), 'shop');
  s = run(s, { type: 'shopTrade', buildingId: 'b3', item: 'vegetable', quantity: 1, side: 'sell' });
  assert.equal(s.inventory.vegetable, 0);
  s = importSave(exportSave(s), 0);
  assert.equal(s.inventory.vegetable, 0);
  s = run(s, { type: 'buyCrop', item: 'vegetable', quantity: 1 });
  assert.equal(s.inventory.vegetable, 1);
});
test('explicit emergency seed is one-time, zero-money only, persisted and blocked by growing or staged crops', () => {
  let s = {
    ...createGame(0),
    coins: 0,
    inventory: { vegetable: 0, chilledVegetable: 0, wheat: 0, lettuce: 0, wood: 0, stone: 0 },
  };
  s = run(s, { type: 'recoverCrop' });
  assert.equal(s.inventory.vegetable, 1);
  assert.equal(s.cropRecoveryAvailable, false);
  s = importSave(exportSave(s), 0);
  fail(s, { type: 'recoverCrop' });
  s = run(s, plant(4));
  fail(s, { type: 'recoverCrop' });
  fail(
    {
      ...createGame(0),
      inventory: { vegetable: 0, chilledVegetable: 0, wheat: 0, lettuce: 0, wood: 0, stone: 0 },
    },
    { type: 'recoverCrop' },
  );
  const growing = run({ ...createGame(0), coins: 0 }, plant(8));
  fail(growing, { type: 'recoverCrop' });
  let dock = place(createGame(0), 'dock');
  dock = run(dock, {
    type: 'dockTransfer',
    buildingId: 'b3',
    item: 'vegetable',
    quantity: 1,
    direction: 'stage',
  });
  fail({ ...dock, coins: 0 }, { type: 'recoverCrop' });
});
function legacy(version) {
  const s = createGame(0);
  s.schemaVersion = version;
  if (version === 1) delete s.commerce;
  delete s.cropRecoveryAvailable;
  delete s.buildings[1].cropJobs;
  s.buildings[1].job = { id: 'j3', startedAt: 0, readyAt: 15000 };
  s.nextId = 4;
  s.inventory.vegetable = 0;
  return s;
}
test('old whole-field jobs are not silently imported into the new seeded island', () => {
  for (const version of [1, 2]) assert.throws(() => importSave(JSON.stringify(legacy(version)), 0));
});
test('current save validates nine cells, unique ids and exact timers; malformed current saves stay untouched', () => {
  const s = run(createGame(0), plant(0));
  for (const mutate of [
    (x) => x.buildings[1].cropJobs.pop(),
    (x) => (x.buildings[1].cropJobs[1] = x.buildings[1].cropJobs[0]),
    (x) => x.buildings[1].cropJobs[0].readyAt++,
    (x) => (x.buildings[0].cropJobs = Array(9).fill(null)),
    (x) => delete x.cropRecoveryAvailable,
  ]) {
    const raw = JSON.parse(JSON.stringify(s));
    mutate(raw);
    assert.throws(() => importSave(JSON.stringify(raw), 0));
  }
  const old = JSON.parse(exportSave(s));
  old.buildings[1].cropJobs[0].readyAt = 1;
  const text = JSON.stringify(old),
    data = new Map([[SAVE_KEY, text]]);
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  assert.equal(loadGame(storage, 0).status, 'corrupt');
  assert.equal(data.get(SAVE_KEY), text);
  assert.throws(() => saveGame(storage, createGame(0)));
  assert.equal(data.get(SAVE_KEY), text);
});
test('current crop save preserves exact raw backup and pending jobs', () => {
  const current = run(createGame(0), plant(4));
  const text = exportSave(current),
    data = new Map([[SAVE_KEY, text]]);
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
  const result = loadGame(storage, 0);
  assert.equal(result.status, 'loaded');
  assert.deepEqual(result.state, current);
  saveGame(storage, result.state);
  assert.equal(data.get(BACKUP_KEY), text);
  assert.equal(JSON.parse(data.get(SAVE_KEY)).schemaVersion, 8);
});
test('selling final seed for five coins permits once-only emergency recovery below purchase price', () => {
  let s = createGame(0);
  for (const kind of ['shop', 'cooler', 'warehouse']) s = place(s, kind);
  assert.equal(s.coins, 0);
  s = run(s, { type: 'shopTrade', buildingId: 'b3', item: 'vegetable', quantity: 1, side: 'sell' });
  assert.equal(s.coins, 5);
  fail(s, { type: 'buyCrop', item: 'vegetable', quantity: 1 });
  s = run(s, { type: 'recoverCrop' });
  assert.equal(s.coins, 5);
  assert.equal(s.inventory.vegetable, 1);
  s = run(s, { type: 'shopTrade', buildingId: 'b3', item: 'vegetable', quantity: 1, side: 'sell' });
  assert.equal(s.coins, 10);
  fail(s, { type: 'recoverCrop' });
  s = run(s, { type: 'buyCrop', item: 'vegetable', quantity: 1 });
  assert.equal(s.coins, 2);
  assert.equal(s.inventory.vegetable, 1);
});
