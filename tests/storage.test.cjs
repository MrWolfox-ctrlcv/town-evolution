const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('../.domain-build/domain/game.js');
const {
  loadGame,
  saveGame,
  acceptRecovery,
  resetSave,
  SAVE_KEY,
  BACKUP_KEY,
} = require('../.domain-build/domain/storage.js');
function memory() {
  const data = new Map();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
}
test('save and load stores a previous valid backup', () => {
  const m = memory(),
    s = createGame(0);
  assert.equal(loadGame(m, 0).status, 'empty');
  saveGame(m, s);
  saveGame(m, { ...s, coins: 99 });
  assert.equal(loadGame(m, 0).state.coins, 99);
  assert.equal(JSON.parse(m.getItem(BACKUP_KEY)).coins, 120);
});
test('corruption recovers backup without deleting raw primary', () => {
  const m = memory(),
    s = createGame(0);
  saveGame(m, s);
  saveGame(m, s);
  m.setItem(SAVE_KEY, 'broken');
  const r = loadGame(m, 0);
  assert.equal(r.status, 'recovered');
  assert.equal(m.getItem(SAVE_KEY), 'broken');
  assert.throws(() => saveGame(m, r.state));
  acceptRecovery(m, r.state);
  assert.equal(m.getItem(SAVE_KEY + '.unreadable'), 'broken');
  assert.equal(loadGame(m, 0).status, 'loaded');
});
test('both invalid saves are not overwritten', () => {
  const m = memory();
  m.setItem(SAVE_KEY, 'broken');
  m.setItem(BACKUP_KEY, 'broken backup');
  assert.equal(loadGame(m, 0).status, 'corrupt');
  assert.throws(() => saveGame(m, createGame(0)));
  assert.equal(m.getItem(SAVE_KEY), 'broken');
});
test('storage failure is explicit and does not masquerade as new game', () => {
  const m = {
    getItem() {
      throw Error('denied');
    },
    setItem() {
      throw Error('quota');
    },
    removeItem() {},
  };
  assert.equal(loadGame(m, 0).status, 'corrupt');
  assert.throws(() => saveGame(m, createGame(0)));
});
test('reset preserves pre-reset data', () => {
  const m = memory();
  m.setItem(SAVE_KEY, 'old raw');
  resetSave(m, createGame(0));
  assert.equal(m.getItem(SAVE_KEY + '.before-reset'), 'old raw');
  assert.equal(loadGame(m, 0).status, 'loaded');
});
test('healthy primary does not depend on backup readability', () => {
  const s = createGame(0),
    m = memory();
  saveGame(m, s);
  const original = m.getItem;
  m.getItem = (k) => {
    if (k === BACKUP_KEY) throw Error('backup read blocked');
    return original(k);
  };
  assert.equal(loadGame(m, 0).status, 'loaded');
});
test('backup write failure does not overwrite primary', () => {
  const m = memory(),
    s = createGame(0);
  saveGame(m, s);
  const before = m.getItem(SAVE_KEY),
    original = m.setItem;
  m.setItem = (k, v) => {
    if (k === BACKUP_KEY) throw Error('quota');
    original(k, v);
  };
  assert.throws(() => saveGame(m, { ...s, coins: 99 }));
  assert.equal(m.getItem(SAVE_KEY), before);
});
test('primary write failure leaves old primary and backup usable', () => {
  const m = memory(),
    s = createGame(0);
  saveGame(m, s);
  const before = m.getItem(SAVE_KEY),
    original = m.setItem;
  m.setItem = (k, v) => {
    if (k === SAVE_KEY) throw Error('quota');
    original(k, v);
  };
  assert.throws(() => saveGame(m, { ...s, coins: 99 }));
  assert.equal(m.getItem(SAVE_KEY), before);
  assert.equal(m.getItem(BACKUP_KEY), before);
});
test('future-version primary never silently falls back to stale backup', () => {
  const m = memory(),
    s = createGame(0);
  saveGame(m, s);
  saveGame(m, s);
  m.setItem(SAVE_KEY, JSON.stringify({ ...s, schemaVersion: 999 }));
  assert.equal(loadGame(m, 0).status, 'corrupt');
  assert.equal(JSON.parse(m.getItem(SAVE_KEY)).schemaVersion, 999);
});
