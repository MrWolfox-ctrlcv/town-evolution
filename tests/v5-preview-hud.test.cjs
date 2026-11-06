/** Real controller/HUD sources with CPU scene adapters, not browser or phone evidence. */
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const { load } = require('./helpers/farm-picking-ui.cjs');
const { actions } = load('HudActions'),
  { description } = load('HudDescription'),
  { createUiState } = load('UiContracts');
const g = require('../.domain-build/domain/game');
const file = path.resolve('tests/demo-village-ui.test.cjs'),
  source = fs.readFileSync(file, 'utf8');
const fixture = new Function(
  'require',
  source.slice(0, source.indexOf('for (const [width, height]')) + '\nreturn fixture;',
)(createRequire(file));
const state = g.createGame(100000, 42173, 5);
for (const [width, height] of [
  [390, 844],
  [1280, 720],
])
  test(`v5 preview enters an explicitly labelled overview and reset stays scoped at ${width}x${height}`, () => {
    const f = fixture(width, height, 'v5-preview', state),
      c = f.controller;
    assert.equal(c.map.zoom, 1);
    assert.equal(c.map.focus.x, 96);
    assert.equal(c.map.focus.z, 96);
    assert.match(c.hud.data.summary, /v5 新岛预览/);
    assert.doesNotMatch(c.hud.data.summary, /我的小镇/);
    assert.deepEqual([...f.values], f.saved, 'Framing does not rewrite game progress');
    c.reset();
    assert.equal(c.ui.resetArmed, true);
    assert.match(c.hud.data.detail, /仅重置 v5 预览岛/);
    c.cancel();
    assert.equal(c.ui.resetArmed, false);
    assert.deepEqual([...f.values], f.saved, 'Cancelling reset does not touch saved bytes');
  });
test('preview reset and switch buttons name only their actual target; old normal/demo labels stay unchanged', () => {
  const handlers = { reset() {}, switchTown() {}, cancel() {} },
    session = {
      state,
      mode: 'normal',
      reason() {
        return null;
      },
    };
  const ui = createUiState();
  ui.profile = 'v5-preview';
  ui.resetArmed = true;
  assert.equal(actions(session, ui, handlers)[0].text, '确认重置 v5 预览岛');
  assert.match(description(session, ui), /正常小镇和演示岛不受影响/);
  for (const [profile, text] of [
    ['normal', '确认重置进度'],
    ['demo', '确认重置演示岛'],
  ]) {
    ui.profile = profile;
    assert.equal(actions(session, ui, handlers)[0].text, text);
  }
  ui.profile = 'v5-preview';
  ui.resetArmed = false;
  ui.tab = 'tools';
  const list = actions(session, ui, handlers);
  assert.ok(list.some((a) => a.text === '进入正常小镇'));
  assert.ok(!list.some((a) => a.text === '进入演示岛'));
  assert.ok(list.some((a) => a.text === '重置 v5 预览岛…'));
});

test('v5 preview identifies actual pending detail loading without replacing selection or reset guidance', () => {
  const session = { state },
    ui = createUiState();
  ui.profile = 'v5-preview';
  assert.match(description(session, ui, true), /地形与树木细节加载中/);
  assert.doesNotMatch(description(session, ui, false), /加载中/);
  ui.profile = 'normal';
  assert.doesNotMatch(description(session, ui, true), /加载中/);
  ui.profile = 'v5-preview';
  ui.resetArmed = true;
  assert.match(description(session, ui, true), /仅重置 v5 预览岛/);
});

test('bridge demonstration controller frames actual endpoints and retains its own label, reset and loading guidance', () => {
  const bridgeState = g.createBridgeDemo(100000);
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [1280, 720],
  ]) {
    const f = fixture(width, height, 'v5-bridge-demo', bridgeState),
      c = f.controller;
    assert.equal(c.map.focus.x, 140.5);
    assert.equal(c.map.focus.z, 136);
    assert.ok(c.map.zoom > 0.1 && c.map.zoom < 0.2);
    assert.match(c.hud.data.summary, /木桥演示/);
    assert.doesNotMatch(c.hud.data.summary, /我的小镇|v5 新岛预览/);
    assert.deepEqual([...f.values], f.saved);
    c.reset();
    assert.match(c.hud.data.detail, /只重置木桥演示/);
    c.cancel();
    assert.deepEqual([...f.values], f.saved);
  }
  const ui = createUiState();
  ui.profile = 'v5-bridge-demo';
  ui.resetArmed = true;
  assert.equal(
    actions({ state: bridgeState, mode: 'normal', reason: () => null }, ui, {
      reset() {},
      switchTown() {},
      cancel() {},
    })[0].text,
    '确认重置木桥演示',
  );
  ui.resetArmed = false;
  assert.match(description({ state: bridgeState }, ui, true), /加载中/);
});
