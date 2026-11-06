// To be copied into the final lifecycle tests only after phase1 ends.
const test = require('node:test'),
  assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { V5_GENERATOR_REVISION } = require('../.domain-build/domain/v5-world');
const { SAVE_KEY, loadGame } = require('../.domain-build/domain/storage');
const { townSession, profileStorage } = require('../.domain-build/application/TownProfiles');
function memory() {
  const data = new Map();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
}
test('v5 never silently reinterprets an older or missing generator revision', () => {
  const state = g.createGame(0, 42173, 5);
  assert.equal(state.terrainRevision, V5_GENERATOR_REVISION);
  for (const revision of [undefined, 'v5-mouth-resource-coast-fade-starter-1', 'future-v5']) {
    const old = { ...state, terrainRevision: revision },
      raw = JSON.stringify(old),
      store = memory();
    store.setItem(SAVE_KEY, raw);
    assert.throws(() => g.importSave(raw, 0), /v5.*版本不兼容/);
    assert.equal(loadGame(store, 0).status, 'corrupt');
    assert.equal(store.getItem(SAVE_KEY), raw);
  }
  for (const version of [1, 2, 3, 4])
    assert.equal(Object.hasOwn(g.createGame(0, 42173, version), 'terrainRevision'), false);
});
test('v5 preview revision namespace leaves every earlier internal preview byte untouched', () => {
  const store = memory(),
    oldKey = `town-evolution.v5-preview.${SAVE_KEY}`,
    oldRevisionKey = `town-evolution.v5-preview.v5-mouth-resource-coast-fade-starter-1.${SAVE_KEY}`;
  store.setItem(oldKey, 'earlier internal preview bytes');
  store.setItem(oldRevisionKey, 'earlier revision bytes');
  const before = new Map(store.data),
    session = townSession(store, 'v5-preview', () => 0);
  assert.equal(session.state.terrainRevision, V5_GENERATOR_REVISION);
  assert.ok(session.save());
  for (const [key, value] of before) assert.equal(store.getItem(key), value);
  assert.equal(profileStorage(store, 'v5-preview').getItem(SAVE_KEY), g.exportSave(session.state));
});
