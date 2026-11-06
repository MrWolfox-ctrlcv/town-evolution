const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createGame,
  exportSave,
  importSave,
  worldSize,
} = require('../.domain-build/domain/game.js');
const { validatePlacement } = require('../.domain-build/domain/geometry.js');
const { MAX_SAVE_CHARACTERS } = require('../.domain-build/domain/save.js');
const { SAVE_KEY, saveGame, loadGame } = require('../.domain-build/domain/storage.js');
const { GameStart } = require('../.domain-build/application/GameStart.js');
const {
  inspectSlot,
  writeSlot,
  MAX_MANUAL_SAVE_CHARACTERS,
} = require('../.domain-build/application/ManualSaves.js');
const NOW = 100000;
const slotKey = (slot = 1) => `${SAVE_KEY}.manual.${slot}`;

/** A populated town accepted by the real save validator, not padding or an invalid payload. */
function populatedTown() {
  const state = createGame(NOW, 42173);
  const size = worldSize(state.terrainVersion);
  let farms = 0;
  for (let z = 1; z < size - 2 && farms < 400; z += 2)
    for (let x = 1; x < size - 2 && farms < 400; x += 2) {
      const building = {
        id: `b${state.nextId}`,
        kind: 'farm',
        x,
        z,
        rotation: 0,
        cropJobs: Array(9).fill(null),
      };
      try {
        validatePlacement(state, building);
      } catch {
        continue;
      }
      state.nextId++;
      building.cropJobs = building.cropJobs.map(() => ({
        id: `j${state.nextId++}`,
        crop: 'vegetable',
        startedAt: NOW,
        readyAt: NOW + 15000,
        durationMs: 15000,
        yield: 2,
      }));
      state.buildings.push(building);
      farms++;
    }
  assert.equal(farms, 400);
  return importSave(exportSave(state), NOW);
}
const town = populatedTown();

function fixture() {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  return { data, storage, flow: () => new GameStart(storage, () => NOW) };
}

test('a legal large town survives manual save, overwrite and title restore beyond the old limit', () => {
  const { data, storage, flow: start } = fixture();
  saveGame(storage, town);
  assert.equal(loadGame(storage, NOW).status, 'loaded');
  const flow = start();
  assert.equal(flow.start(), true);
  flow.saves();
  flow.chooseSlot(1);
  flow.saveSlot();
  const first = data.get(slotKey());
  assert.ok(first.length > 500000, 'the wrapper must really exceed the old parser limit');
  assert.ok(first.length <= MAX_MANUAL_SAVE_CHARACTERS);
  assert.match(flow.message, /已保存到手动存档/);
  assert.equal(flow.inspectSlot().status, 'ready');
  assert.deepEqual(flow.inspectSlot().state, town);

  flow.session.state.coins = 87;
  flow.saveSlot();
  assert.equal(flow.page, 'confirm');
  assert.equal(data.get(slotKey()), first);
  flow.confirm();
  assert.equal(data.get(`${slotKey()}.before-overwrite`), first);
  const replacement = data.get(slotKey());
  assert.equal(flow.inspectSlot().state.coins, 87);

  const title = start();
  title.saves();
  title.chooseSlot(1);
  title.loadSlot();
  assert.equal(title.page, 'confirm');
  assert.equal(title.session, null);
  title.confirm();
  assert.equal(title.page, 'game');
  assert.deepEqual(title.session.state, { ...town, coins: 87 });
  assert.equal(data.get(slotKey()), replacement, 'loading does not rewrite the manual slot');
  assert.equal(loadGame(storage, NOW).state.coins, 87);
});

test('manual outer and embedded save parsers retain exact bounded limits without modifying bytes', () => {
  const { data, storage } = fixture();
  writeSlot(storage, 1, town, NOW);
  const original = data.get(slotKey());
  const boundary = original + ' '.repeat(MAX_MANUAL_SAVE_CHARACTERS - original.length);
  data.set(slotKey(), boundary);
  assert.equal(inspectSlot(storage, 1, NOW).status, 'ready');
  const hostile = boundary + ' ';
  data.set(slotKey(), hostile);
  assert.equal(inspectSlot(storage, 1, NOW).status, 'corrupt');
  assert.equal(data.get(slotKey()), hostile);

  const save = exportSave(town);
  const innerBoundary = save + ' '.repeat(MAX_SAVE_CHARACTERS - save.length);
  data.set(slotKey(), JSON.stringify({ format: 1, savedAt: NOW, save: innerBoundary }));
  assert.equal(inspectSlot(storage, 1, NOW).status, 'ready');
  const oversizedInner = JSON.stringify({ format: 1, savedAt: NOW, save: innerBoundary + ' ' });
  assert.ok(oversizedInner.length < MAX_MANUAL_SAVE_CHARACTERS);
  data.set(slotKey(), oversizedInner);
  assert.equal(inspectSlot(storage, 1, NOW).status, 'corrupt');
  assert.equal(data.get(slotKey()), oversizedInner);
});

test('oversized state and failed backup writes preserve the previous slot and archive', () => {
  const { data, storage } = fixture();
  writeSlot(storage, 1, { ...town, coins: 91 }, NOW);
  writeSlot(storage, 1, town, NOW);
  const before = [...data.entries()];
  let writes = 0;
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    writes++;
    write(key, value);
  };
  assert.throws(
    () =>
      writeSlot(storage, 1, { ...town, untrustedPadding: ' '.repeat(MAX_SAVE_CHARACTERS) }, NOW),
    /存档过大/,
  );
  assert.equal(writes, 0, 'oversized input fails before any storage mutation');
  assert.deepEqual([...data.entries()], before);
  storage.setItem = () => {
    throw Error('quota');
  };
  assert.throws(() => writeSlot(storage, 1, { ...town, coins: 42 }, NOW), /quota/);
  assert.deepEqual([...data.entries()], before);

  storage.setItem = (key, value) => {
    if (key === slotKey()) throw Error('quota on final write');
    write(key, value);
  };
  const previous = data.get(slotKey());
  assert.throws(() => writeSlot(storage, 1, { ...town, coins: 42 }, NOW), /quota/);
  assert.equal(data.get(slotKey()), previous, 'a failed final write leaves the old slot intact');
  assert.equal(data.get(`${slotKey()}.before-overwrite`), previous);
});

test('large manual overwrite and load confirmations reject a newer same-time slot', () => {
  for (const operation of ['saveSlot', 'loadSlot']) {
    const { data, storage, flow: start } = fixture();
    saveGame(storage, town);
    writeSlot(storage, 1, town, NOW);
    const flow = start();
    assert.ok(flow.start());
    flow.chooseSlot(1);
    flow.session.state.coins = 84;
    const live = flow.session;
    flow[operation]();
    assert.equal(flow.page, 'confirm');
    writeSlot(storage, 1, { ...town, coins: 37 }, NOW);
    const before = [...data.entries()];
    flow.confirm();
    assert.deepEqual([...data.entries()], before, operation);
    assert.equal(flow.session, live);
    assert.equal(flow.session.state.coins, 84);
    assert.match(flow.message, /另一页面/);
  }
});

test('a stale large town can be rescued to an empty slot without overwriting the newer autosave', () => {
  const { data, storage, flow: start } = fixture();
  saveGame(storage, town);
  const first = start(),
    stale = start();
  assert.ok(first.start());
  assert.ok(stale.start());
  first.session.state.coins = 97;
  assert.ok(first.session.save());
  stale.session.state.coins = 83;
  assert.equal(stale.session.save(), false);
  const primary = data.get(SAVE_KEY);
  stale.saves();
  stale.chooseSlot(3);
  stale.saveSlot();
  assert.equal(stale.inspectSlot(3).status, 'ready');
  assert.deepEqual(stale.inspectSlot(3).state, { ...town, coins: 83 });
  assert.equal(data.get(SAVE_KEY), primary);
  assert.equal(loadGame(storage, NOW).state.coins, 97);
});
