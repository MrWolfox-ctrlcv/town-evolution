const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { GameStart } = require('../.domain-build/application/GameStart');
const { startMenu } = require('../.domain-build/application/StartMenu');
const { profileStorage } = require('../.domain-build/application/TownProfiles');
const { V6WorldPreparation } = require('../.domain-build/domain/v6-preparation');
const { SAVE_KEY, BACKUP_KEY } = require('../.domain-build/domain/storage');
const { createGame, exportSave } = require('../.domain-build/domain/game');
let saved;
before(() => {
  const job = new V6WorldPreparation(42173);
  while (job.progress.status === 'building') job.step(16384);
  job.takeResult();
  saved = exportSave(createGame(60000, 42173, 6));
});
function fixture() {
  const bytes = new Map(),
    writes = [];
  const storage = {
    getItem: (key) => bytes.get(key) ?? null,
    setItem: (key, value) => {
      bytes.set(key, value);
      writes.push(key);
    },
    removeItem: (key) => {
      bytes.delete(key);
      writes.push(key);
    },
  };
  const flow = new GameStart(storage, () => 60000);
  const action = (id) => {
    const item = startMenu(flow, () => {}).actions.find((entry) => entry.id === id);
    assert.ok(item, `${flow.page}: missing menu action ${id}`);
    assert.notEqual(item.enabled, false);
    item.run();
  };
  const finish = () => {
    for (let i = 0; i < 12 && flow.page === 'preparing'; i++) flow.tickPreparation();
    assert.notEqual(flow.page, 'preparing');
  };
  const enter = () => {
    action('v6-preview');
    finish();
    assert.equal(flow.page, 'game');
  };
  const scoped = profileStorage(storage, 'v6-preview');
  return { flow, bytes, writes, storage, scoped, action, finish, enter };
}
function unchanged(f, before, session = f.flow.session) {
  assert.deepEqual([...f.bytes], before);
  assert.equal(f.writes.length, 0);
  assert.equal(f.flow.session, session);
  assert.equal(f.flow.preparation.active, false);
  for (let i = 0; i < 5; i++) assert.equal(f.flow.tickPreparation(), false);
  assert.deepEqual([...f.bytes], before);
}
// A changed seed is only an unvalidated preparation hint. These bytes are never loaded.
const hint = (seed) => JSON.stringify({ ...JSON.parse(saved), mapSeed: seed });
test('title cancellation returns to title without creating a session or save', () => {
  const f = fixture(),
    before = [...f.bytes];
  f.action('v6-preview');
  f.flow.tickPreparation();
  f.action('cancel');
  assert.equal(f.flow.page, 'title');
  unchanged(f, before, null);
});
test('cancelling a reset preparation returns to settings and preserves the live town', () => {
  const f = fixture();
  f.enter();
  f.flow.settings();
  const session = f.flow.session,
    state = session.state,
    before = [...f.bytes];
  f.writes.length = 0;
  f.action('new-game');
  f.flow.tickPreparation();
  f.action('cancel');
  assert.equal(f.flow.page, 'settings');
  assert.equal(f.flow.session.state, state);
  assert.equal(f.flow.pending, null);
  unchanged(f, before, session);
});
test('cancelling pending manual validation stays in saves and retains the settings return route', () => {
  const f = fixture();
  f.enter();
  f.flow.settings();
  f.action('saves');
  const raw = JSON.stringify({ format: 1, savedAt: 60000, save: hint(74129) });
  f.scoped.setItem(`${SAVE_KEY}.manual.2`, raw);
  const before = [...f.bytes],
    session = f.flow.session;
  f.writes.length = 0;
  f.action('slot-2');
  assert.equal(f.flow.page, 'preparing');
  f.action('cancel');
  assert.equal(f.flow.page, 'saves');
  assert.equal(f.flow.slot, 2);
  assert.equal(f.flow.returnsToSettings, true);
  unchanged(f, before, session);
  f.action('back');
  assert.equal(f.flow.page, 'settings');
});
test('cancelling preparation from title save management stays in saves', () => {
  const f = fixture();
  f.action('v6-preview');
  f.action('cancel');
  f.action('saves');
  const before = [...f.bytes];
  f.writes.length = 0;
  f.action('new-game');
  f.action('cancel');
  assert.equal(f.flow.page, 'saves');
  unchanged(f, before, null);
  f.action('back');
  assert.equal(f.flow.page, 'title');
});
test('switching towns never restores game or settings after the old session was released', () => {
  for (const source of ['game', 'settings', 'saves']) {
    const f = fixture();
    f.action('start');
    if (source !== 'game') f.flow.settings();
    if (source === 'saves') f.action('saves');
    f.flow.switchTown('v6-preview');
    assert.equal(f.flow.session, null);
    const before = [...f.bytes];
    f.writes.length = 0;
    f.action('cancel');
    assert.equal(f.flow.page, source === 'saves' ? 'saves' : 'title');
    unchanged(f, before, null);
  }
});
test('successful preparation restores confirmation and later cancellations use their own origin', () => {
  const f = fixture();
  f.enter();
  f.flow.settings();
  const before = [...f.bytes],
    session = f.flow.session;
  f.writes.length = 0;
  f.action('new-game');
  f.finish();
  assert.equal(f.flow.page, 'confirm');
  f.action('cancel');
  assert.equal(f.flow.page, 'settings');
  f.action('saves');
  f.action('new-game');
  f.action('cancel');
  assert.equal(f.flow.page, 'saves');
  unchanged(f, before, session);
});
test('a nested recovery preparation retains its origin after the first completion callback', () => {
  const f = fixture();
  f.action('v6-preview');
  f.action('cancel');
  f.action('saves');
  f.scoped.setItem(SAVE_KEY, hint(71));
  f.scoped.setItem(BACKUP_KEY, hint(72));
  const before = [...f.bytes];
  f.writes.length = 0;
  // Control only preparation completion; recovery and menu navigation remain real.
  // These changed-seed hints are deliberately not claimed to be valid full saves.
  const calls = [];
  f.flow.preparation.start = (_storage, done, _fail, options) => calls.push({ done, options });
  f.action('recover');
  f.action('confirm');
  assert.equal(calls[0].options.source, 'primary');
  calls[0].done();
  assert.equal(calls[1].options.source, 'backup');
  assert.equal(f.flow.page, 'preparing');
  f.action('cancel');
  assert.equal(f.flow.page, 'saves');
  assert.equal(f.flow.pending, null);
  unchanged(f, before, null);
});
