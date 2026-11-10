const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.env.V6_SLOT_BUILD || path.join(__dirname, '..', '.domain-build');
const { V6WorldPreparation } = require(path.join(root, 'domain/v6-preparation'));
const { createGame, exportSave } = require(path.join(root, 'domain/game'));
const { SAVE_KEY, BACKUP_KEY } = require(path.join(root, 'domain/storage'));
const { GameStart } = require(path.join(root, 'application/GameStart'));
const { townSession, profileStorage } = require(path.join(root, 'application/TownProfiles'));
const { inspectSlot, inspectSlotRaw, writeSlot } = require(
  path.join(root, 'application/ManualSaves'),
);
const { inspectV6Slot } = require(path.join(root, 'application/V6SlotInspection'));
const now = 60000;
const slotKey = `${SAVE_KEY}.manual.1`;
const wrap = (save) => JSON.stringify({ format: 1, savedAt: now, save });
let v6, legacy;
before(() => {
  // One real world shared by every case; reuses an already prepared world if available.
  const job = new V6WorldPreparation(42173);
  for (let i = 0; i < 20000 && job.progress.status === 'building'; i++) job.step(16384);
  assert.equal(job.progress.status, 'ready');
  job.takeResult();
  v6 = exportSave(createGame(now, 42173, 6));
  legacy = exportSave(createGame(now));
});
function fixture() {
  const bytes = new Map();
  const writes = [];
  const storage = {
    getItem: (key) => bytes.get(key) ?? null,
    setItem: (key, value) => {
      writes.push(key);
      bytes.set(key, value);
    },
    removeItem: (key) => bytes.delete(key),
  };
  return { bytes, writes, storage };
}
test('manual raw parsing preserves exact revisions, validates full content and roundtrips both terrains', () => {
  for (const raw of [v6, legacy]) {
    const { storage } = fixture();
    const parsed = inspectSlotRaw(wrap(raw), now);
    assert.equal(parsed.status, 'ready');
    assert.equal(parsed.revision, wrap(raw));
    assert.equal(parsed.savedAt, now);
    writeSlot(storage, 1, parsed.state, now, null);
    const restored = inspectSlot(storage, 1, now);
    assert.equal(restored.status, 'ready');
    assert.equal(restored.state.terrainVersion, parsed.state.terrainVersion);
    assert.equal(exportSave(restored.state), exportSave(parsed.state));
  }
});
test('v6 inspection parses one snapshot rather than a later legacy or malformed read', () => {
  for (const replacement of [wrap(legacy), '{', null]) {
    let reads = 0;
    const storage = { getItem: () => (++reads === 1 ? wrap(v6) : replacement) };
    const slot = inspectV6Slot(storage, 1, now);
    assert.equal(reads, 1);
    assert.equal(slot.status, 'ready');
    assert.equal(slot.state.terrainVersion, 6);
    assert.equal(slot.revision, wrap(v6));
  }
});
test('normal inspection also reads once and does not impose v6 restrictions', () => {
  let reads = 0;
  const slot = inspectSlot({ getItem: () => (++reads === 1 ? wrap(legacy) : wrap(v6)) }, 1, now);
  assert.equal(reads, 1);
  assert.equal(slot.status, 'ready');
  assert.equal(slot.state.terrainVersion, 4);
  assert.equal(slot.revision, wrap(legacy));
});
test('legacy slots are rejected only by v6 inspection', () => {
  const { storage } = fixture();
  storage.setItem(slotKey, wrap(legacy));
  assert.equal(inspectSlot(storage, 1, now).status, 'ready');
  const rejected = inspectV6Slot(storage, 1, now);
  assert.equal(rejected.status, 'corrupt');
  assert.equal(rejected.revision, wrap(legacy));
});
test('unprepared v6 header stays pending without synchronous generation or a second read', () => {
  const save = JSON.parse(v6);
  save.mapSeed = 42174;
  const raw = wrap(JSON.stringify(save));
  let reads = 0;
  const slot = inspectV6Slot({ getItem: () => (++reads, raw) }, 1, now);
  assert.equal(reads, 1);
  assert.equal(slot.status, 'pending');
  assert.equal(slot.state, null);
  assert.equal(slot.savedAt, now);
  assert.equal(slot.revision, raw);
});
test('empty, inaccessible, invalid-key and malformed slots retain revision/error semantics', () => {
  for (const inspect of [inspectSlot, inspectV6Slot]) {
    const empty = inspect({ getItem: () => null }, 1, now);
    assert.equal(empty.status, 'empty');
    assert.equal(empty.revision, null);
    const denied = inspect(
      {
        getItem: () => {
          throw Error('denied');
        },
      },
      1,
      now,
    );
    assert.equal(denied.status, 'corrupt');
    assert.equal(Object.hasOwn(denied, 'revision'), false);
    let reads = 0;
    const invalid = inspect({ getItem: () => (++reads, wrap(v6)) }, 4, now);
    assert.equal(invalid.status, 'corrupt');
    assert.equal(Object.hasOwn(invalid, 'revision'), false);
    assert.equal(reads, 0);
    const broken = JSON.parse(v6);
    broken.coins = -1;
    for (const raw of [
      '{',
      '{}',
      wrap(JSON.stringify(broken)),
      JSON.stringify({ format: 1, savedAt: -1, save: v6 }),
    ]) {
      const slot = inspect({ getItem: () => raw }, 1, now);
      assert.equal(slot.status, 'corrupt');
      assert.equal(slot.revision, raw);
    }
  }
});
test('manual confirmation rejects changed slot bytes without changing primary or activating', () => {
  const { storage, writes } = fixture();
  const scoped = profileStorage(storage, 'v6-preview');
  scoped.setItem(SAVE_KEY, v6);
  let reads = 0;
  const get = storage.getItem;
  storage.getItem = (key) =>
    key.endsWith('.manual.1') ? (++reads % 2 ? wrap(v6) : wrap(legacy)) : get(key);
  writes.length = 0;
  const flow = new GameStart(storage, () => now);
  flow.chooseProfile('v6-preview');
  flow.loadSlot();
  assert.equal(flow.page, 'confirm');
  flow.confirm();
  assert.equal(reads, 2);
  assert.equal(flow.session, null);
  assert.equal(scoped.getItem(SAVE_KEY), v6);
  assert.equal(writes.length, 0);
});
test('valid v6 manual load activates and saves a compatible roundtrip', () => {
  const { storage } = fixture();
  const scoped = profileStorage(storage, 'v6-preview');
  scoped.setItem(SAVE_KEY, v6);
  scoped.setItem(slotKey, wrap(v6));
  const flow = new GameStart(storage, () => now);
  flow.chooseProfile('v6-preview');
  flow.loadSlot();
  flow.confirm();
  assert.equal(flow.page, 'game');
  assert.equal(flow.session.state.terrainVersion, 6);
  assert.equal(flow.session.save(), true);
  assert.equal(JSON.parse(scoped.getItem(SAVE_KEY)).terrainVersion, 6);
});
test('actual v6 session marks legacy primary and backup corrupt without writes', () => {
  for (const source of ['primary', 'backup']) {
    const { storage, writes } = fixture();
    const scoped = profileStorage(storage, 'v6-preview');
    scoped.setItem(SAVE_KEY, source === 'primary' ? legacy : '{');
    if (source === 'backup') scoped.setItem(BACKUP_KEY, legacy);
    writes.length = 0;
    const session = townSession(storage, 'v6-preview', () => now);
    assert.equal(session.mode, 'corrupt');
    assert.equal(session.save(), false);
    assert.equal(writes.length, 0);
    assert.equal(scoped.getItem(SAVE_KEY), source === 'primary' ? legacy : '{');
  }
  const { storage } = fixture();
  storage.setItem(SAVE_KEY, legacy);
  assert.equal(townSession(storage, 'normal', () => now).mode, 'normal');
});
test('start rejects a primary replaced after its earlier v6 inspection', () => {
  const { storage, bytes, writes } = fixture();
  const scoped = profileStorage(storage, 'v6-preview');
  scoped.setItem(SAVE_KEY, v6);
  let flow,
    switched = false;
  const get = storage.getItem;
  storage.getItem = (key) => {
    const raw = get(key);
    if (
      !switched &&
      flow?.preparation.active === false &&
      flow?.page === 'title' &&
      key.endsWith(SAVE_KEY) &&
      raw === v6
    ) {
      switched = true;
      bytes.set(key, legacy);
    }
    return raw;
  };
  writes.length = 0;
  flow = new GameStart(storage, () => now);
  flow.start('v6-preview');
  for (let i = 0; i < 100 && flow.page === 'preparing'; i++) flow.tickPreparation();
  assert.equal(switched, true);
  assert.equal(flow.page, 'saves');
  assert.equal(flow.session, null);
  assert.equal(writes.length, 0);
  assert.equal(scoped.getItem(SAVE_KEY), legacy);
});
test('compatible v6 startup and save remain available', () => {
  const { storage } = fixture();
  const scoped = profileStorage(storage, 'v6-preview');
  scoped.setItem(SAVE_KEY, v6);
  const flow = new GameStart(storage, () => now);
  flow.start('v6-preview');
  for (let i = 0; i < 100 && flow.page === 'preparing'; i++) flow.tickPreparation();
  assert.equal(flow.page, 'game');
  assert.equal(flow.session.mode, 'normal');
  assert.equal(flow.session.state.terrainVersion, 6);
  assert.equal(flow.session.save(), true);
});
test('actual backup recovery action refuses a legacy candidate in the v6 profile', () => {
  const { storage, writes } = fixture();
  const scoped = profileStorage(storage, 'v6-preview');
  scoped.setItem(SAVE_KEY, '{');
  scoped.setItem(BACKUP_KEY, legacy);
  writes.length = 0;
  const flow = new GameStart(storage, () => now);
  flow.chooseProfile('v6-preview');
  flow.recover();
  assert.equal(flow.page, 'confirm');
  flow.confirm();
  for (let i = 0; i < 100 && flow.page === 'preparing'; i++) flow.tickPreparation();
  assert.notEqual(flow.page, 'preparing');
  assert.equal(flow.session, null);
  assert.equal(writes.length, 0);
  assert.equal(scoped.getItem(SAVE_KEY), '{');
  assert.equal(scoped.getItem(BACKUP_KEY), legacy);
  assert.match(flow.message, /备份未通过验证或已改变/);
});
