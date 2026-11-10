const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { V7WorldPreparation } = require('../.domain-build/domain/v7-preparation');
const { createGame } = require('../.domain-build/domain/game');
const { exportSave, importSave, SaveVersionError } = require('../.domain-build/domain/save');
const { profileStorage, townSession } = require('../.domain-build/application/TownProfiles');
const { GameStart } = require('../.domain-build/application/GameStart');
const { startMenu } = require('../.domain-build/application/StartMenu');
const {
  writeSlot,
  inspectSlot,
  manualSlotKey,
} = require('../.domain-build/application/ManualSaves');
const { SAVE_KEY, BACKUP_KEY, resetSave } = require('../.domain-build/domain/storage');
let state, saved;
before(() => {
  const p = new V7WorldPreparation(42173);
  while (p.progress.status === 'building') p.step(65536);
  p.takeResult();
  state = createGame(60000, 42173, 7);
  saved = exportSave(state);
});
function mem() {
  const bytes = new Map(),
    writes = [];
  return {
    bytes,
    writes,
    getItem: (k) => bytes.get(k) ?? null,
    setItem: (k, v) => {
      writes.push(k);
      bytes.set(k, v);
    },
    removeItem: (k) => {
      writes.push(k);
      bytes.delete(k);
    },
  };
}
function finish(f) {
  for (let i = 0; i < 30 && f.page === 'preparing'; i++) f.tickPreparation();
  assert.notEqual(f.page, 'preparing');
}
test('wire12 is exact terrain7, internal10 export does not loosen reader', () => {
  assert.equal(JSON.parse(saved).schemaVersion, 12);
  assert.equal(importSave(saved, 60000).terrainVersion, 7);
  for (const v of [8, 9, 10, 11, 13])
    assert.throws(
      () => importSave(JSON.stringify({ ...JSON.parse(saved), schemaVersion: v }), 60000),
      SaveVersionError,
    );
  for (const t of [1, 4, 5, 6])
    assert.throws(
      () => importSave(JSON.stringify({ ...JSON.parse(saved), terrainVersion: t }), 60000),
      SaveVersionError,
    );
  assert.throws(
    () => importSave(JSON.stringify({ ...JSON.parse(saved), terrainRevision: 'future' }), 60000),
    SaveVersionError,
  );
  assert.throws(() =>
    importSave(JSON.stringify({ ...JSON.parse(saved), terrain6: undefined }), 60000),
  );
});
test('isolated namespace and backup-only/validprimary future backup stop every write', () => {
  for (const primary of [null, saved]) {
    const m = mem(),
      s = profileStorage(m, 'v7-preview');
    if (primary) s.setItem(SAVE_KEY, primary);
    s.setItem(BACKUP_KEY, JSON.stringify({ ...JSON.parse(saved), schemaVersion: 13 }));
    const before = [...m.bytes];
    m.writes.length = 0;
    const f = new GameStart(m, () => 60000);
    f.start('v7-preview');
    finish(f);
    assert.equal(f.session, null);
    assert.deepEqual([...m.bytes], before);
    assert.deepEqual(m.writes, []);
    assert.throws(() => resetSave(s, state));
    assert.deepEqual([...m.bytes], before);
  }
  const m = mem();
  profileStorage(m, 'v7-preview').setItem(SAVE_KEY, saved);
  assert.ok([...m.bytes.keys()][0].startsWith('town-evolution.v7-preview.v7-seeded-coast-1.'));
  assert.equal(profileStorage(m, 'normal').getItem(SAVE_KEY), null);
});
test('cancel/repeat/navigation and cross-tab exact-byte change never adopt or write', () => {
  const m = mem(),
    f = new GameStart(m, () => 60000);
  f.start('v7-preview');
  f.back();
  assert.equal(f.page, 'title');
  assert.equal(f.session, null);
  assert.deepEqual(m.writes, []);
  f.start('v7-preview');
  f.tickPreparation();
  f.tickPreparation();
  f.preparation.tick(() => 0); // cached candidate completes in one bounded turn
  assert.equal(f.session !== null, true);
  const prior = f.session;
  f.settings();
  f.newGame();
  f.back();
  assert.equal(f.page, 'settings');
  assert.equal(f.session, prior);
  const s = profileStorage(m, 'v7-preview');
  f.newGame();
  finish(f);
  assert.equal(f.page, 'confirm');
  s.setItem(BACKUP_KEY, saved + ' ');
  const before = [...m.bytes];
  f.confirm();
  assert.equal(f.session, prior);
  assert.deepEqual([...m.bytes], before);
});
test('manual envelope checks outer identity and preserves slot conflict bytes', () => {
  const m = mem(),
    s = profileStorage(m, 'v7-preview');
  writeSlot(s, 1, state, 60000, null);
  assert.equal(inspectSlot(s, 1, 60000).status, 'ready');
  const raw = s.getItem(manualSlotKey(1));
  s.setItem(manualSlotKey(1), JSON.stringify({ ...JSON.parse(raw), terrainRevision: 'future' }));
  assert.equal(inspectSlot(s, 1, 60000).status, 'corrupt');
  assert.throws(() => writeSlot(s, 1, state, 60000, raw));
});
test('old live town switch cancellation/failure preserves session/profile/old bytes', () => {
  const m = mem(),
    f = new GameStart(m, () => 60000);
  assert.equal(f.start('normal'), true);
  const old = f.session,
    profile = f.profile,
    before = [...m.bytes];
  m.writes.length = 0;
  f.switchTown('v7-preview');
  assert.equal(f.session, old);
  assert.equal(f.profile, profile);
  f.back();
  assert.equal(f.session, old);
  assert.deepEqual([...m.bytes], before);
  assert.deepEqual(m.writes, []);
  const s = profileStorage(m, 'v7-preview');
  s.setItem(BACKUP_KEY, JSON.stringify({ ...JSON.parse(saved), schemaVersion: 13 }));
  const beforeFailure = [...m.bytes];
  m.writes.length = 0;
  f.switchTown('v7-preview');
  finish(f);
  assert.equal(f.session, old);
  assert.equal(f.profile, profile);
  assert.deepEqual([...m.bytes], beforeFailure);
  assert.deepEqual(m.writes, []);
});
test('title keeps old content and exposes independent seeded coast action', () => {
  const m = mem(),
    f = new GameStart(m, () => 60000),
    menu = startMenu(f, () => {});
  assert.equal(menu.title, '小镇进化');
  assert.equal(menu.actions.find((a) => a.id === 'v6-preview').text, '自然挖填实验');
  assert.equal(menu.actions.find((a) => a.id === 'v7-preview').text, '随机海岸实验');
});
test('preparation rechecks primary backup and manual exact bytes after bounded work', () => {
  const { V7PreparationFlow } = require('../.domain-build/application/V7PreparationFlow');
  for (const source of ['primary', 'backup', 'slot']) {
    const m = mem(),
      s = profileStorage(m, 'v7-preview');
    s.setItem(SAVE_KEY, saved);
    s.setItem(BACKUP_KEY, saved);
    writeSlot(s, 1, state, 60000, null);
    let done = 0,
      failed = 0,
      clock = 0;
    const p = new V7PreparationFlow();
    p.start(
      s,
      () => done++,
      () => failed++,
      source === 'slot' ? { slot: 1 } : {},
    );
    p.tick();
    p.tick();
    p.tick(() => (clock += 10));
    assert.equal(p.active, true);
    assert.equal(p.identity.terrainVersion, 7);
    assert.equal(p.identity.revision, 'v7-seeded-coast-1');
    assert.equal(p.identity.seed, 42173);
    const key =
      source === 'primary' ? SAVE_KEY : source === 'backup' ? BACKUP_KEY : manualSlotKey(1);
    s.setItem(key, s.getItem(key) + ' ');
    const snapshot = [...m.bytes];
    m.writes.length = 0;
    p.tick(() => (clock += 10));
    assert.equal(done, 0);
    assert.equal(failed, 1);
    assert.deepEqual(m.writes, []);
    assert.deepEqual([...m.bytes], snapshot);
  }
});
test('future outer manual format and revision cannot be overwritten even with confirmation', () => {
  for (const patch of [{ format: 2 }, { terrainVersion: 8 }, { terrainRevision: 'future' }]) {
    const m = mem(),
      s = profileStorage(m, 'v7-preview');
    writeSlot(s, 1, state, 60000, null);
    const raw = JSON.stringify({ ...JSON.parse(s.getItem(manualSlotKey(1))), ...patch });
    s.setItem(manualSlotKey(1), raw);
    const snapshot = [...m.bytes];
    m.writes.length = 0;
    assert.throws(() => writeSlot(s, 1, state, 60000, raw), SaveVersionError);
    assert.deepEqual([...m.bytes], snapshot);
    assert.deepEqual(m.writes, []);
  }
});
test('completed candidate cannot replace a live town whose final save fails or conflicts', () => {
  for (const reason of ['write-failure', 'conflict']) {
    const m = mem(),
      f = new GameStart(m, () => 60000);
    assert.equal(f.start('normal'), true);
    const old = f.session;
    old.state.coins += 1;
    if (reason === 'conflict') m.setItem(SAVE_KEY, m.getItem(SAVE_KEY) + ' ');
    else {
      const set = m.setItem;
      m.setItem = (key, value) => {
        if (key === SAVE_KEY || key === BACKUP_KEY) throw Error('test storage unavailable');
        set(key, value);
      };
    }
    const before = [...m.bytes];
    m.writes.length = 0;
    f.switchTown('v7-preview');
    finish(f);
    assert.equal(f.session, old);
    assert.equal(f.profile, 'normal');
    assert.deepEqual([...m.bytes], before);
    assert.deepEqual(m.writes, []);
    assert.equal(profileStorage(m, 'v7-preview').getItem(SAVE_KEY), null);
    assert.ok(f.message.length > 0);
  }
});
test('successful coast switch saves old unsaved progress before candidate and activation', () => {
  const m = mem(),
    f = new GameStart(m, () => 60000);
  assert.equal(f.start('normal'), true);
  const old = f.session;
  old.state.coins += 11;
  const expectedCoins = old.state.coins;
  m.writes.length = 0;
  f.switchTown('v7-preview');
  assert.deepEqual(m.writes, []);
  finish(f);
  assert.notEqual(f.session, old);
  assert.equal(f.profile, 'v7-preview');
  assert.equal(f.session.state.terrainVersion, 7);
  assert.equal(importSave(m.getItem(SAVE_KEY), 60000).coins, expectedCoins);
  const candidateKey = `town-evolution.v7-preview.v7-seeded-coast-1.${SAVE_KEY}`;
  assert.ok(m.writes.indexOf(SAVE_KEY) >= 0);
  assert.ok(m.writes.indexOf(SAVE_KEY) < m.writes.indexOf(candidateKey));
});
test('candidate write failure keeps the already saved original town active', () => {
  const m = mem(),
    f = new GameStart(m, () => 60000);
  assert.equal(f.start('normal'), true);
  const old = f.session;
  old.state.coins += 13;
  const set = m.setItem;
  m.setItem = (key, value) => {
    if (key.startsWith('town-evolution.v7-preview.'))
      throw Error('test candidate write unavailable');
    set(key, value);
  };
  f.switchTown('v7-preview');
  finish(f);
  assert.equal(f.session, old);
  assert.equal(f.profile, 'normal');
  assert.equal(importSave(m.getItem(SAVE_KEY), 60000).coins, old.state.coins);
  assert.equal(profileStorage(m, 'v7-preview').getItem(SAVE_KEY), null);
});
test('future archive targets block reset recovery and manual overwrite with exact bytes intact', () => {
  const { acceptRecovery } = require('../.domain-build/domain/storage');
  for (const operation of ['reset', 'recover', 'manual']) {
    for (const future of ['wire', 'revision', 'outer']) {
      const m = mem(),
        s = profileStorage(m, 'v7-preview');
      s.setItem(SAVE_KEY, operation === 'recover' ? '{broken' : saved);
      s.setItem(BACKUP_KEY, saved);
      writeSlot(s, 1, state, 60000, null);
      const slot = s.getItem(manualSlotKey(1));
      const save = JSON.stringify({
        ...JSON.parse(saved),
        ...(future === 'wire' ? { schemaVersion: 13 } : { terrainRevision: 'future' }),
      });
      const target =
        operation === 'reset'
          ? `${SAVE_KEY}.before-reset`
          : operation === 'recover'
            ? `${SAVE_KEY}.unreadable`
            : `${manualSlotKey(1)}.before-overwrite`;
      const archive =
        operation === 'manual'
          ? JSON.stringify({
              ...JSON.parse(slot),
              ...(future === 'outer' ? { format: 2 } : { save }),
            })
          : save;
      s.setItem(target, archive);
      const before = [...m.bytes];
      m.writes.length = 0;
      assert.throws(
        () =>
          operation === 'reset'
            ? resetSave(s, state)
            : operation === 'recover'
              ? acceptRecovery(s, state)
              : writeSlot(s, 1, state, 60000, slot),
        SaveVersionError,
      );
      assert.deepEqual([...m.bytes], before);
      assert.deepEqual(m.writes, []);
    }
  }
});
test('archive replacement rechecks exact bytes before reset recovery and manual writes', () => {
  const { acceptRecovery, SaveConflictError } = require('../.domain-build/domain/storage');
  for (const operation of ['reset', 'recover', 'manual']) {
    const m = mem(),
      s = profileStorage(m, 'v7-preview');
    s.setItem(SAVE_KEY, operation === 'recover' ? '{broken' : saved);
    s.setItem(BACKUP_KEY, saved);
    writeSlot(s, 1, state, 60000, null);
    const slot = s.getItem(manualSlotKey(1));
    const target =
      operation === 'reset'
        ? `${SAVE_KEY}.before-reset`
        : operation === 'recover'
          ? `${SAVE_KEY}.unreadable`
          : `${manualSlotKey(1)}.before-overwrite`;
    const original = operation === 'manual' ? slot : saved;
    s.setItem(target, original);
    const full = `town-evolution.v7-preview.v7-seeded-coast-1.${target}`;
    const get = m.getItem;
    let reads = 0;
    m.getItem = (key) => {
      if (key === full && ++reads === 2) m.bytes.set(key, original + ' ');
      return get(key);
    };
    m.writes.length = 0;
    assert.throws(
      () =>
        operation === 'reset'
          ? resetSave(s, state)
          : operation === 'recover'
            ? acceptRecovery(s, state)
            : writeSlot(s, 1, state, 60000, slot),
      SaveConflictError,
    );
    assert.equal(s.getItem(target), original + ' ');
    assert.deepEqual(m.writes, []);
    assert.equal(s.getItem(SAVE_KEY), operation === 'recover' ? '{broken' : saved);
  }
});
