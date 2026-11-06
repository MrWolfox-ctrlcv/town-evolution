const test = require('node:test'),
  assert = require('node:assert/strict');
const {
  townSession,
  profileStorage,
  profileLabel,
} = require('../.domain-build/application/TownProfiles');
const { GameStart } = require('../.domain-build/application/GameStart');
const { startMenu } = require('../.domain-build/application/StartMenu');
const { startLayout } = require('../.domain-build/application/StartLayout');
const { SAVE_KEY, GAME_SAVE_KEYS } = require('../.domain-build/domain/storage');
const { createGame, exportSave } = require('../.domain-build/domain/game');
function memory() {
  const data = new Map();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
}
function others(store) {
  return new Map(
    [...store.data].filter(
      ([k]) => !k.startsWith('town-evolution.v5-preview.') && k !== 'town-evolution.active-profile',
    ),
  );
}
test('explicit v5 preview owns independent automatic, backup and manual save namespace', () => {
  const store = memory();
  for (const profile of ['normal', 'demo']) {
    const scoped = profileStorage(store, profile);
    for (const k of GAME_SAVE_KEYS) scoped.setItem(k, exportSave(createGame(0, 17, 4)));
    scoped.setItem('town-evolution.manual.1', 'untouched manual bytes');
  }
  const before = others(store),
    flow = new GameStart(store, () => 0);
  const menu = startMenu(flow, () => {}),
    button = menu.actions.find((a) => a.id === 'v5-preview');
  assert.ok(button);
  button.run();
  assert.equal(flow.profile, 'v5-preview');
  assert.equal(flow.session.state.terrainVersion, 5);
  assert.deepEqual(others(store), before);
  assert.match(profileLabel(flow.profile), /预览/);
  assert.match(flow.session.message, /仍在验证/);
  flow.chooseSlot(1);
  flow.saveSlot();
  assert.deepEqual(others(store), before);
  flow.newGame();
  assert.match(flow.pending.text, /v5 新岛预览/);
  flow.confirm();
  assert.deepEqual(others(store), before);
  assert.equal(townSession(store, 'v5-preview', () => 0).state.terrainVersion, 5);
  assert.equal(townSession(store, 'normal', () => 0).state.terrainVersion, 4);
});
test('malformed preview bytes are preserved, never reset into a fresh v5 island', () => {
  const store = memory(),
    scoped = profileStorage(store, 'v5-preview');
  scoped.setItem(SAVE_KEY, '{broken preview');
  const before = [...store.data],
    flow = new GameStart(store, () => 0);
  assert.equal(flow.start('v5-preview'), false);
  assert.equal(flow.page, 'saves');
  assert.deepEqual([...store.data], before);
});
test('adding the explicit preview does not change normal new-town generation', () => {
  const store = memory();
  assert.equal(townSession(store, 'normal', () => 0).state.terrainVersion, 4);
  assert.equal(profileStorage(store, 'normal'), store);
});
test('seven real title actions fit supported narrow and wide layouts', () => {
  const menu = startMenu(new GameStart(memory(), () => 0), () => {});
  assert.equal(menu.actions.length, 7);
  for (const [w, h] of [
    [360, 640],
    [390, 844],
    [844, 390],
    [1024, 768],
  ]) {
    const layout = startLayout(w, h, menu.actions.length, true);
    assert.equal(layout.buttons.length, 7);
    for (const p of layout.buttons) {
      assert.ok(Math.abs(p.x) + layout.buttonWidth / 2 <= w / 2);
      assert.ok(Math.abs(p.y) + layout.buttonHeight / 2 < h / 2);
    }
  }
});
