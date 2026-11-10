const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GameStart } = require('../.domain-build/application/GameStart.js');
const { StartRecoveryActions } = require('../.domain-build/application/StartRecoveryActions.js');
const {
  profileStorage,
  DEMO_REVISION_KEY,
  DEMO_REVISION,
} = require('../.domain-build/application/TownProfiles.js');
const { createGame, exportSave } = require('../.domain-build/domain/game.js');
const { SAVE_KEY, BACKUP_KEY } = require('../.domain-build/domain/storage.js');
const now = () => 60000;
const valid = exportSave({ ...createGame(now()), coins: 73 });
function fixture(profile) {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  const flow = new GameStart(storage, now);
  assert.equal(flow.start(profile), true);
  const scoped = profileStorage(storage, profile);
  scoped.setItem(SAVE_KEY, valid);
  assert.equal(flow.session.save(), false);
  assert.equal(flow.session.hasSaveConflict, true);
  flow.saves();
  return { flow, storage, scoped, data };
}
function rejectWithoutLoss(f) {
  const session = f.flow.session;
  const state = exportSave(session.state);
  const flags = [session.hasSaveConflict, session.hasUnsavedChanges];
  const bytes = [...f.data];
  f.flow.reloadLatest();
  assert.equal(f.flow.page, 'confirm');
  assert.doesNotThrow(() => f.flow.confirm());
  assert.equal(f.flow.session === session, true, 'must retain the live session');
  assert.equal(exportSave(session.state), state);
  assert.deepEqual([session.hasSaveConflict, session.hasUnsavedChanges], flags);
  assert.deepEqual([...f.data], bytes);
  assert.match(f.flow.message, /保留/);
}
for (const profile of ['normal', 'demo']) {
  for (const scenario of ['empty', 'backup-only', 'corrupt', 'unsupported', 'throw']) {
    test(`${profile}: reload rejects ${scenario} without discarding live progress`, () => {
      const f = fixture(profile);
      if (scenario === 'empty' || scenario === 'backup-only') {
        f.scoped.removeItem(SAVE_KEY);
        f.scoped.removeItem(BACKUP_KEY);
        if (scenario === 'backup-only') f.scoped.setItem(BACKUP_KEY, valid);
      } else if (scenario === 'corrupt') f.scoped.setItem(SAVE_KEY, 'broken');
      else if (scenario === 'unsupported') f.scoped.setItem(SAVE_KEY, '{"schemaVersion":999}');
      else
        f.storage.getItem = () => {
          throw Error('denied');
        };
      rejectWithoutLoss(f);
    });
  }
  test(`${profile}: reload accepts an existing validated latest primary`, () => {
    const f = fixture(profile);
    const session = f.flow.session;
    const bytes = [...f.data];
    f.flow.reloadLatest();
    f.flow.confirm();
    assert.notEqual(f.flow.session, session);
    assert.equal(f.flow.session.state.coins, 73);
    assert.equal(f.flow.session.hasSaveConflict, false);
    assert.equal(f.flow.page, 'game');
    assert.deepEqual([...f.data], bytes);
  });
  for (const readNumber of [2, 3]) {
    test(`${profile}: primary disappearing/changing on read ${readNumber} does not activate a replacement`, () => {
      const f = fixture(profile);
      // Alternate snapshots simulate concurrent storage changes, without changing the fixture map.
      const read = f.storage.getItem;
      let reads = 0;
      f.storage.getItem = (key) => {
        if (key.endsWith(SAVE_KEY) && ++reads >= readNumber)
          return readNumber === 2 ? null : exportSave({ ...createGame(now()), coins: 44 });
        return read(key);
      };
      rejectWithoutLoss(f);
    });
  }
}
for (const scenario of ['missing', 'throw']) {
  test(`V6: ${scenario} primary is rejected inside the prepared reload callback`, () => {
    const session = { hasSaveConflict: true };
    const host = { profile: 'v6-preview', session, message: '' };
    let confirm;
    let prepared = false;
    const storage = {
      getItem: () => {
        if (scenario === 'throw') throw Error('denied');
        return null;
      },
      setItem: () => assert.fail('must not write'),
      removeItem: () => assert.fail('must not remove'),
    };
    new StartRecoveryActions(
      host,
      storage,
      now,
      (_text, run) => {
        confirm = run;
      },
      () => assert.fail('must not activate'),
      (run, options) => {
        prepared = true;
        assert.equal(options.source, 'primary');
        run();
      },
    ).reload();
    assert.doesNotThrow(() => confirm());
    assert.equal(prepared, true);
    assert.equal(host.session, session);
    assert.match(host.message, /保留/);
  });
}

test('demo: missing metadata and disappearing primary cannot write during rejected reload', () => {
  const f = fixture('demo');
  f.storage.removeItem(DEMO_REVISION_KEY);
  const read = f.storage.getItem;
  let reads = 0;
  f.storage.getItem = (key) => (key.endsWith(SAVE_KEY) && ++reads >= 2 ? null : read(key));
  rejectWithoutLoss(f);
  assert.equal(f.data.has(DEMO_REVISION_KEY), false);
});

test('demo: reload without metadata retains later saving and explicit reset metadata updates', () => {
  const f = fixture('demo');
  f.storage.removeItem(DEMO_REVISION_KEY);
  f.flow.reloadLatest();
  f.flow.confirm();
  assert.equal(f.flow.page, 'game');
  assert.equal(f.data.has(DEMO_REVISION_KEY), false);
  f.flow.session.state.coins = 68;
  assert.equal(f.flow.session.save(), true);
  assert.equal(JSON.parse(f.scoped.getItem(SAVE_KEY)).coins, 68);
  assert.equal(f.flow.session.reset(), true);
  assert.equal(f.data.get(DEMO_REVISION_KEY), DEMO_REVISION);
});
