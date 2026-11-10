/** Cross-profile evidence captured before terrain6 existed in production. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const g = require('../.domain-build/domain/game');
const { townSession, profileStorage } = require('../.domain-build/application/TownProfiles');
const {
  SAVE_KEY,
  BACKUP_KEY,
  GAME_SAVE_KEYS,
  loadGame,
} = require('../.domain-build/domain/storage');
const manifest = require('./fixtures/terrain6-legacy-oracle.json');
const packed = fs.readFileSync(path.join(__dirname, 'fixtures/terrain6-legacy-oracle.json.gz'));
assert.equal(crypto.createHash('sha256').update(packed).digest('hex'), manifest.fixtureSha256);
const oracle = JSON.parse(zlib.gunzipSync(packed));
function memory() {
  const data = new Map();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

for (const record of oracle.profiles)
  test(`terrain6 leaves old ${record.profile} state, revision and storage namespace unchanged`, () => {
    const store = memory();
    // The demo template now adds confirmed props. Load the frozen historical saved demo
    // instead of incorrectly requiring a brand-new demo to reproduce that old template.
    if (record.profile === 'demo')
      for (const [key, value] of record.keys) store.data.set(key, value);
    const session = townSession(store, record.profile, () => oracle.now);
    assert.equal(session.mode, 'normal');
    assert.equal(g.exportSave(session.state), record.save);
    assert.equal(session.save(), true);
    assert.deepEqual([...store.data], record.keys);
    assert.equal(
      g.exportSave(townSession(store, record.profile, () => oracle.now).state),
      record.save,
    );
  });

test('terrain6 does not change schema10 wooden bridge demonstration or its real merge', () => {
  const state = g.createBridgeDemo(oracle.now);
  assert.equal(g.exportSave(state), oracle.bridge.initial);
  const result = g.dispatch(state, oracle.bridge.command, oracle.now);
  assert.equal(result.ok, true, result.error);
  assert.equal(g.exportSave(result.state), oracle.bridge.merged);
  assert.equal(g.exportSave(g.importSave(oracle.bridge.merged, oracle.now)), oracle.bridge.merged);
});

for (const profile of ['normal', 'demo', 'v5-preview', 'v5-bridge-demo'])
  test(`terrain6 keeps corrupt ${profile} primary and recovery bytes untouched`, () => {
    const store = memory();
    const scoped = profileStorage(store, profile);
    const samples = [
      ' { malformed save: \u0000 中文 }\n',
      JSON.stringify({
        ...JSON.parse(oracle.profiles.find((r) => r.profile === profile).save),
        schemaVersion: 999,
      }),
    ];
    if (profile.startsWith('v5'))
      for (const terrainRevision of [
        undefined,
        'v5-mouth-resource-coast-fade-starter-1',
        'future-v5',
      ])
        samples.push(
          JSON.stringify({
            ...JSON.parse(oracle.profiles.find((r) => r.profile === profile).save),
            terrainRevision,
          }),
        );
    for (const bytes of samples) {
      for (const key of GAME_SAVE_KEYS) scoped.setItem(key, `untouched ${key}`);
      scoped.setItem(SAVE_KEY, bytes);
      scoped.setItem(BACKUP_KEY, 'not a valid backup either');
      const before = [...store.data];
      assert.equal(loadGame(scoped, oracle.now).status, 'corrupt');
      const session = townSession(store, profile, () => oracle.now);
      assert.equal(session.mode, 'corrupt');
      assert.equal(session.save(), false);
      assert.deepEqual(
        [...store.data],
        before,
        'No reset, migration, recovery or repair was authorized',
      );
    }
  });
