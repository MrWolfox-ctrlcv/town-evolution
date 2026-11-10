const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../.domain-build/domain/game');
const save = require('../.domain-build/domain/save');
const { GameSession } = require('../.domain-build/application/GameSession');
const { MAX_SAVE_CHARACTERS } = require('../.domain-build/domain/save-limits');
const {
  SAVE_KEY,
  BACKUP_KEY,
  SaveConflictError,
  loadGame,
  saveGame,
} = require('../.domain-build/domain/storage');
const buy = { type: 'buyCrop', item: 'vegetable', quantity: 1 };
function fixture() {
  const state = game.createGame(1000, 1, 1);
  const data = new Map([[SAVE_KEY, game.exportSave(state)]]);
  const writes = [];
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      writes.push(key);
      data.set(key, value);
    },
    removeItem: () => assert.fail('Never delete a save'),
  };
  return { state, data, writes, storage };
}

test('run dispatches exactly once, while preview stays non-committing and uncached', () => {
  const f = fixture(),
    session = new GameSession(f.storage, () => 1001),
    original = game.dispatch;
  let calls = 0;
  game.dispatch = (...args) => {
    calls++;
    return original(...args);
  };
  try {
    const before = game.exportSave(session.state);
    assert.equal(session.reason(buy), null);
    assert.equal(calls, 1);
    assert.equal(game.exportSave(session.state), before);
    assert.deepEqual(f.writes, []);
    assert.equal(session.run(buy), true);
    assert.equal(calls, 2);
    assert.equal(session.state.inventory.vegetable, 2);
    assert.equal(game.importSave(f.data.get(SAVE_KEY), 1001).inventory.vegetable, 2);

    assert.equal(session.reason(buy), null);
    session.state.coins = 0;
    const snapshot = JSON.stringify(session.state),
      writes = [...f.writes];
    assert.equal(session.run(buy), false);
    assert.equal(calls, 4);
    assert.equal(JSON.stringify(session.state), snapshot);
    assert.deepEqual(f.writes, writes);
  } finally {
    game.dispatch = original;
  }
});

test('only already-validated unchanged primary bytes avoid a second full import', () => {
  const f = fixture(),
    original = save.importSave;
  let imports = 0;
  save.importSave = (...args) => {
    imports++;
    return original(...args);
  };
  try {
    const loaded = loadGame(f.storage, 1001);
    assert.equal(imports, 1);
    let revision = saveGame(f.storage, { ...loaded.state, coins: 90 }, loaded.revision);
    assert.equal(imports, 1, 'Loaded bytes were already fully checked');
    revision = saveGame(f.storage, { ...loaded.state, coins: 80 }, revision);
    assert.equal(imports, 1, 'Our last exported bytes were already fully checked');

    const external = game.exportSave({ ...f.state, coins: 70 });
    f.data.set(SAVE_KEY, external);
    revision = saveGame(f.storage, { ...loaded.state, coins: 60 });
    assert.equal(imports, 2, 'Different source bytes require a full import');
    assert.equal(f.data.get(BACKUP_KEY), external);
    const snapshot = [...f.data];
    assert.throws(() => saveGame(f.storage, { ...f.state, coins: -1 }, revision));
    assert.deepEqual([...f.data], snapshot, 'Cached old bytes never make live state trusted');
  } finally {
    save.importSave = original;
  }
});

test('changed malformed or future primary remains protected even with forged revision bytes', () => {
  for (const corrupt of ['not JSON', JSON.stringify({ schemaVersion: 999 })]) {
    const f = fixture(),
      loaded = loadGame(f.storage, 1001);
    f.data.set(SAVE_KEY, corrupt);
    const before = [...f.data];
    assert.throws(
      () => saveGame(f.storage, { ...loaded.state, coins: 90 }, { primary: corrupt }),
      /主存档损坏/,
    );
    assert.deepEqual([...f.data], before);
    assert.deepEqual(f.writes, []);
  }
});

test('cached validation never suppresses exact-byte conflicts before backup writes', () => {
  const f = fixture(),
    loaded = loadGame(f.storage, 1001);
  f.data.set(SAVE_KEY, game.exportSave({ ...f.state, coins: 73 }));
  const before = [...f.data];
  assert.throws(
    () => saveGame(f.storage, { ...loaded.state, coins: 90 }, loaded.revision),
    SaveConflictError,
  );
  assert.deepEqual([...f.data], before);
  assert.deepEqual(f.writes, []);
});

test('cached validation retains the full four-million-character export boundary', () => {
  const f = fixture(),
    loaded = loadGame(f.storage, 1001),
    before = [...f.data];
  const oversized = { ...loaded.state, padding: 'x'.repeat(MAX_SAVE_CHARACTERS) };
  assert.throws(() => saveGame(f.storage, oversized, loaded.revision), /存档过大/);
  assert.deepEqual([...f.data], before);
  assert.deepEqual(f.writes, []);
});

test('failed backup or primary writes preserve old proof and allow a safe retry', () => {
  for (const failureKey of [BACKUP_KEY, SAVE_KEY]) {
    const f = fixture(),
      loaded = loadGame(f.storage, 1001),
      original = f.storage.setItem,
      oldBytes = f.data.get(SAVE_KEY),
      next = { ...loaded.state, coins: 90 };
    f.storage.setItem = (key, value) => {
      if (key === failureKey) throw Error('quota');
      original(key, value);
    };
    assert.throws(() => saveGame(f.storage, next, loaded.revision), /quota/);
    assert.equal(f.data.get(SAVE_KEY), oldBytes);
    f.storage.setItem = original;
    saveGame(f.storage, next, loaded.revision);
    assert.equal(f.data.get(BACKUP_KEY), oldBytes);
    assert.equal(game.importSave(f.data.get(SAVE_KEY), 1001).coins, 90);
  }
});
