const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { V6WorldPreparation } = require('../.domain-build/domain/v6-preparation');
const { V6PreparationFlow } = require('../.domain-build/application/V6PreparationFlow');
const { GameStart } = require('../.domain-build/application/GameStart');
const { startMenu } = require('../.domain-build/application/StartMenu');
const { profileStorage, profileLabel } = require('../.domain-build/application/TownProfiles');
const { SAVE_KEY, BACKUP_KEY } = require('../.domain-build/domain/storage');
const { createGame, exportSave } = require('../.domain-build/domain/game');
const { materialQuantity } = require('../.domain-build/application/MaterialQuantity');
const { V6_GENERATOR_REVISION } = require('../.domain-build/domain/v6-world');
function fixture() {
  const bytes = new Map(),
    writes = [];
  const storage = {
    getItem: (k) => bytes.get(k) ?? null,
    setItem: (k, v) => {
      writes.push(k);
      bytes.set(k, v);
    },
    removeItem: (k) => bytes.delete(k),
  };
  return { bytes, writes, storage, flow: new GameStart(storage, () => 60000) };
}
function finish(flow) {
  for (let i = 0; i < 20000 && flow.page === 'preparing'; i++) flow.tickPreparation();
  assert.notEqual(flow.page, 'preparing');
}
before(() => {
  const job = new V6WorldPreparation(42173);
  while (job.progress.status === 'building') job.step(16384);
  job.takeResult();
});
test('v6 is a separate explicit profile and never changes old storage keys', () => {
  const { storage, flow, writes } = fixture();
  const actions = startMenu(flow, () => {}).actions;
  assert.equal(actions.filter((a) => a.id === 'v6-preview').length, 1);
  assert.equal(profileLabel('v6-preview'), '自然挖填实验');
  profileStorage(storage, 'v6-preview').setItem(SAVE_KEY, 'sentinel');
  assert.ok(writes[0].includes(`v6-preview.${V6_GENERATOR_REVISION}.`));
  for (const name of ['normal', 'demo', 'v5-preview', 'v5-bridge-demo'])
    assert.equal(profileStorage(storage, name).getItem(SAVE_KEY), null);
});
test('preparation gives two drawing opportunities and never saves a half session', () => {
  const { flow, writes } = fixture();
  assert.equal(flow.start('v6-preview'), false);
  assert.equal(flow.page, 'preparing');
  assert.equal(flow.session, null);
  assert.equal(writes.length, 0);
  for (let i = 0; i < 2; i++) {
    assert.equal(flow.tickPreparation(), false);
    assert.equal(flow.session, null);
    assert.equal(writes.length, 0);
  }
  finish(flow);
  assert.equal(flow.page, 'game');
  assert.equal(flow.session.state.terrainVersion, 6);
  assert.ok(writes.length > 0);
});
test('cancel and profile changes invalidate callbacks without touching raw bytes', () => {
  const { flow, writes } = fixture();
  flow.start('v6-preview');
  flow.tickPreparation();
  flow.back();
  for (let i = 0; i < 10; i++) flow.tickPreparation();
  assert.equal(flow.page, 'title');
  assert.equal(flow.session, null);
  assert.equal(writes.length, 0);
  flow.start('v6-preview');
  flow.chooseProfile('normal');
  for (let i = 0; i < 10; i++) flow.tickPreparation();
  assert.equal(flow.profile, 'normal');
  assert.equal(flow.session, null);
  assert.equal(writes.length, 0);
});
test('unknown primary revision never falls back and malformed full saves never write', () => {
  for (const change of [
    (s) => {
      s.terrainRevision = 'future';
    },
    (s) => {
      s.coins = -100;
    },
  ]) {
    const { flow, storage, writes } = fixture();
    const scoped = profileStorage(storage, 'v6-preview');
    const valid = exportSave(createGame(60000, 42173, 6));
    const bad = JSON.parse(valid);
    change(bad);
    const raw = JSON.stringify(bad);
    scoped.setItem(SAVE_KEY, raw);
    if (bad.terrainRevision === 'future') scoped.setItem(BACKUP_KEY, valid);
    writes.length = 0;
    flow.start('v6-preview');
    finish(flow);
    assert.equal(flow.session, null);
    assert.equal(flow.page, 'saves');
    assert.equal(scoped.getItem(SAVE_KEY), raw);
    assert.equal(writes.length, 0);
  }
});
test('bad primary with valid backup waits for explicit recovery', () => {
  const { flow, storage, writes } = fixture();
  const scoped = profileStorage(storage, 'v6-preview');
  scoped.setItem(SAVE_KEY, 'broken raw');
  scoped.setItem(BACKUP_KEY, exportSave(createGame(60000, 42173, 6)));
  writes.length = 0;
  flow.start('v6-preview');
  finish(flow);
  assert.equal(flow.page, 'saves');
  assert.equal(flow.inspect().status, 'recovered');
  assert.equal(scoped.getItem(SAVE_KEY), 'broken raw');
  assert.equal(writes.length, 0);
  flow.recover();
  assert.equal(flow.page, 'confirm');
  flow.confirm();
  finish(flow);
  assert.equal(flow.page, 'game');
  assert.equal(scoped.getItem(`${SAVE_KEY}.unreadable`), 'broken raw');
});
test('unprepared manual seed is pending, not corrupt or silently overwritten', () => {
  const { flow, storage, writes } = fixture();
  flow.profile = 'v6-preview';
  const saved = JSON.parse(exportSave(createGame(60000, 42173, 6)));
  saved.mapSeed = 74129;
  const raw = JSON.stringify({ format: 1, savedAt: 60000, save: JSON.stringify(saved) });
  profileStorage(storage, 'v6-preview').setItem(`${SAVE_KEY}.manual.1`, raw);
  writes.length = 0;
  assert.equal(flow.inspectSlot(1).status, 'pending');
  flow.chooseSlot(1);
  assert.equal(flow.page, 'preparing');
  flow.back();
  assert.equal(writes.length, 0);
  assert.equal(profileStorage(storage, 'v6-preview').getItem(`${SAVE_KEY}.manual.1`), raw);
});
test('one displayed frame performs several small steps within a soft budget', () => {
  const module = require('../.domain-build/domain/v6-preparation');
  const original = module.V6WorldPreparation;
  let steps = 0,
    cancelled = 0,
    done = 0;
  module.V6WorldPreparation = class {
    step(work) {
      assert.equal(work, 64);
      steps++;
      return { status: 'building', stage: 'terrain' };
    }
    cancel() {
      cancelled++;
    }
  };
  try {
    const flow = new V6PreparationFlow();
    flow.start(
      fixture().storage,
      () => done++,
      () => assert.fail('unexpected failure'),
    );
    let time = 0;
    const clock = () => (time += 0.5);
    flow.tick(clock);
    flow.tick(clock);
    assert.equal(steps, 0);
    flow.tick(clock);
    assert.ok(steps > 1 && steps < 20);
    flow.cancel();
    flow.tick(clock);
    assert.equal(cancelled, 1);
    assert.equal(done, 0);
  } finally {
    module.V6WorldPreparation = original;
  }
});
test('all v6 quanta have exact readable quantities and old integers remain unchanged', () => {
  for (const n of [1, 2, 7, 1024, 2048, 4095, 4097]) {
    const value = n / 4096,
      text = materialQuantity(value);
    assert.notEqual(text, '0');
    const parts = text
      .split('+')
      .map((part) =>
        part.includes('/') ? part.split('/').reduce((a, b) => Number(a) / Number(b)) : Number(part),
      );
    assert.equal(
      parts.reduce((a, b) => a + b, 0),
      value,
    );
  }
  for (const n of [0, 1, 5, 10, 99]) assert.equal(materialQuantity(n), String(n));
});
test('prepared reset confirmation cancels back to a usable menu, never a dead preparing page', () => {
  const { flow } = fixture();
  flow.profile = 'v6-preview';
  flow.page = 'saves';
  flow.newGame();
  finish(flow);
  assert.equal(flow.page, 'confirm');
  flow.back();
  assert.equal(flow.page, 'saves');
  assert.equal(flow.preparation.active, false);
  flow.newGame();
  finish(flow);
  flow.confirm();
  assert.equal(flow.page, 'game');
  assert.equal(flow.session.state.terrainVersion, 6);
});
test('eight title entries retain touch targets without covering title detail', () => {
  const { startLayout } = require('../.domain-build/application/StartLayout');
  for (const [width, height] of [
    [320, 568],
    [390, 650],
    [390, 700],
    [390, 844],
    [844, 390],
    [800, 600],
    [1280, 720],
  ]) {
    const layout = startLayout(width, height, 8, true);
    assert.ok(layout.buttonHeight >= 44);
    assert.ok(layout.buttonWidth >= 44);
    const highest = Math.max(...layout.buttons.map((p) => p.y + layout.buttonHeight / 2));
    assert.ok(
      highest <= layout.detailY - layout.detailHeight / 2,
      `${width}x${height} overlaps detail`,
    );
    for (const p of layout.buttons) {
      assert.ok(Math.abs(p.x) + layout.buttonWidth / 2 <= width / 2);
      assert.ok(Math.abs(p.y) + layout.buttonHeight / 2 <= height / 2);
    }
  }
});
test('a changed seed or save invalidates the pending preparation before any stale completion', () => {
  const module = require('../.domain-build/domain/v6-preparation');
  const original = module.V6WorldPreparation;
  let steps = 0,
    done = 0,
    failure = '';
  module.V6WorldPreparation = class {
    step() {
      steps++;
      return { status: 'building', stage: 'terrain' };
    }
    cancel() {}
  };
  try {
    const { storage } = fixture();
    storage.setItem(SAVE_KEY, exportSave(createGame(60000, 42173, 6)));
    const flow = new V6PreparationFlow();
    flow.start(
      storage,
      () => done++,
      (message) => (failure = message),
    );
    let clock = 0;
    const time = () => (clock += 2);
    flow.tick(time);
    flow.tick(time);
    flow.tick(time);
    const before = steps;
    storage.setItem(SAVE_KEY, 'new bytes from another page');
    flow.tick(time);
    assert.equal(steps, before);
    assert.equal(done, 0);
    assert.equal(flow.active, false);
    assert.match(failure, /准备期间已改变/);
    assert.equal(storage.getItem(SAVE_KEY), 'new bytes from another page');
  } finally {
    module.V6WorldPreparation = original;
  }
});
test('reload and recovery prepare only their cross-seed target while preserving the active cache pin', () => {
  const worlds = require('../.domain-build/domain/v6-world');
  const prepare = (seed) => {
    const job = new V6WorldPreparation(seed);
    while (job.progress.status === 'building') job.step(16384);
    job.takeResult();
  };
  const f = fixture();
  f.flow.start('v6-preview');
  finish(f.flow);
  const scoped = profileStorage(f.storage, 'v6-preview');
  prepare(7);
  const primary = exportSave(createGame(60000, 7, 6));
  prepare(8);
  const backup = exportSave(createGame(60000, 8, 6));
  assert.equal(worlds.hasPreparedV6World(42173), true);
  assert.equal(worlds.hasPreparedV6World(7), false);
  scoped.setItem(SAVE_KEY, primary);
  scoped.setItem(BACKUP_KEY, backup);
  assert.equal(f.flow.session.save(), false);
  assert.equal(f.flow.session.hasSaveConflict, true);
  f.flow.reloadLatest();
  f.flow.confirm();
  assert.equal(f.flow.page, 'preparing');
  f.flow.back();
  assert.equal(f.flow.session.state.mapSeed, 42173);
  assert.equal(scoped.getItem(SAVE_KEY), primary);
  f.flow.reloadLatest();
  f.flow.confirm();
  finish(f.flow);
  assert.equal(f.flow.session.state.mapSeed, 7);
  assert.equal(scoped.getItem(SAVE_KEY), primary);
  assert.equal(worlds.hasPreparedV6World(42173), true);
  assert.equal(worlds.hasPreparedV6World(8), false);
  scoped.setItem(SAVE_KEY, 'broken primary bytes');
  const original = f.flow.session;
  f.flow.recover();
  f.flow.confirm();
  assert.equal(f.flow.page, 'preparing');
  f.flow.back();
  assert.equal(f.flow.session, original);
  assert.equal(scoped.getItem(SAVE_KEY), 'broken primary bytes');
  f.flow.recover();
  f.flow.confirm();
  finish(f.flow);
  assert.equal(f.flow.session.state.mapSeed, 8);
  assert.equal(scoped.getItem(`${SAVE_KEY}.unreadable`), 'broken primary bytes');
  assert.equal(scoped.getItem(BACKUP_KEY), backup);
  assert.equal(worlds.hasPreparedV6World(7), true);
});
