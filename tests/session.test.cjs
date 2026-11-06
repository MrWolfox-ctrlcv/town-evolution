const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GameSession } = require('../.domain-build/application/GameSession.js');
const { SAVE_KEY, BACKUP_KEY } = require('../.domain-build/domain/storage.js');
const { createGame, exportSave } = require('../.domain-build/domain/game.js');
function setup() {
  let now = 0;
  const data = new Map();
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
  return { storage, setTime: (n) => (now = n), session: () => new GameSession(storage, () => now) };
}
test('session persists successful commands and recovers after restart', () => {
  const fixture = setup(),
    s = fixture.session();
  assert.equal(s.run({ type: 'start', buildingId: 'b2' }), true);
  fixture.setTime(15000);
  const restored = fixture.session();
  assert.equal(restored.run({ type: 'collect', buildingId: 'b2' }), true);
  assert.equal(restored.state.inventory.vegetable, 0);
  const drop = restored.state.looseDrops[0];
  assert.equal(drop.item, 'vegetable');
  assert.equal(drop.amount, 2);
  const awaitingPickup = fixture.session();
  assert.equal(awaitingPickup.state.inventory.vegetable, 0);
  assert.deepEqual(awaitingPickup.state.looseDrops, restored.state.looseDrops);
  assert.equal(awaitingPickup.run({ type: 'pickupDrop', dropId: drop.id }), true);
  assert.equal(awaitingPickup.state.inventory.vegetable, 2);
  const pickedUp = fixture.session();
  assert.equal(pickedUp.state.inventory.vegetable, 2);
  assert.equal(pickedUp.state.looseDrops.length, 0);
  assert.equal(pickedUp.run({ type: 'pickupDrop', dropId: drop.id }), false);
  assert.equal(fixture.session().state.inventory.vegetable, 2);
});
test('preview reason never spends money or allocates identifiers', () => {
  const f = setup(),
    s = f.session();
  const before = exportSave(s.state);
  assert.match(s.reason({ type: 'place', kind: 'cooler', x: 5, z: 3 }), /暂停|合成/);
  assert.match(
    s.reason({ type: 'upgrade', buildingId: 'b1', target: 'expandedWarehouse' }),
    /暂停|合成/,
  );
  assert.equal(exportSave(s.state), before);
  assert.equal(f.storage.getItem(SAVE_KEY), null);
});
test('corrupt primary suspends gameplay without overwriting data', () => {
  const f = setup();
  f.storage.setItem(SAVE_KEY, 'corrupt');
  const s = f.session();
  assert.equal(s.mode, 'corrupt');
  assert.equal(s.run({ type: 'start', buildingId: 'b2' }), false);
  s.suspend();
  assert.equal(f.storage.getItem(SAVE_KEY), 'corrupt');
});
test('backup adoption is explicit before new commands', () => {
  const f = setup();
  f.storage.setItem(SAVE_KEY, 'corrupt');
  f.storage.setItem(BACKUP_KEY, exportSave(createGame(0)));
  const s = f.session();
  assert.equal(s.mode, 'recovered');
  assert.equal(s.run({ type: 'start', buildingId: 'b2' }), false);
  s.recover();
  assert.equal(s.mode, 'normal');
  assert.equal(s.run({ type: 'start', buildingId: 'b2' }), true);
  assert.equal(f.storage.getItem(SAVE_KEY + '.unreadable'), 'corrupt');
});
test('storage failure is visible while in-memory state remains usable', () => {
  const f = setup(),
    s = f.session();
  f.storage.setItem = () => {
    throw Error('quota');
  };
  assert.equal(s.run({ type: 'start', buildingId: 'b2' }), true);
  assert.match(s.message, /保存失败/);
  assert.ok(s.state.buildings[1].cropJobs[0]);
});
test('future-version warning survives session initialization', () => {
  const f = setup();
  f.storage.setItem(SAVE_KEY, JSON.stringify({ ...createGame(0), schemaVersion: 999 }));
  const s = f.session();
  assert.equal(s.mode, 'corrupt');
  assert.match(s.message, /版本不兼容/);
});

test('unsaved warning survives selection feedback and clears only after successful write', () => {
  const f = setup(),
    s = f.session();
  const write = f.storage.setItem;
  f.storage.setItem = () => {
    throw Error('quota');
  };
  assert.ok(s.run({ type: 'start', buildingId: 'b2' }));
  assert.equal(s.hasUnsavedChanges, true);
  s.message = '';
  assert.match(s.statusMessage, /保存失败/);
  s.message = '已取消';
  assert.match(s.statusMessage, /保存失败/);
  assert.equal(s.save(), false);
  assert.equal(s.hasUnsavedChanges, true);
  f.storage.setItem = write;
  assert.equal(s.save(), true);
  assert.equal(s.hasUnsavedChanges, false);
  assert.ok(f.session().state.buildings.find((b) => b.id === 'b2').cropJobs[0]);
});

test('successful retry removes the old raw failure message as well as the warning flag', () => {
  const f = setup(),
    s = f.session(),
    write = f.storage.setItem;
  f.storage.setItem = () => {
    throw Error('quota');
  };
  s.run({ type: 'start', buildingId: 'b2' });
  f.storage.setItem = write;
  assert.ok(s.save());
  assert.equal(s.statusMessage, '已保存');
});
