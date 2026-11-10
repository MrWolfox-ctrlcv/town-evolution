const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GameStart } = require('../.domain-build/application/GameStart.js');
const { writeSlot } = require('../.domain-build/application/ManualSaves.js');
const {
  profileStorage,
  DEMO_REVISION_KEY,
} = require('../.domain-build/application/TownProfiles.js');
const { createGame, exportSave } = require('../.domain-build/domain/game.js');
const { SAVE_KEY } = require('../.domain-build/domain/storage.js');
function fixture(live, profile = 'normal') {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  const scoped = profileStorage(storage, profile);
  scoped.setItem(SAVE_KEY, exportSave({ ...createGame(60000), coins: 83 }));
  const primaryKey = [...data.keys()][0];
  const flow = new GameStart(storage, () => 60000);
  if (live) assert.equal(flow.start(profile), true);
  else flow.chooseProfile(profile);
  writeSlot(scoped, 1, { ...createGame(60000), coins: 14 }, 60000);
  flow.chooseSlot(1);
  flow.loadSlot();
  return { data, storage, scoped, primaryKey, flow, original: flow.session };
}
for (const live of [false, true]) {
  for (const failure of [
    'missing',
    'replaced',
    'read-throws',
    'final-read-race',
    'final-read-throws',
  ]) {
    test(`manual restore retains ${live ? 'live session' : 'title caller'} after ${failure}`, () => {
      const f = fixture(live);
      const manual = f.scoped.getItem(`${SAVE_KEY}.manual.1`);
      const previous = f.scoped.getItem(SAVE_KEY);
      const replacement = exportSave({ ...createGame(60000), coins: 97 });
      const write = f.storage.setItem;
      const read = f.storage.getItem;
      let committed = false;
      let reads = 0;
      f.storage.setItem = (key, value) => {
        write(key, value);
        if (key !== f.primaryKey) return;
        committed = true;
        if (failure === 'missing') f.data.delete(key);
        if (failure === 'replaced') f.data.set(key, replacement);
      };
      f.storage.getItem = (key) => {
        if (!committed || key !== f.primaryKey) return read(key);
        reads++;
        if (failure === 'read-throws' || (failure === 'final-read-throws' && reads === 2))
          throw Error('storage unavailable');
        const value = read(key);
        if (failure === 'final-read-race' && reads === 1) f.data.set(key, replacement);
        return value;
      };
      f.flow.confirm();
      f.storage.getItem = read;
      f.storage.setItem = write;
      assert.equal(committed, true);
      assert.ok(f.flow.session === f.original);
      assert.equal(f.flow.page, 'slot');
      assert.match(f.flow.message, /校验失败.*尚未切换小镇/);
      if (!live) assert.doesNotMatch(f.flow.message, /当前游戏/);
      assert.equal(f.scoped.getItem(`${SAVE_KEY}.manual.1`), manual);
      assert.equal(f.scoped.getItem(`${SAVE_KEY}.before-reset`), previous);
      if (failure === 'missing') assert.equal(f.scoped.getItem(SAVE_KEY), null);
      if (failure === 'replaced' || failure === 'final-read-race')
        assert.equal(f.scoped.getItem(SAVE_KEY), replacement);
      if (live) {
        assert.equal(f.original.state.coins, 83);
        const before = [...f.data.entries()];
        assert.equal(f.original.save(), false);
        assert.equal(f.original.hasSaveConflict, true);
        assert.deepEqual([...f.data.entries()], before);
      }
    });
  }
}
for (const profile of ['normal', 'demo']) {
  for (const live of [false, true]) {
    test(`successful ${profile} manual restore from ${live ? 'live game' : 'title'} remains writable`, () => {
      const f = fixture(live, profile);
      const manual = f.scoped.getItem(`${SAVE_KEY}.manual.1`);
      f.flow.confirm();
      assert.equal(f.flow.page, 'game');
      assert.equal(f.flow.session.state.coins, 14);
      assert.notEqual(f.flow.session, f.original);
      f.flow.session.state.coins = 13;
      assert.equal(f.flow.session.save(), true);
      assert.equal(JSON.parse(f.scoped.getItem(SAVE_KEY)).coins, 13);
      assert.equal(f.scoped.getItem(`${SAVE_KEY}.manual.1`), manual);
      assert.equal(JSON.parse(f.scoped.getItem(`${SAVE_KEY}.before-reset`)).coins, 83);
    });
  }
}
test('disappearing demo primary does not initialize template metadata during validation', () => {
  const f = fixture(true, 'demo');
  f.storage.setItem(DEMO_REVISION_KEY, 'old-template-marker');
  const write = f.storage.setItem;
  const writes = [];
  f.storage.setItem = (key, value) => {
    writes.push(key);
    write(key, value);
    if (key === f.primaryKey) f.data.delete(key);
  };
  f.flow.confirm();
  assert.ok(f.flow.session === f.original);
  assert.equal(f.storage.getItem(DEMO_REVISION_KEY), 'old-template-marker');
  assert.equal(writes.includes(DEMO_REVISION_KEY), false);
});
