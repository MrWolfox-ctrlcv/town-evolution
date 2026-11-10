/** Real prepared v6 state, isolated storage, and one shared terrain preparation per process. */
const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { emptyStock } = require('../.domain-build/domain/commerce');
const { V6WorldPreparation } = require('../.domain-build/domain/v6-preparation');
const { GameSession } = require('../.domain-build/application/GameSession');
const { SAVE_KEY } = require('../.domain-build/domain/storage');
let initialV6;
function fixture(version, free) {
  if (version === 6 && !initialV6) {
    const preparation = new V6WorldPreparation(1937);
    while (preparation.step(50000).status !== 'ready') {}
    preparation.takeResult();
    initialV6 = g.createGame(123000, 1937, 6);
  }
  const state = version === 6 ? structuredClone(initialV6) : g.createGame(123000, 1, version);
  state.coins = 0;
  state.inventory = { ...emptyStock(), soil: g.getCapacity(state) - free };
  assert.equal(g.hasPlantingSource(state), false);
  assert.equal(state.cropRecoveryAvailable, true);
  const bytes = g.exportSave(state);
  assert.deepEqual(g.importSave(bytes, state.lastSeenAt), state);
  const values = new Map([[SAVE_KEY, bytes]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const session = new GameSession(storage, () => state.lastSeenAt);
  assert.equal(session.mode, 'normal');
  return { session, values, storage };
}
const command = { type: 'recoverCrop' };
function rejectRecovery(version, free) {
  const { session, values } = fixture(version, free);
  const before = session.state;
  const snapshot = structuredClone(before);
  const raw = [...values];
  const result = g.dispatch(before, command, before.lastSeenAt);
  assert.equal(result.ok, false, 'A whole seed needs at least one free storage unit');
  assert.equal(result.state, before);
  assert.match(result.error, /腾出1格仓库空间/);
  assert.match(session.reason(command), /腾出1格仓库空间/);
  assert.equal(session.run(command), false);
  assert.equal(session.state, before);
  assert.deepEqual(session.state, snapshot);
  assert.equal(session.state.cropRecoveryAvailable, true);
  assert.deepEqual([...values], raw, 'Rejected recovery must not change primary or backup bytes');
  assert.equal(session.hasUnsavedChanges, false);
  assert.deepEqual(g.importSave(g.exportSave(session.state), before.lastSeenAt), before);
}
for (const free of [0.5, 1 / 4096])
  test(`v6 recovery rejects only ${free} units free without spending its entitlement`, () => {
    rejectRecovery(6, free);
  });
for (const version of [1, 6]) {
  test(`v${version} full warehouse still rejects emergency recovery`, () => {
    rejectRecovery(version, 0);
  });
  for (const free of [1, 16])
    test(`v${version} recovery with ${free} free units persists and remains one-time`, () => {
      const { session, values, storage } = fixture(version, free);
      const before = session.state;
      const raw = values.get(SAVE_KEY);
      assert.equal(session.reason(command), null);
      assert.equal(session.run(command), true);
      assert.equal(session.state.inventory.vegetable, 1);
      assert.equal(session.state.cropRecoveryAvailable, false);
      assert.equal(g.getUsedStorage(session.state), g.getUsedStorage(before) + 1);
      assert.ok(g.getUsedStorage(session.state) <= g.getCapacity(session.state));
      assert.equal(session.hasUnsavedChanges, false);
      assert.notEqual(values.get(SAVE_KEY), raw);
      assert.deepEqual(g.importSave(g.exportSave(session.state), before.lastSeenAt), session.state);
      const restored = new GameSession(storage, () => before.lastSeenAt);
      assert.deepEqual(restored.state, session.state);
      const saved = [...values];
      assert.equal(restored.run(command), false);
      assert.deepEqual([...values], saved);
    });
}
