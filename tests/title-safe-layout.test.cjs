/** Production geometry/listeners with scene doubles, not a renderer/device test. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startLayout } = require('../.domain-build/application/StartLayout');
const { GameStart } = require('../.domain-build/application/GameStart');
const { startMenu } = require('../.domain-build/application/StartMenu');
const { scene } = require('./helpers/collection-feedback-ui.cjs');
const { Node, UITransform, screen, dependencies, load } = scene;
const cc = dependencies.cc;
let safe;
cc.sys = { isBrowser: false, getSafeAreaRect: () => safe };
cc.input = { on() {}, off() {}, getAllTouches: () => [] };
cc.Input = { EventType: { KEY_DOWN: 'key' } };
cc.KeyCode = { ESCAPE: 27 };
Node.prototype.getSiblingIndex = function () {
  return this.parent.children.indexOf(this);
};
dependencies['./SettingsArtwork'] = {
  SettingsArtwork: class {
    bindButton() {}
    dispose() {}
  },
};
dependencies['./StartArtwork'] = {
  StartArtwork: class {
    layout(width, height) {
      this.size = { width, height };
    }
    dispose() {}
  },
};
function gap(layout) {
  return (
    layout.detailY -
    layout.detailHeight / 2 -
    Math.max(...layout.buttons.map((p) => p.y + layout.buttonHeight / 2))
  );
}
function rect(node) {
  const p = node.worldPosition,
    s = node.getComponent(UITransform);
  return {
    left: p.x - s.width / 2,
    right: p.x + s.width / 2,
    bottom: p.y - s.height / 2,
    top: p.y + s.height / 2,
  };
}
function disjoint(a, b) {
  return a.right <= b.left || b.right <= a.left || a.top <= b.bottom || b.top <= a.bottom;
}
test('inset title rectangles retain all eight targets without overlapping detail', () => {
  for (const [width, height] of [
    [520, 296],
    [480, 299],
    [480, 273],
    [443, 273],
  ]) {
    const l = startLayout(width, height, 8, true);
    assert.ok(gap(l) >= 0, `${width}x${height}`);
    assert.equal(l.buttons.length, 8);
    assert.equal(l.buttonHeight, 52);
    assert.ok(l.buttonWidth >= 88);
    assert.equal(new Set(l.buttons.map((p) => p.x)).size, 4);
  }
});
test('column switch occurs only on collision and respects the width floor', () => {
  assert.equal(new Set(startLayout(480, 314, 8, true).buttons.map((p) => p.x)).size, 3);
  assert.equal(new Set(startLayout(480, 313, 8, true).buttons.map((p) => p.x)).size, 4);
  assert.equal(new Set(startLayout(442, 273, 8, true).buttons.map((p) => p.x)).size, 3);
  assert.equal(new Set(startLayout(443, 273, 8, true).buttons.map((p) => p.x)).size, 4);
  for (const [w, h, cols] of [
    [568, 320, 3],
    [390, 844, 1],
    [390, 650, 2],
    [320, 568, 2],
    [1280, 720, 1],
  ]) {
    const l = startLayout(w, h, 8, true);
    assert.equal(new Set(l.buttons.map((p) => p.x)).size, cols);
    assert.equal(l.buttonHeight, 44);
    assert.ok(gap(l) >= 0);
  }
  assert.equal(startLayout(520, 296, 8, false).buttonHeight, 44);
});
for (const area of [
  { x: 24, y: 24, width: 520, height: 296 },
  { x: 44, y: 21, width: 480, height: 299 },
])
  test(`production title nodes, text and repeated relayout in ${area.width}x${area.height}`, () => {
    screen.windowSize = { width: 568, height: 320 };
    screen.devicePixelRatio = 1;
    safe = area;
    const flow = new GameStart({ getItem: () => null, setItem() {}, removeItem() {} }, () => 60000);
    const menu = new (load('StartScreen').StartScreen)(new Node('Root'), flow, () => {});
    const expected = startMenu(flow, () => {}).actions;
    for (let repeat = 0; repeat < 2; repeat++) {
      menu.render();
      menu.canvas.setPosition(284, 160);
      assert.deepEqual(menu.canvas.getComponent(UITransform).contentSize, {
        width: 568,
        height: 320,
      });
      assert.deepEqual(menu.artwork.size, { width: 568, height: 320 });
      assert.equal(menu.buttons.length, 9);
      const seen = new Set();
      for (const offset of [0, menu.titleLayout.scrollMax]) {
        menu.titleScroll = offset;
        menu.layoutTitleButtons();
        const buttons = menu.buttons.filter((b) => b.node.activeInHierarchy);
        assert.ok(buttons.length >= 4);
        const textNodes = [menu.heading, menu.subtitle, menu.detail, menu.footer].map(
          (t) => t.node,
        );
        for (const b of buttons) {
          const i = menu.buttons.indexOf(b);
          seen.add(b.node.name);
          assert.equal(b.node.name, `Menu-${expected[i].id}`);
          assert.equal(b.title.string, expected[i].text);
          assert.equal(b.title.fontSize, i === 0 ? 19 : 16);
          const size = b.node.getComponent(UITransform),
            label = b.title.node.getComponent(UITransform);
          assert.ok(size.height >= 44 && size.width >= 88);
          assert.ok(label.height >= 2 * b.title.lineHeight);
          const r = rect(b.node);
          assert.ok(
            r.left >= area.x &&
              r.right <= area.x + area.width &&
              r.bottom >= area.y &&
              r.top <= area.y + area.height,
          );
          for (const t of textNodes)
            assert.ok(disjoint(r, rect(t)), `${b.node.name} overlaps title text`);
          for (const other of buttons.slice(buttons.indexOf(b) + 1))
            assert.ok(disjoint(r, rect(other.node)));
          // Production handlers still dispatch each visible action exactly once.
          let calls = 0;
          const action = b.action;
          b.action = { ...action, run: () => calls++ };
          const event = {
            getID: () => 1,
            getAllTouches: () => [{}],
            getUILocation: () => b.node.worldPosition,
          };
          b.node.emit('start', event);
          b.node.emit('end', event);
          assert.equal(calls, 1);
          b.action = action;
        }
        // Longer recovery label also fits two full-size lines in the smallest cell.
      }
      assert.equal(seen.size, 9, 'every action reachable through bounded scroll');
      const first = menu.buttons[0];
      assert.ok(
        Math.floor(first.title.node.getComponent(UITransform).width / 19) * 2 >=
          '检查与恢复存档'.length,
      );
    }
    menu.dispose();
  });
test('nine-action title scroll clamps, cancels drag taps and keeps clipped targets inactive', () => {
  screen.windowSize = { width: 568, height: 320 };
  screen.devicePixelRatio = 1;
  safe = { x: 24, y: 24, width: 520, height: 296 };
  const flow = new GameStart({ getItem: () => null, setItem() {}, removeItem() {} }, () => 60000);
  const menu = new (load('StartScreen').StartScreen)(new Node('Root'), flow, () => {});
  menu.render();
  menu.canvas.setPosition(284, 160);
  const layout = menu.titleLayout;
  assert.ok(layout.scrollMax > 0);
  const button = menu.buttons[0],
    p = button.node.worldPosition;
  let calls = 0;
  button.action = { ...button.action, run: () => calls++ };
  const event = (dy = 0, multi = false) => ({
    getID: () => 1,
    getAllTouches: () => (multi ? [{}, {}] : [{}]),
    getUILocation: () => ({ x: p.x, y: p.y + dy }),
  });
  menu.beginScroll(event());
  button.node.emit('start', event());
  menu.moveScroll(event(1000));
  menu.endScroll(event(1000));
  button.node.emit('end', event(1000));
  assert.equal(calls, 0);
  assert.equal(menu.titleScroll, layout.scrollMax);
  assert.equal(button.node.active, false);
  assert.equal(menu.buttons.at(-1).node.active, true);
  menu.wheelScroll({ getScrollY: () => 10000 });
  assert.equal(menu.titleScroll, 0);
  menu.wheelScroll({ getScrollY: () => -10000 });
  assert.equal(menu.titleScroll, layout.scrollMax);
  menu.wheelScroll({ getScrollY: () => 10000 });
  menu.beginScroll(event());
  button.node.emit('start', event());
  menu.cancelMultiTouch(event(0, true));
  button.node.emit('end', event());
  assert.equal(calls, 0);
  assert.equal(menu.scrollTouch, null);
  menu.beginScroll(event());
  button.node.emit('start', event());
  menu.moveScroll(event(2));
  menu.endScroll(event(2));
  button.node.emit('end', event(2));
  assert.equal(calls, 1);
  menu.handbook = { regions: () => [{}], cancelGesture() {}, dispose() {} };
  menu.beginScroll(event());
  assert.equal(menu.scrollTouch, null, 'handbook owns its open gestures');
  menu.wheelScroll({ getScrollY: () => -10000 });
  assert.equal(menu.titleScroll, 0);
  menu.hide();
  assert.equal(menu.scrollTouch, null);
  menu.dispose();
});
test('new nine-target layouts remain accessible at every tested phone size without overlapping text', () => {
  for (const [w, h] of [
    [520, 296],
    [480, 299],
    [480, 273],
    [443, 273],
    [320, 568],
    [390, 650],
    [390, 844],
    [1280, 720],
  ]) {
    const l = startLayout(w, h, 9, true),
      seen = new Set();
    for (const offset of [0, l.scrollMax])
      for (const [i, p] of l.buttons.entries()) {
        const y = p.y + offset;
        if (
          l.scrollMax &&
          (y - l.buttonHeight / 2 < l.viewportBottom - 1e-7 ||
            y + l.buttonHeight / 2 > l.viewportTop + 1e-7)
        )
          continue;
        seen.add(i);
        assert.ok(y + l.buttonHeight / 2 <= l.detailY - l.detailHeight / 2 + 1e-7);
        assert.ok(y - l.buttonHeight / 2 >= -h / 2 + 38);
        assert.ok(l.buttonHeight >= 44 && l.buttonWidth >= 88);
      }
    assert.equal(seen.size, 9, `${w}x${h}`);
  }
});
