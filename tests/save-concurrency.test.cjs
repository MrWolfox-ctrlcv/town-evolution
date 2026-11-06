const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GameSession } = require('../.domain-build/application/GameSession.js');
const { GameStart } = require('../.domain-build/application/GameStart.js');
const { startMenu } = require('../.domain-build/application/StartMenu.js');
const { writeSlot } = require('../.domain-build/application/ManualSaves.js');
const { townSession, profileStorage } = require('../.domain-build/application/TownProfiles.js');
const { createGame, exportSave } = require('../.domain-build/domain/game.js');
const {
  SAVE_KEY,
  BACKUP_KEY,
  saveGame,
  loadGame,
  resetSave,
} = require('../.domain-build/domain/storage.js');
function fixture() {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  saveGame(storage, createGame(60000));
  return {
    data,
    storage,
    session: () => new GameSession(storage, () => 60000),
    flow: () => new GameStart(storage, () => 60000),
  };
}
test('same-millisecond saves use exact bytes; stale hides never overwrite primary or backup', () => {
  const f = fixture(),
    a = f.session(),
    b = f.session();
  a.state.coins = 97;
  assert.ok(a.save());
  const primary = f.storage.getItem(SAVE_KEY),
    backup = f.storage.getItem(BACKUP_KEY);
  assert.equal(a.state.lastSeenAt, b.state.lastSeenAt);
  b.suspend();
  b.suspend();
  b.resume();
  b.suspend();
  assert.equal(f.storage.getItem(SAVE_KEY), primary);
  assert.equal(f.storage.getItem(BACKUP_KEY), backup);
  assert.equal(b.state.coins, 120);
  assert.equal(b.hasSaveConflict, true);
  assert.equal(b.hasUnsavedChanges, true);
  assert.match(b.statusMessage, /另一页面/);
  b.message = '已取消';
  assert.match(b.statusMessage, /另一页面/);
  assert.equal(b.run({ type: 'start', buildingId: 'b2' }), false);
});
test('failed stale save performs zero writes, including archival keys', () => {
  const f = fixture(),
    a = f.session(),
    b = f.session();
  a.state.coins = 97;
  a.save();
  let writes = 0;
  const write = f.storage.setItem;
  f.storage.setItem = (key, value) => {
    writes++;
    write(key, value);
  };
  assert.equal(b.save(), false);
  assert.equal(b.reset(), false);
  assert.equal(b.recover(), false);
  assert.equal(writes, 0);
});
test('a stale page cannot exit, switch, restart or load over another page', () => {
  for (const action of ['exit', 'switchTown', 'newGame', 'loadSlot']) {
    const f = fixture(),
      a = f.flow(),
      b = f.flow();
    a.start();
    b.start();
    writeSlot(f.storage, 1, { ...createGame(60000), coins: 14 }, 60000);
    const stale = b.session;
    a.session.state.coins = 97;
    a.session.save();
    const before = [...f.data.entries()];
    if (action === 'switchTown') b.switchTown('demo');
    else {
      if (action === 'loadSlot') b.chooseSlot(1);
      b[action]();
      b.confirm();
    }
    assert.equal(b.session, stale, action);
    assert.equal(stale.state.coins, 120, action);
    assert.deepEqual([...f.data.entries()], before, action);
    assert.match(stale.statusMessage, /另一页面/, action);
  }
});
test('conflicting in-memory progress can be saved separately before explicitly loading latest', () => {
  const f = fixture(),
    a = f.flow(),
    b = f.flow();
  a.start();
  b.start();
  b.session.state.coins = 83;
  a.session.state.coins = 97;
  a.session.save();
  b.session.suspend();
  b.saves();
  assert.ok(startMenu(b, () => {}).actions.some((action) => action.id === 'reload-latest'));
  b.chooseSlot(3);
  b.saveSlot();
  assert.equal(b.inspectSlot(3).state.coins, 83);
  const primary = f.storage.getItem(SAVE_KEY),
    backup = f.storage.getItem(BACKUP_KEY);
  b.reloadLatest();
  b.back();
  assert.equal(b.session.state.coins, 83);
  b.reloadLatest();
  b.confirm();
  assert.equal(b.session.state.coins, 97);
  assert.equal(b.session.hasSaveConflict, false);
  assert.equal(f.storage.getItem(SAVE_KEY), primary);
  assert.equal(f.storage.getItem(BACKUP_KEY), backup);
  b.session.state.coins = 96;
  assert.ok(b.session.save());
});
test('two empty-tab sessions cannot overwrite the first new town', () => {
  const f = fixture();
  f.data.clear();
  const a = f.session(),
    b = f.session();
  a.state.coins = 91;
  a.save();
  const before = [...f.data.entries()];
  assert.equal(b.save(), false);
  assert.deepEqual([...f.data.entries()], before);
});
test('stale direct resets and recovery sessions preserve all newer keys', () => {
  const f = fixture(),
    stale = f.session(),
    current = f.session();
  current.state.coins = 97;
  current.save();
  const before = [...f.data.entries()];
  assert.equal(stale.reset(), false);
  assert.deepEqual([...f.data.entries()], before);
  f.storage.setItem(SAVE_KEY, 'broken');
  const recovery = f.session();
  assert.equal(recovery.mode, 'recovered');
  resetSave(f.storage, { ...createGame(60000), coins: 64 });
  const changed = [...f.data.entries()];
  assert.equal(recovery.recover(), false);
  assert.deepEqual([...f.data.entries()], changed);
});
test('changing backup with the same broken primary invalidates pending recovery', () => {
  const f = fixture();
  f.storage.setItem(SAVE_KEY, 'broken');
  f.storage.setItem(BACKUP_KEY, exportSave(createGame(60000)));
  const recovery = f.session();
  f.storage.setItem(BACKUP_KEY, exportSave({ ...createGame(60000), coins: 71 }));
  const before = [...f.data.entries()];
  assert.equal(recovery.recover(), false);
  assert.deepEqual([...f.data.entries()], before);
});
test('title new-game and manual-load confirmations reject a newer primary', () => {
  for (const action of ['newGame', 'loadSlot']) {
    const f = fixture(),
      title = f.flow();
    writeSlot(f.storage, 1, { ...createGame(60000), coins: 14 }, 60000);
    title.saves();
    if (action === 'loadSlot') title.chooseSlot(1);
    title[action]();
    const other = f.session();
    other.state.coins = 97;
    other.save();
    const before = [...f.data.entries()];
    title.confirm();
    assert.equal(title.session, null, action);
    assert.deepEqual([...f.data.entries()], before, action);
    assert.match(title.message, /另一页面/, action);
  }
});
test('title recovery confirmation retains the backup actually offered', () => {
  const f = fixture(),
    title = f.flow();
  f.storage.setItem(SAVE_KEY, 'broken');
  f.storage.setItem(BACKUP_KEY, exportSave(createGame(60000)));
  title.saves();
  title.recover();
  f.storage.setItem(BACKUP_KEY, exportSave({ ...createGame(60000), coins: 67 }));
  const before = [...f.data.entries()];
  title.confirm();
  assert.equal(title.session, null);
  assert.deepEqual([...f.data.entries()], before);
  assert.match(title.message, /另一页面/);
});
test('manual overwrite confirmation cannot replace another tab latest slot or its archive', () => {
  const f = fixture(),
    flow = f.flow();
  flow.start();
  flow.chooseSlot(1);
  flow.saveSlot();
  flow.session.state.coins = 81;
  flow.saveSlot();
  assert.equal(flow.page, 'confirm');
  writeSlot(f.storage, 1, { ...createGame(60000), coins: 37 }, 60000);
  const before = [...f.data.entries()];
  flow.confirm();
  assert.deepEqual([...f.data.entries()], before);
  assert.equal(flow.session.state.coins, 81);
  assert.match(flow.message, /另一页面/);
});
test('manual-load confirmation rejects a different valid slot with the same timestamp', () => {
  const f = fixture(),
    flow = f.flow();
  writeSlot(f.storage, 1, { ...createGame(60000), coins: 14 }, 60000);
  flow.saves();
  flow.chooseSlot(1);
  flow.loadSlot();
  writeSlot(f.storage, 1, { ...createGame(60000), coins: 37 }, 60000);
  const before = [...f.data.entries()];
  flow.confirm();
  assert.equal(flow.session, null);
  assert.deepEqual([...f.data.entries()], before);
  assert.match(flow.message, /另一页面/);
});
test('independent demo and normal writes do not create false conflicts', () => {
  const f = fixture();
  const normal = townSession(f.storage, 'normal', () => 60000);
  const demo = townSession(f.storage, 'demo', () => 60000);
  normal.state.coins = 97;
  demo.state.coins = 88;
  assert.ok(normal.save());
  assert.ok(demo.save());
  assert.ok(normal.save());
  assert.ok(demo.save());
  assert.equal(loadGame(f.storage, 60000).state.coins, 97);
  assert.equal(loadGame(profileStorage(f.storage, 'demo'), 60000).state.coins, 88);
});

test('a stale command is rejected before spending or changing in-memory progress', () => {
  const f = fixture(),
    a = f.session(),
    b = f.session();
  const memory = exportSave(b.state);
  a.state.coins = 97;
  a.save();
  const saved = [...f.data.entries()];
  assert.equal(b.run({ type: 'start', buildingId: 'b2' }), false);
  assert.equal(exportSave(b.state), memory);
  assert.deepEqual([...f.data.entries()], saved);
  assert.equal(b.hasSaveConflict, true);
});
