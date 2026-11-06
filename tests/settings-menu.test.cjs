const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { GameStart } = require('../.domain-build/application/GameStart.js');
const { startMenu } = require('../.domain-build/application/StartMenu.js');
const { hudLayout } = require('../.domain-build/application/HudLayout.js');
const { SAVE_KEY, loadGame } = require('../.domain-build/domain/storage.js');
const { profileStorage } = require('../.domain-build/application/TownProfiles.js');
const { exportSave } = require('../.domain-build/domain/game.js');
function fixture() {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  return { data, storage, flow: new GameStart(storage, () => 60000) };
}
function action(flow, id) {
  const result = startMenu(flow, () => {}).actions.find((entry) => entry.id === id);
  assert.ok(result, `Menu action ${id} exists on ${flow.page}`);
  result.run();
}
test('settings is a read-only game menu with only working save and navigation actions', () => {
  const { data, flow } = fixture();
  flow.settings();
  assert.equal(flow.page, 'title');
  assert.equal(data.size, 0);
  flow.start('demo');
  const session = flow.session;
  const before = [...data];
  for (let repeat = 0; repeat < 3; repeat++) {
    flow.settings();
    const menu = startMenu(flow, () => {});
    assert.equal(menu.title, '设置');
    assert.equal(menu.subtitle, '演示岛');
    assert.deepEqual(
      menu.actions.map((entry) => entry.id),
      ['save-now', 'saves', 'town-actions', 'new-game', 'exit', 'back'],
    );
    assert.doesNotMatch(JSON.stringify(menu), /音量|音乐|音效/);
    action(flow, 'back');
    assert.equal(flow.page, 'game');
    assert.equal(flow.session, session);
  }
  assert.deepEqual([...data], before);
});
test('settings save management returns through slots, settings and game without losing session', () => {
  const { flow } = fixture();
  flow.start();
  const session = flow.session;
  flow.settings();
  action(flow, 'save-now');
  assert.match(flow.message, /自动存档已更新/);
  action(flow, 'saves');
  assert.equal(flow.page, 'saves');
  assert.equal(startMenu(flow, () => {}).actions.at(-1).text, '返回设置');
  action(flow, 'slot-1');
  action(flow, 'write-slot');
  assert.equal(flow.inspectSlot().status, 'ready');
  action(flow, 'back');
  assert.equal(flow.page, 'saves');
  action(flow, 'back');
  assert.equal(flow.page, 'settings');
  action(flow, 'back');
  assert.equal(flow.page, 'game');
  assert.equal(flow.session, session);
  flow.saves();
  assert.equal(startMenu(flow, () => {}).actions.at(-1).text, '返回游戏');
  action(flow, 'back');
  assert.equal(flow.page, 'game');
});
test('a failed profile switch returns from save recovery to the live game, not a stale settings path', () => {
  const { storage, flow } = fixture();
  flow.start();
  flow.settings();
  action(flow, 'saves');
  action(flow, 'back');
  action(flow, 'back');
  const session = flow.session;
  session.state.coins = 77;
  storage.setItem = () => {
    throw Error('quota');
  };
  flow.switchTown('demo');
  assert.equal(flow.page, 'saves');
  assert.equal(startMenu(flow, () => {}).actions.at(-1).text, '返回游戏');
  action(flow, 'back');
  assert.equal(flow.page, 'game');
  assert.equal(flow.session, session);
});
test('demo reset is explicit, cancels back to settings, archives old demo and leaves normal/manual saves', () => {
  const { data, storage, flow } = fixture();
  flow.start();
  const normal = storage.getItem(SAVE_KEY);
  flow.switchTown('demo');
  flow.session.state.coins = 67;
  flow.session.save();
  flow.saves();
  flow.chooseSlot(1);
  flow.saveSlot();
  flow.settings();
  const demo = profileStorage(storage, 'demo');
  const old = demo.getItem(SAVE_KEY);
  const slot = demo.getItem(`${SAVE_KEY}.manual.1`);
  const before = [...data];
  const session = flow.session;
  assert.equal(
    startMenu(flow, () => {}).actions.find((entry) => entry.id === 'new-game').text,
    '重置演示岛…',
  );
  action(flow, 'new-game');
  assert.equal(flow.page, 'confirm');
  assert.match(flow.pending.text, /演示岛.*手动存档不变/);
  assert.deepEqual([...data], before);
  action(flow, 'cancel');
  assert.equal(flow.page, 'settings');
  assert.equal(flow.session, session);
  assert.deepEqual([...data], before);
  action(flow, 'new-game');
  action(flow, 'confirm');
  flow.confirm();
  assert.equal(flow.page, 'game');
  assert.notEqual(flow.session, session);
  assert.equal(demo.getItem(`${SAVE_KEY}.before-reset`), old);
  assert.equal(demo.getItem(`${SAVE_KEY}.manual.1`), slot);
  assert.equal(storage.getItem(SAVE_KEY), normal);
  assert.notEqual(loadGame(demo, 60000).state.coins, 67);
});
test('settings reset and exit retain the live town when saving fails', () => {
  for (const id of ['new-game', 'exit']) {
    const { storage, flow } = fixture();
    flow.start('demo');
    flow.settings();
    const session = flow.session;
    const demo = profileStorage(storage, 'demo');
    const old = demo.getItem(SAVE_KEY);
    session.state.coins = 53;
    action(flow, id);
    storage.setItem = () => {
      throw Error('quota');
    };
    action(flow, 'confirm');
    assert.equal(flow.page, 'settings');
    assert.equal(flow.session, session);
    assert.equal(session.state.coins, 53);
    assert.equal(demo.getItem(SAVE_KEY), old);
    assert.match(flow.message, /保存失败/);
  }
});
test('settings reset cannot replace a newer save written during confirmation', () => {
  const { storage, flow } = fixture();
  flow.start('demo');
  flow.settings();
  const session = flow.session;
  action(flow, 'new-game');
  const newer = exportSave({ ...session.state, coins: 94 });
  const demo = profileStorage(storage, 'demo');
  demo.setItem(SAVE_KEY, newer);
  action(flow, 'confirm');
  assert.equal(flow.page, 'settings');
  assert.equal(flow.session, session);
  assert.equal(demo.getItem(SAVE_KEY), newer);
  assert.match(flow.message, /另一页面/);
});
test('settings exit cancels safely and only returns to title after a successful confirmed save', () => {
  const { flow } = fixture();
  flow.start();
  const session = flow.session;
  flow.settings();
  action(flow, 'exit');
  action(flow, 'cancel');
  assert.equal(flow.page, 'settings');
  assert.equal(flow.session, session);
  action(flow, 'exit');
  action(flow, 'confirm');
  assert.equal(flow.page, 'title');
  assert.equal(flow.session, null);
  assert.match(flow.message, /进度已保存/);
});
test('top-right settings keeps a 44px tap target clear of resources in phone and landscape layouts', () => {
  for (const [width, height] of [
    [320, 568],
    [360, 640],
    [390, 844],
    [430, 932],
    [568, 320],
    [844, 390],
    [1280, 800],
  ]) {
    const layout = hudLayout(width, height);
    assert.ok(layout.settingsWidth >= 44 && layout.settingsHeight >= 44);
    assert.ok(
      layout.settingsX - layout.settingsWidth / 2 >= layout.summaryX + layout.summaryWidth / 2 + 12,
    );
    assert.ok(layout.settingsX + layout.settingsWidth / 2 <= width / 2 - 12);
    assert.ok(layout.settingsY + layout.settingsHeight / 2 <= height / 2 - 6);
    assert.ok(layout.settingsY - layout.settingsHeight / 2 >= -height / 2);
  }
});
test('settings uses the shared tap gate, cancels interrupted/multitouch input and blocks map drop-through', () => {
  const hud = fs.readFileSync('assets/scripts/presentation/TownHUD.ts', 'utf8');
  const controller = fs.readFileSync('assets/scripts/presentation/TownController.ts', 'utf8');
  const bootstrap = fs.readFileSync('assets/scripts/presentation/TownBootstrap.ts', 'utf8');
  assert.match(
    hud,
    /this\.settings = new ActionButton\(this\.canvas, explain, this\.settingsArt\)/,
  );
  assert.match(hud, /cancelMultiTouch[\s\S]*?this\.settings\.cancelGesture\(\)/);
  assert.match(hud, /cancelGestures\(\): void \{\s*this\.settings\.cancelGesture\(\)/);
  assert.match(
    hud,
    /coversMapPoint[\s\S]*?this\.settings\.node\.getComponent\(UITransform\)!\.hitTest/,
  );
  assert.match(controller, /menu \? \(\) => menu\('settings'\) : undefined/);
  assert.match(
    bootstrap,
    /this\.controller\?\.suspend\(\);\s*if \(action === 'settings'\) this\.flow\.settings\(\)/,
  );
});

test('settings reaches former tool actions once without modifying a save', () => {
  const { data, flow } = fixture();
  flow.openTownActions();
  assert.equal(flow.consumeTownActions(), false);
  flow.start('demo');
  const session = flow.session;
  const before = [...data];
  flow.settings();
  action(flow, 'town-actions');
  assert.equal(flow.page, 'game');
  assert.equal(flow.session, session);
  assert.equal(flow.consumeTownActions(), true);
  assert.equal(flow.consumeTownActions(), false);
  assert.deepEqual([...data], before);
});

test('a storage lock prevents entering town actions without removing save inspection', () => {
  const { storage } = fixture();
  let warning = '';
  const flow = new GameStart(
    storage,
    () => 60000,
    () => warning,
  );
  flow.start();
  flow.settings();
  warning = '另一个页面正在使用此小镇';
  action(flow, 'town-actions');
  assert.equal(flow.page, 'settings');
  assert.equal(flow.consumeTownActions(), false);
  action(flow, 'saves');
  assert.equal(flow.page, 'saves');
});

test('illustrated settings, saves and confirmations fit phone and landscape tap bounds', () => {
  const { settingsLayout } = require('../.domain-build/application/SettingsLayout.js');
  for (const [width, height] of [
    [320, 568],
    [360, 640],
    [390, 844],
    [568, 320],
    [844, 390],
    [1280, 800],
  ]) {
    for (const count of [1, 2, 3, 5, 6, 7, 8]) {
      const layout = settingsLayout(width, height, count);
      assert.ok(layout.buttonHeight >= 44);
      assert.ok(layout.buttonWidth >= 44);
      assert.ok(layout.cardWidth <= width - 24 && layout.cardHeight <= height - 24);
      assert.ok(layout.detailHeight >= 30, `readable status area at ${width}x${height} / ${count}`);
      assert.ok(
        layout.detailY - layout.detailHeight / 2 >=
          layout.buttons[0].y + layout.buttonHeight / 2 + 8,
      );
      for (const point of layout.buttons) {
        assert.ok(Math.abs(point.x) + layout.buttonWidth / 2 <= layout.cardWidth / 2 - 20);
        assert.ok(Math.abs(point.y) + layout.buttonHeight / 2 <= layout.cardHeight / 2 - 20);
      }
    }
  }
});

test('settings uses image slices, original toolbox artwork and protected native actions', () => {
  const artwork = fs.readFileSync('assets/scripts/presentation/SettingsArtwork.ts', 'utf8');
  const view = fs.readFileSync('assets/scripts/presentation/SettingsPanel.ts', 'utf8');
  const hud = fs.readFileSync('assets/scripts/presentation/TownHUD.ts', 'utf8');
  const bottom = fs.readFileSync('assets/scripts/presentation/BottomActions.ts', 'utf8');
  const bootstrap = fs.readFileSync('assets/scripts/presentation/TownBootstrap.ts', 'utf8');
  assert.match(artwork, /ui\/settings/);
  assert.match(artwork, /Sprite\.Type\.SLICED/);
  assert.doesNotMatch(artwork, /Graphics|roundRect|fillRect/);
  assert.match(hud, /text: '设置',\s*icon: 'tools'/);
  assert.match(hud, /iconOnly: true/);
  assert.match(bottom, /const TABS[^;]+\[\['orders', '订单'\]\]/);
  assert.doesNotMatch(bottom, /\['manage', '经营'\]|\['tools', '工具'\]/);
  assert.match(bootstrap, /consumeTownActions\(\)\) this\.controller\?\.openTownActions\(\)/);
  assert.match(view, /storageWarning && !READ_ONLY_ACTIONS\.has\(action\.id\)/);
  assert.match(view, /KEY_DOWN/);
  assert.match(view, /cancelMultiTouch/);
});

test('interrupted town-affairs requests cannot reopen a stale global panel later', () => {
  const { flow } = fixture();
  flow.start();
  for (const leave of [
    () => flow.settings(),
    () => flow.saves(),
    () => flow.back(),
    () => flow.exit(),
  ]) {
    flow.settings();
    flow.openTownActions();
    leave();
    if (flow.page !== 'game') flow.back();
    assert.equal(flow.consumeTownActions(), false);
  }
});
