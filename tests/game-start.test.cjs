const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GameStart } = require('../.domain-build/application/GameStart.js');
const { startMenu } = require('../.domain-build/application/StartMenu.js');
const { startLayout } = require('../.domain-build/application/StartLayout.js');
const { inspectSlot, writeSlot } = require('../.domain-build/application/ManualSaves.js');
const { profileStorage } = require('../.domain-build/application/TownProfiles.js');
const { createGame, exportSave } = require('../.domain-build/domain/game.js');
const { SAVE_KEY, BACKUP_KEY, loadGame } = require('../.domain-build/domain/storage.js');
function fixture() {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  let now = 60000;
  return { data, storage, flow: new GameStart(storage, () => now), time: (value) => (now = value) };
}
test('title, menus and guide do not create or overwrite a town', () => {
  const { data, flow } = fixture();
  assert.equal(flow.page, 'title');
  let guides = 0;
  const menu = startMenu(flow, () => guides++);
  assert.deepEqual(
    menu.actions.map((a) => a.id),
    ['start', 'demo', 'v5-preview', 'v5-bridge-demo', 'v6-preview', 'saves', 'guide', 'exit'],
  );
  assert.equal(menu.actions[0].text, '开始游戏');
  menu.actions.find((a) => a.id === 'guide').run();
  assert.equal(guides, 1);
  flow.saves();
  flow.chooseSlot(1);
  flow.back();
  flow.back();
  flow.exit();
  assert.match(flow.message, /关闭此标签页/);
  flow.back();
  assert.equal(flow.page, 'title');
  assert.equal(data.size, 0);
});
test('begin normal game creates exactly one live session; reopening title offers continue', () => {
  const { storage, flow } = fixture();
  assert.equal(flow.start(), true);
  const first = flow.session;
  assert.equal(flow.start(), true);
  assert.equal(flow.session, first);
  assert.equal(flow.profile, 'normal');
  assert.equal(loadGame(storage, 60000).status, 'loaded');
  flow.exit();
  assert.equal(flow.page, 'confirm');
  flow.back();
  assert.equal(flow.page, 'game');
  assert.equal(flow.session, first);
  flow.exit();
  flow.confirm();
  flow.confirm();
  assert.equal(flow.page, 'title');
  assert.equal(flow.session, null);
  assert.equal(startMenu(flow, () => {}).actions[0].text, '继续游戏');
});
test('a previous normal town is continued unchanged and never replaced by demo initialization', () => {
  const { storage, flow } = fixture();
  const old = { ...createGame(60000), coins: 97 };
  storage.setItem(SAVE_KEY, exportSave(old));
  assert.equal(flow.start('demo'), true);
  flow.session.state.coins = 31;
  flow.session.save();
  flow.switchTown('normal');
  assert.equal(flow.session.state.coins, 97);
  assert.equal(loadGame(profileStorage(storage, 'demo'), 60000).state.coins, 31);
});
test('corruption and unsupported saves remain untouched until explicit recovery or new-game confirmation', () => {
  for (const raw of ['broken', JSON.stringify({ schemaVersion: 999 })]) {
    const { storage, flow } = fixture();
    storage.setItem(SAVE_KEY, raw);
    const before = storage.getItem(SAVE_KEY);
    assert.equal(flow.start(), false);
    assert.equal(flow.page, 'saves');
    flow.newGame();
    assert.equal(flow.page, 'confirm');
    flow.back();
    assert.equal(storage.getItem(SAVE_KEY), before);
    flow.newGame();
    flow.confirm();
    assert.equal(flow.page, 'game');
    assert.equal(storage.getItem(`${SAVE_KEY}.before-reset`), before);
  }
});
test('automatic recovery is explicit and preserves raw primary', () => {
  const { storage, flow } = fixture();
  storage.setItem(SAVE_KEY, 'broken primary');
  storage.setItem(BACKUP_KEY, exportSave({ ...createGame(60000), coins: 73 }));
  assert.equal(flow.start(), false);
  assert.equal(flow.inspect().status, 'recovered');
  flow.recover();
  assert.equal(storage.getItem(SAVE_KEY), 'broken primary');
  flow.confirm();
  assert.equal(flow.page, 'game');
  assert.equal(flow.session.state.coins, 73);
  assert.equal(storage.getItem(`${SAVE_KEY}.unreadable`), 'broken primary');
});
test('denied storage never masquerades as a new game', () => {
  const { storage, flow } = fixture();
  storage.getItem = () => {
    throw Error('denied');
  };
  assert.equal(flow.start(), false);
  assert.equal(flow.session, null);
  assert.equal(flow.page, 'saves');
  assert.match(flow.message, /存储|存档/);
});
test('failed save blocks exit, new game, profile switch and slot load without discarding live state', () => {
  for (const action of ['exit', 'newGame', 'switchTown', 'loadSlot']) {
    const { storage, flow } = fixture();
    flow.start();
    flow.chooseSlot(1);
    flow.saveSlot();
    flow.session.state.coins = 84;
    const session = flow.session;
    storage.setItem = () => {
      throw Error('quota');
    };
    if (action === 'switchTown') flow.switchTown('demo');
    else {
      flow[action]();
      flow.confirm();
    }
    assert.equal(flow.session, session, action);
    assert.equal(flow.session.state.coins, 84, action);
    assert.match(flow.message, /保存失败/, action);
  }
});
test('manual save overwrite and restore each require confirmation and preserve earlier data', () => {
  const { storage, flow } = fixture();
  flow.start();
  flow.saves();
  flow.chooseSlot(1);
  flow.saveSlot();
  const first = storage.getItem(`${SAVE_KEY}.manual.1`);
  flow.session.state.coins = 75;
  flow.saveSlot();
  assert.equal(flow.page, 'confirm');
  assert.equal(storage.getItem(`${SAVE_KEY}.manual.1`), first);
  flow.confirm();
  assert.equal(storage.getItem(`${SAVE_KEY}.manual.1.before-overwrite`), first);
  assert.equal(flow.inspectSlot().state.coins, 75);
  flow.session.state.coins = 42;
  flow.loadSlot();
  assert.equal(flow.page, 'confirm');
  assert.equal(flow.session.state.coins, 42);
  flow.confirm();
  assert.equal(flow.session.state.coins, 75);
  assert.equal(JSON.parse(storage.getItem(`${SAVE_KEY}.before-reset`)).coins, 42);
  assert.equal(flow.page, 'game');
});
test('normal and demo manual slots are isolated', () => {
  const { storage, flow } = fixture();
  flow.start();
  flow.chooseSlot(2);
  flow.saveSlot();
  flow.switchTown('demo');
  assert.equal(flow.inspectSlot(2).status, 'empty');
  flow.chooseSlot(2);
  flow.session.state.coins = 34;
  flow.saveSlot();
  assert.equal(inspectSlot(storage, 2, 60000).state.coins, 120);
  assert.equal(inspectSlot(profileStorage(storage, 'demo'), 2, 60000).state.coins, 34);
});
test('broken manual slots stay protected and failed archival write leaves them untouched', () => {
  const { storage, flow } = fixture();
  flow.start();
  storage.setItem(`${SAVE_KEY}.manual.1`, 'damaged slot');
  flow.chooseSlot(1);
  assert.equal(flow.inspectSlot().status, 'corrupt');
  flow.loadSlot();
  assert.equal(flow.page, 'slot');
  flow.saveSlot();
  assert.equal(flow.page, 'confirm');
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (key.endsWith('before-overwrite')) throw Error('quota');
    write(key, value);
  };
  flow.confirm();
  assert.equal(storage.getItem(`${SAVE_KEY}.manual.1`), 'damaged slot');
  assert.match(flow.message, /保存失败/);
});
test('manual slots validate save data and cannot write arbitrary storage keys', () => {
  const { storage } = fixture();
  assert.throws(() => writeSlot(storage, 99, createGame(60000), 60000));
  assert.throws(() => writeSlot(storage, 1, { coins: -1 }, 60000));
  assert.throws(() => writeSlot(storage, 1, createGame(60000), NaN));
  storage.setItem(
    `${SAVE_KEY}.manual.1`,
    JSON.stringify({ format: 1, savedAt: 1, save: '{"schemaVersion":999}' }),
  );
  assert.equal(inspectSlot(storage, 1, 60000).status, 'corrupt');
});
test('manual restore from title does not overwrite the slot itself', () => {
  const { storage, flow } = fixture();
  writeSlot(storage, 3, { ...createGame(60000), coins: 17 }, 60000);
  const slot = storage.getItem(`${SAVE_KEY}.manual.3`);
  flow.saves();
  flow.chooseSlot(3);
  flow.loadSlot();
  flow.confirm();
  assert.equal(flow.page, 'game');
  assert.equal(flow.session.state.coins, 17);
  assert.equal(storage.getItem(`${SAVE_KEY}.manual.3`), slot);
});
test('phone and landscape layouts retain 44px hit areas inside the viewport', () => {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [430, 932],
    [844, 390],
    [568, 320],
    [1024, 768],
  ]) {
    for (const [count, title] of [
      [5, true],
      [7, false],
      [3, false],
      [2, false],
    ]) {
      const layout = startLayout(width, height, count, title);
      assert.equal(layout.buttonHeight, 44);
      assert.ok(layout.buttonWidth >= 120);
      for (const point of layout.buttons) {
        assert.ok(Math.abs(point.x) + layout.buttonWidth / 2 <= width / 2 - 12);
        assert.ok(Math.abs(point.y) + layout.buttonHeight / 2 <= height / 2 - 12);
      }
    }
  }
});

test('slot changing while confirmation is open cannot bypass validation', () => {
  const { storage, flow } = fixture();
  flow.start();
  const current = flow.session;
  flow.chooseSlot(1);
  flow.saveSlot();
  flow.loadSlot();
  storage.setItem(`${SAVE_KEY}.manual.1`, 'changed to unreadable');
  flow.confirm();
  assert.equal(flow.session, current);
  assert.match(flow.message, /无法读取/);
  assert.equal(storage.getItem(`${SAVE_KEY}.manual.1`), 'changed to unreadable');
});

test('failed recovery archival write does not replace the unreadable primary', () => {
  const { storage, flow } = fixture();
  storage.setItem(SAVE_KEY, 'unreadable');
  storage.setItem(BACKUP_KEY, exportSave(createGame(60000)));
  flow.start();
  flow.recover();
  const write = storage.setItem;
  storage.setItem = (key, value) => {
    if (key.endsWith('.unreadable')) throw Error('quota');
    write(key, value);
  };
  flow.confirm();
  assert.equal(flow.session, null);
  assert.equal(storage.getItem(SAVE_KEY), 'unreadable');
  assert.match(flow.message, /恢复失败/);
});
