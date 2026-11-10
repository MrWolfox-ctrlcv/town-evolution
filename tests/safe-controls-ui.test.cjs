/** Production UI constructors/layout/input listeners with narrow scene/art doubles.
 * Coordinates follow Cocos Canvas centering; this is not a renderer or device test. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { scene } = require('./helpers/collection-feedback-ui.cjs');
const { Node, UITransform, screen, dependencies, load } = scene;
const { GameStart } = require('../.domain-build/application/GameStart');
const { hudLayout } = require('../.domain-build/application/HudLayout');
let safe, design;
const cc = dependencies.cc;
cc.sys = {
  isBrowser: false,
  getSafeAreaRect(symmetric) {
    assert.equal(symmetric, false);
    assert.deepEqual(
      design,
      {
        width: screen.windowSize.width / screen.devicePixelRatio,
        height: screen.windowSize.height / screen.devicePixelRatio,
      },
      'Safe area must be sampled after the full design resolution is set',
    );
    return safe;
  },
};
Object.assign(cc.view, {
  setDesignResolutionSize: (width, height) => {
    design = { width, height };
  },
  getScaleX: () => screen.devicePixelRatio,
  getScaleY: () => screen.devicePixelRatio,
});
cc.input = { on() {}, off() {}, getAllTouches: () => [] };
cc.Input = { EventType: { KEY_DOWN: 'key' } };
cc.KeyCode = { ESCAPE: 27 };
// UITransform.hitTest accepts physical screen points, unlike layout bounds.
UITransform.prototype.hitTest = function (point) {
  const viewport = cc.view.getViewportRect(),
    center = this.node.worldPosition;
  return (
    Math.abs((point.x - viewport.x) / cc.view.getScaleX() - center.x) <= this.width / 2 &&
    Math.abs((point.y - viewport.y) / cc.view.getScaleY() - center.y) <= this.height / 2
  );
};
// Preserve real listener identities for the new lifetime assertion.
Node.prototype.off = function (type, fn, owner, capture = false) {
  this.events.set(
    type,
    (this.events.get(type) ?? []).filter(
      (l) => l.fn !== fn || l.owner !== owner || l.capture !== capture,
    ),
  );
};
Node.prototype.getSiblingIndex = function () {
  return this.parent.children.indexOf(this);
};
class SettingsArt {
  bind(node, _kind, width, height) {
    node.getComponent(UITransform).setContentSize(width, height);
  }
  bindButton(node, width, height) {
    node.getComponent(UITransform).setContentSize(width, height);
  }
  dispose() {}
}
dependencies['./SettingsArtwork'] = { SettingsArtwork: SettingsArt };
dependencies['./StartArtwork'] = {
  StartArtwork: class {
    layout(width, height) {
      this.size = { width, height };
    }
    dispose() {}
  },
};
function configure(width, height, area, dpr = 1) {
  safe = area;
  screen.devicePixelRatio = dpr;
  screen.windowSize = { width: width * dpr, height: height * dpr };
}
function bounds(node) {
  const size = node.getComponent(UITransform),
    p = node.worldPosition;
  return {
    left: p.x - size.width / 2,
    right: p.x + size.width / 2,
    bottom: p.y - size.height / 2,
    top: p.y + size.height / 2,
  };
}
function inside(node, area) {
  const b = bounds(node);
  assert.ok(
    b.left >= area.x - 1e-8 &&
      b.right <= area.x + area.width + 1e-8 &&
      b.bottom >= area.y - 1e-8 &&
      b.top <= area.y + area.height + 1e-8,
    `${node.name} ${JSON.stringify(b)} outside ${JSON.stringify(area)}`,
  );
}
function center(canvas, width, height) {
  canvas.setPosition(width / 2, height / 2);
}
function touch(id, x, y, contacts = 1) {
  return {
    getID: () => id,
    getUILocation: () => ({ x, y }),
    getLocation: () => ({ x, y }),
    getAllTouches: () => Array.from({ length: contacts }, (_, n) => ({ getID: () => n + 1 })),
  };
}
const cases = [
  {
    name: 'portrait notch at DPR 3',
    width: 390,
    height: 844,
    dpr: 3,
    area: { x: 0, y: 34, width: 390, height: 751 },
  },
  {
    name: 'landscape unequal notches',
    width: 844,
    height: 390,
    dpr: 2,
    area: { x: 59, y: 21, width: 741, height: 369 },
  },
  {
    name: 'desktop zero inset',
    width: 1200,
    height: 800,
    dpr: 1,
    area: { x: 0, y: 0, width: 1200, height: 800 },
  },
];
for (const c of cases)
  test(`HUD insets controls but retains full map: ${c.name}`, () => {
    configure(c.width, c.height, c.area, c.dpr);
    const hud = new (load('TownHUD').TownHUD)(
      new Node('Root'),
      () => {},
      () => {},
      () => {},
    );
    hud.setTerrainNavigation({ home() {}, overview() {}, zoom() {} });
    const layout = hud.layout();
    center(hud.canvas, c.width, c.height);
    assert.deepEqual(hud.canvas.getComponent(UITransform).contentSize, {
      width: c.width,
      height: c.height,
    });
    assert.deepEqual(hud.mapInput.getComponent(UITransform).contentSize, {
      width: c.width,
      height: c.height,
    });
    assert.equal(layout.width, c.width);
    assert.equal(layout.height, c.height);
    assert.equal(hud.mapInput.parent, hud.canvas);
    assert.equal(hud.flights.canvas, hud.canvas);
    assert.equal(hud.tools.inputRoot, hud.canvas);
    assert.deepEqual(bounds(hud.controls.root), {
      left: c.area.x,
      right: c.area.x + c.area.width,
      bottom: c.area.y,
      top: c.area.y + c.area.height,
    });
    inside(hud.settings.node, c.area);
    for (const button of hud.terrainNavigation.buttons) inside(button.node, c.area);
    const destination = hud.tools.destination('vegetable');
    const target = hud.flights.target('vegetable', new Map());
    assert.equal(target.point.x, destination.worldPosition.x - c.width / 2);
    assert.equal(target.point.y, destination.worldPosition.y - c.height / 2);
    assert.equal(hud.top.parent, hud.controls.root);
    assert.deepEqual(hud.tools.origin, c.area);
    const p = { x: c.area.x + c.area.width / 2, y: c.area.y + c.area.height / 2 };
    assert.equal(hud.controls.contains({ x: p.x * c.dpr, y: p.y * c.dpr }), true);
    if (c.area.y)
      assert.equal(hud.coversMapPoint({ x: p.x * c.dpr, y: (c.area.y - 1) * c.dpr }), true);
    hud.dispose();
  });
test('old portrait settings hitbox demonstrably occupied notch area; inset layout fixes it', () => {
  const c = cases[0],
    previous = hudLayout(c.width, c.height);
  assert.equal(previous.settingsY + c.height / 2 + previous.settingsHeight / 2, 838);
  assert.equal(c.area.y + c.area.height, 785);
  assert.equal(838 - 785, 53);
});
test('HUD relayout rotates the safe frame and hides controls when no safe area remains', () => {
  const a = cases[0],
    b = cases[1];
  configure(a.width, a.height, a.area);
  const hud = new (load('TownHUD').TownHUD)(
    new Node('Root'),
    () => {},
    () => {},
    () => {},
  );
  hud.layout();
  configure(b.width, b.height, b.area);
  hud.layout();
  center(hud.canvas, b.width, b.height);
  inside(hud.settings.node, b.area);
  configure(b.width, b.height, { x: 0, y: 0, width: 0, height: 0 });
  hud.layout();
  assert.equal(hud.controls.root.active, false);
  assert.equal(hud.settings.node.activeInHierarchy, false);
  assert.equal(hud.coversMapPoint({ x: 100, y: 100 }), true);
  assert.equal(hud.mapInput.activeInHierarchy, true);
  hud.dispose();
});
for (const c of cases)
  test(`title/settings remain in safe frame, artwork full-size: ${c.name}`, () => {
    configure(c.width, c.height, c.area, c.dpr);
    const flow = new GameStart({ getItem: () => null, setItem() {}, removeItem() {} }, () => 60000);
    const menu = new (load('StartScreen').StartScreen)(new Node('Root'), flow, () => {});
    menu.render();
    center(menu.canvas, c.width, c.height);
    assert.deepEqual(menu.artwork.size, { width: c.width, height: c.height });
    for (const button of menu.buttons.filter((b) => b.node.activeInHierarchy))
      inside(button.node, c.area);
    assert.equal(flow.start('normal'), true);
    flow.settings();
    assert.equal(flow.page, 'settings');
    menu.render();
    assert.equal(menu.imageMenu.root.parent, menu.controls.root);
    assert.equal(menu.imageMenu.root.activeInHierarchy, true);
    assert.ok(menu.imageMenu.buttons.length > 0);
    inside(menu.imageMenu.close.node, c.area);
    for (const button of menu.imageMenu.buttons.filter((b) => b.node.activeInHierarchy))
      inside(button.node, c.area);
    menu.dispose();
  });
test('second finger in excluded margin cancels title and settings buttons, listener is released', () => {
  const c = cases[0];
  configure(c.width, c.height, c.area);
  const flow = new GameStart({ getItem: () => null, setItem() {}, removeItem() {} }, () => 60000);
  const menu = new (load('StartScreen').StartScreen)(new Node('Root'), flow, () => {});
  menu.render();
  center(menu.canvas, c.width, c.height);
  let actions = 0;
  function interrupted(button) {
    button.set({ text: 'test', run: () => actions++ });
    const p = button.node.worldPosition,
      first = touch(1, p.x, p.y);
    menu.canvas.emit('start', first, true);
    button.node.emit('start', first);
    // Canvas capture observes a touch outside the inset menu; panel capture does not.
    menu.canvas.emit('start', touch(2, 200, 10, 2), true);
    button.node.emit('end', first);
    assert.equal(actions, 0);
    button.node.emit('start', first);
    button.node.emit('end', first);
    assert.equal(actions, 1);
    actions = 0;
  }
  interrupted(menu.buttons[0]);
  assert.equal(flow.start('normal'), true);
  flow.settings();
  assert.equal(flow.page, 'settings');
  menu.render();
  interrupted(menu.imageMenu.buttons[0]);
  assert.ok(menu.canvas.events.get('start').some((l) => l.capture && l.owner === menu));
  menu.dispose();
  assert.equal(
    menu.canvas.events.get('start').some((l) => l.capture && l.owner === menu),
    false,
  );
});
test('web preview opts into safe-area env, without constraining the full canvas', () => {
  const html = fs.readFileSync('scripts/preview/index.html', 'utf8');
  assert.match(html, /viewport-fit=cover/);
  for (const edge of ['top', 'right', 'bottom', 'left'])
    assert.ok(html.includes(`env(safe-area-inset-${edge}, 0px)`));
  assert.doesNotMatch(html, /canvas\s*\{[^}]*padding/);
});
