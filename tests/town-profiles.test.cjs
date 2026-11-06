const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  townSession,
  activeProfile,
  DEMO_REVISION,
  DEMO_REVISION_KEY,
} = require('../.domain-build/application/TownProfiles.js');
const {
  SAVE_KEY,
  BACKUP_KEY,
  GAME_SAVE_KEYS,
  loadGame,
} = require('../.domain-build/domain/storage.js');
const { createGame, exportSave } = require('../.domain-build/domain/game.js');
function memory() {
  const data = new Map();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}
test('opening an unsupported old save preserves every game key and unrelated preference', () => {
  const store = memory();
  for (const key of GAME_SAVE_KEYS) store.setItem(key, JSON.stringify({ schemaVersion: 7 }));
  store.setItem('other-app.notes', 'keep');
  store.setItem('town-evolution.unrelated-preference', 'keep');
  const result = loadGame(store, 60000);
  assert.equal(result.status, 'corrupt');
  assert.match(result.warning, /不兼容/);
  for (const key of GAME_SAVE_KEYS)
    assert.equal(store.getItem(key), JSON.stringify({ schemaVersion: 7 }));
  assert.equal(store.getItem('other-app.notes'), 'keep');
  assert.equal(store.getItem('town-evolution.unrelated-preference'), 'keep');
  store.setItem(SAVE_KEY, exportSave(createGame(60000)));
  assert.equal(loadGame(store, 60001).status, 'loaded');
});
test('future save and old backup remain untouched on load', () => {
  const store = memory(),
    raw = JSON.stringify({ schemaVersion: 999 });
  store.setItem(SAVE_KEY, raw);
  store.setItem(BACKUP_KEY, JSON.stringify({ schemaVersion: 7 }));
  assert.equal(loadGame(store, 60000).status, 'corrupt');
  assert.equal(store.getItem(SAVE_KEY), raw);
});
test('demo and normal towns persist and reset independently', () => {
  const store = memory();
  assert.equal(activeProfile(store), 'demo');
  const normal = townSession(store, 'normal', () => 60000);
  normal.state.coins = 77;
  assert.ok(normal.save());
  const demo = townSession(store, 'demo', () => 60000);
  demo.state.coins = 33;
  assert.ok(demo.save());
  assert.equal(townSession(store, 'normal', () => 60000).state.coins, 77);
  assert.equal(townSession(store, 'demo', () => 60000).state.coins, 33);
  assert.ok(demo.reset());
  assert.notEqual(demo.state.coins, 33);
  assert.equal(townSession(store, 'normal', () => 60000).state.coins, 77);
});
test('new demo template does not overwrite customized demonstration until explicit reset', () => {
  const store = memory(),
    demo = townSession(store, 'demo', () => 60000);
  demo.state.coins = 44;
  demo.save();
  store.setItem(DEMO_REVISION_KEY, 'earlier-template');
  const restored = townSession(store, 'demo', () => 60000);
  assert.equal(restored.state.coins, 44);
  assert.match(restored.message, /模板已更新/);
  assert.equal(store.getItem(DEMO_REVISION_KEY), 'earlier-template');
  assert.ok(restored.reset());
  assert.equal(store.getItem(DEMO_REVISION_KEY), DEMO_REVISION);
  assert.notEqual(townSession(store, 'demo', () => 60000).state.coins, 44);
});
test('profile storage preparation failure is explicit, not silently treated as healthy new play', () => {
  const store = memory();
  store.setItem = () => {
    throw Error('quota');
  };
  const demo = townSession(store, 'demo', () => 60000);
  assert.equal(demo.mode, 'corrupt');
  assert.match(demo.message, /无法初始化/);
});

test('unsupported primary and future backup are both preserved', () => {
  const store = memory();
  store.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: 7 }));
  store.setItem(BACKUP_KEY, JSON.stringify({ schemaVersion: 999 }));
  const before = [...store.data.entries()];
  assert.equal(loadGame(store, 60000).status, 'corrupt');
  assert.deepEqual([...store.data.entries()], before);
});

test('unsupported primary does not silently switch to a current-version backup', () => {
  const store = memory(),
    current = createGame(60000);
  current.coins = 77;
  const backup = exportSave(current);
  store.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: 7 }));
  store.setItem(BACKUP_KEY, backup);
  const result = loadGame(store, 60000);
  assert.equal(result.status, 'corrupt');
  assert.equal(result.state, null);
  assert.equal(store.getItem(SAVE_KEY), JSON.stringify({ schemaVersion: 7 }));
  assert.equal(store.getItem(BACKUP_KEY), backup);
});

test('opening the separate demo never clears unsupported normal-town saves', () => {
  const store = memory();
  for (const key of GAME_SAVE_KEYS)
    store.setItem(key, JSON.stringify({ schemaVersion: 7, marker: key }));
  const before = new Map(store.data);
  const demo = townSession(store, 'demo', () => 60000);
  assert.equal(demo.mode, 'normal');
  for (const [key, value] of before) assert.equal(store.getItem(key), value);
  const normal = townSession(store, 'normal', () => 60000);
  assert.equal(normal.mode, 'corrupt');
  for (const [key, value] of before) assert.equal(store.getItem(key), value);
});
