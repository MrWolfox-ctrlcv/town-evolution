const { test } = require('node:test');
const assert = require('node:assert/strict');
const { looseAmount, pickupDrops } = require('./helpers/loose-output.cjs');
const {
  createGame,
  dispatch,
  importSave,
  exportSave,
  CROPS,
  CONFIG,
} = require('../.domain-build/domain/game.js');
const { SAVE_KEY, loadGame, saveGame } = require('../.domain-build/domain/storage.js');
const { MAX_CROP_DURATION, MAX_CROP_YIELD } = require('../.domain-build/domain/crops.js');

function run(state, command, now = state.lastSeenAt) {
  const result = dispatch(state, command, now);
  assert.equal(result.ok, true, result.error);
  return result.state;
}
const plant = { type: 'plantCell', buildingId: 'b2', cell: 0, crop: 'wheat' };
const harvest = { type: 'harvestCell', buildingId: 'b2', cell: 0 };
function configure(work) {
  const original = { ...CROPS.wheat };
  const oldDuration = CONFIG.cropDurationMs;
  try {
    return work();
  } finally {
    Object.assign(CROPS.wheat, original);
    CONFIG.cropDurationMs = oldDuration;
  }
}

test('crop purchase and planted snapshots retain configured duration and yield across balancing and save', () =>
  configure(() => {
    Object.assign(CROPS.wheat, { durationMs: 30000, yield: 4, buy: 12 });
    let state = createGame(0);
    const coins = state.coins;
    state = run(state, { type: 'buyCrop', item: 'wheat', quantity: 1 });
    assert.equal(state.coins, coins - 12);
    assert.equal(state.inventory.wheat, 1);
    state = run(state, plant, 1000);
    assert.equal(state.inventory.wheat, 0);
    assert.deepEqual(state.buildings[1].cropJobs[0], {
      id: 'j3',
      startedAt: 1000,
      readyAt: 31000,
      crop: 'wheat',
      durationMs: 30000,
      yield: 4,
    });
    Object.assign(CROPS.wheat, { durationMs: 2000, yield: 1, buy: 5 });
    CONFIG.cropDurationMs = 9000;
    state = importSave(exportSave(state), 1000);
    assert.equal(state.buildings[1].cropJobs[0].readyAt, 31000);
    assert.equal(state.buildings[1].cropJobs[0].yield, 4);
    const early = dispatch(state, harvest, 30999);
    assert.equal(early.ok, false);
    assert.equal(early.state, state);
    state = run(state, harvest, 31000);
    assert.equal(state.inventory.wheat, 0);
    assert.equal(looseAmount(state, 'wheat'), 4);
    state = pickupDrops(state);
    assert.equal(state.inventory.wheat, 4);
  }));

test('schema 8 crop jobs without snapshots preserve legacy 15 second and two item output', () =>
  configure(() => {
    let state = run(createGame(0), { type: 'buyCrop', item: 'wheat', quantity: 1 });
    state = run(state, plant);
    const raw = JSON.parse(exportSave(state));
    raw.schemaVersion = 8;
    delete raw.looseDrops;
    for (const item of ['rice', 'sapling', 'milledRice', 'flour', 'bread'])
      delete raw.inventory[item];
    delete raw.buildings[1].cropJobs[0].durationMs;
    delete raw.buildings[1].cropJobs[0].yield;
    Object.assign(CROPS.wheat, { durationMs: 30000, yield: 4, buy: 12 });
    CONFIG.cropDurationMs = 30000;
    state = importSave(JSON.stringify(raw), 0);
    assert.equal(state.buildings[1].cropJobs[0].readyAt, 15000);
    assert.equal(dispatch(state, harvest, 14999).ok, false);
    state = run(state, harvest, 15000);
    assert.equal(state.inventory.wheat, 0);
    assert.equal(looseAmount(state, 'wheat'), 2);
    state = pickupDrops(state);
    assert.equal(state.inventory.wheat, 2);
  }));

test('invalid crop snapshots are rejected without replacing corrupted storage', () =>
  configure(() => {
    let state = run(createGame(0), { type: 'buyCrop', item: 'wheat', quantity: 1 });
    state = run(state, plant);
    const saved = JSON.parse(exportSave(state));
    const mutations = [
      (j) => delete j.durationMs,
      (j) => delete j.yield,
      ...[0, -1, NaN, MAX_CROP_DURATION + 1].map((n) => (j) => {
        j.durationMs = n;
      }),
      ...[0, -1, NaN, MAX_CROP_YIELD + 1].map((n) => (j) => {
        j.yield = n;
      }),
      (j) => {
        j.readyAt++;
      },
    ];
    for (const mutate of mutations) {
      const raw = structuredClone(saved);
      mutate(raw.buildings[1].cropJobs[0]);
      const text = JSON.stringify(raw);
      assert.throws(() => importSave(text, 0));
      const data = new Map([[SAVE_KEY, text]]);
      const storage = {
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => data.set(key, value),
      };
      assert.equal(loadGame(storage, 0).status, 'corrupt');
      assert.throws(() => saveGame(storage, createGame(0)));
      assert.equal(data.get(SAVE_KEY), text);
    }
  }));
