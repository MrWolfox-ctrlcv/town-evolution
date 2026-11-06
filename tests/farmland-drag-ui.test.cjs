/** Isolated presentation command routing, not a browser/Cocos rendering claim. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const game = require('../.domain-build/domain/game');
class Node {
  constructor(name) {
    this.name = name;
    this.children = [];
  }
  setPosition(x, y, z) {
    this.position = typeof x === 'object' ? x : { x, y, z };
  }
  addChild(node) {
    this.children.push(node);
  }
  destroy() {
    this.destroyed = true;
  }
}
class ModelFactory {
  building() {
    return new Node('Ghost');
  }
  shape(parent, name, x, y, z, sx, sy, sz, color) {
    const node = new Node(name);
    node.setPosition(x, y, z);
    node.size = { sx, sy, sz };
    node.color = color;
    parent.addChild(node);
    return node;
  }
  dispose() {}
}
function load() {
  const text = ts.transpileModule(
    fs.readFileSync('assets/scripts/presentation/BuildingDrag.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', text)(
    (id) => {
      if (id === '../domain/game') return game;
      if (id.startsWith('../application/')) return require('../.domain-build/' + id.slice(3));
      if (id === './UiContracts') return require('./helpers/selection-ui.cjs').load('UiContracts');
      if (id === '../domain/world') return require('../.domain-build/domain/world');
      if (id === 'cc')
        return {
          Node,
          Vec3: class {
            constructor(x, y, z) {
              Object.assign(this, { x, y, z });
            }
          },
        };
      if (id === './ModelFactory') return { ModelFactory };
      if (id === './TerrainInteraction')
        return require('./helpers/selection-ui.cjs').load('TerrainInteraction');
      if (id === './BuildingOutline')
        return require('./helpers/farm-picking-ui.cjs').load('BuildingOutline', { cc: { Node } });
      throw new Error(`Unexpected dependency ${id}`);
    },
    module,
    module.exports,
  );
  return module.exports.BuildingDrag;
}
function fixture() {
  const state = game.createGame(0, 1, 1);
  state.trees = [];
  state.naturalResources = [];
  state.groundStacks = [];
  let base;
  for (let z = 0; z < 36 && !base; z++)
    for (let x = 0; x < 36 && !base; x++)
      if (
        Array.from({ length: 16 }, (_, i) =>
          game.isLandCell(x + (i % 4), z + Math.floor(i / 4), 1, 1),
        ).every(Boolean)
      )
        base = { x, z };
  const farms = [
    [0, 0],
    [2, 0],
    [0, 2],
  ].map(([x, z], i) => ({
    id: `b${i + 1}`,
    kind: 'farm',
    x: base.x + x,
    z: base.z + z,
    rotation: 0,
    cropJobs: Array(9).fill(null),
  }));
  state.buildings = farms;
  state.inventory = Object.fromEntries(game.ITEM_KEYS.map((k) => [k, 0]));
  state.nextId = 4;
  const session = {
    state,
    mode: 'normal',
    message: '',
    reason(c) {
      const r = game.dispatch(this.state, c, 0);
      return r.ok ? null : r.error;
    },
    run(c) {
      const r = game.dispatch(this.state, c, 0);
      if (r.ok) this.state = r.state;
      else this.message = r.error;
      return r.ok;
    },
  };
  const parent = new Node('World'),
    ui = {},
    town = {
      pickBuilding: (ray, exclude) => (exclude ? 'b1' : 'b2'),
      pickTree: () => null,
      pickNatural: () => null,
      setLifted(id) {
        this.lifted = id;
      },
    };
  const Drag = load(),
    drag = new Drag(parent, session, ui, town, () => {});
  const ray = { o: { x: base.x + 1, y: 5, z: base.z + 1 }, d: { x: 0, y: -1, z: 0 } };
  return { state, session, parent, ui, town, drag, ray, base };
}
test('dragging a small field over another previews the whole large field without changing state', () => {
  const f = fixture(),
    before = JSON.stringify(f.state);
  f.drag.move('b2', { x: f.base.x + 1, z: f.base.z + 1 }, f.ray);
  assert.equal(JSON.stringify(f.session.state), before);
  assert.equal(f.session.message, '松手合成');
  const ring = f.parent.children.find((n) => n.name === 'BuildingDropTarget');
  assert.deepEqual(ring.position, { x: f.base.x + 2, y: 0, z: f.base.z + 2 });
  assert.ok(
    ring.children.every((edge) => edge.position.y === 0.12),
    'Outline keeps its actual world height after extraction',
  );
  assert.ok(ring.children.some((n) => n.size.sx === 4.1));
  assert.equal(f.town.lifted, 'b2');
  f.drag.clear();
  assert.equal(JSON.stringify(f.session.state), before);
  assert.equal(f.town.lifted, null);
});
test('release merges exactly once and selects the retained target field', () => {
  const f = fixture();
  f.drag.move('b2', { x: f.base.x + 1, z: f.base.z + 1 }, f.ray);
  f.drag.drop('b2', f.ray);
  assert.equal(f.session.state.buildings.length, 1);
  assert.equal(f.session.state.buildings[0].farmSize, 6);
  assert.equal(f.ui.selected, 'b1');
  assert.equal(f.town.lifted, null);
  const before = JSON.stringify(f.session.state);
  f.drag.drop('b2', f.ray);
  assert.equal(JSON.stringify(f.session.state), before);
});
test('a blocked reward quadrant stays red and a cancelled or rejected drop preserves three fields', () => {
  const f = fixture();
  f.state.trees = [{ id: 't1', x: f.base.x + 2, z: f.base.z + 2 }];
  const before = JSON.stringify(f.state);
  f.drag.move('b2', { x: f.base.x + 1, z: f.base.z + 1 }, f.ray);
  assert.ok(
    f.parent.children
      .find((n) => n.name === 'BuildingDropTarget')
      .children.every((n) => n.color === '#D87163'),
  );
  f.drag.drop('b2', f.ray);
  assert.equal(JSON.stringify(f.session.state), before);
  f.drag.drop('b2', null);
  assert.equal(JSON.stringify(f.session.state), before);
});

test('a lifted building follows the pointer over covered UI and drops the old merge preview', () => {
  const f = fixture();
  f.drag.move('b2', { x: f.base.x + 1, z: f.base.z + 1 }, f.ray);
  const ghost = f.parent.children.find((n) => n.name === 'BuildingLift');
  const ring = f.parent.children.find((n) => n.name === 'BuildingDropTarget');
  const before = game.exportSave(f.session.state);
  const outside = { x: f.base.x - 7, z: f.base.z - 4 };
  f.drag.move('b2', outside, null);
  assert.deepEqual(ghost.position, { ...outside, y: 0.45 });
  assert.equal(ring.destroyed, true, 'A formerly valid merge marker cannot survive covered UI');
  assert.equal(f.session.message, '位置不可用');
  assert.equal(
    f.town.lifted,
    'b2',
    'Keep the building held until release or explicit cancellation',
  );
  f.drag.move('b2', { x: outside.x - 1, z: outside.z - 1 }, null);
  assert.deepEqual(ghost.position, { x: outside.x - 1, y: 0.45, z: outside.z - 1 });
  assert.equal(game.exportSave(f.session.state), before);
  f.drag.drop('b2', null);
  assert.equal(game.exportSave(f.session.state), before);
  assert.equal(ghost.destroyed, true);
  assert.equal(f.town.lifted, null);
  assert.equal(f.session.message, '已取消');
  // An old release delivered after cancellation must not commit the prior merge.
  f.drag.drop('b2', f.ray);
  assert.equal(game.exportSave(f.session.state), before);
});

test('reentering the map after crossing covered UI restores a valid preview and commits once', () => {
  const f = fixture();
  const point = { x: f.base.x + 1, z: f.base.z + 1 };
  f.drag.move('b2', point, f.ray);
  f.drag.move('b2', { x: -8, z: -4 }, null);
  f.drag.move('b2', point, f.ray);
  const markers = f.parent.children.filter((n) => n.name === 'BuildingDropTarget');
  assert.equal(markers.length, 2);
  assert.equal(markers[0].destroyed, true);
  assert.equal(markers[1].destroyed, undefined);
  assert.equal(f.session.message, '松手合成');
  f.drag.drop('b2', f.ray);
  assert.equal(f.session.state.buildings.length, 1);
  assert.equal(f.session.state.buildings[0].farmSize, 6);
  assert.deepEqual(game.importSave(game.exportSave(f.session.state), 0), f.session.state);
});

test('cancelled, foreign and repeated releases cannot mutate state or dismiss a newer lift', () => {
  const f = fixture();
  const before = game.exportSave(f.session.state);
  const point = { x: f.base.x + 1, z: f.base.z + 1 };
  f.drag.move('b2', point, f.ray);
  f.drag.clear();
  f.drag.drop('b2', f.ray);
  assert.equal(game.exportSave(f.session.state), before, 'Cancelled drag cannot merge later');
  f.drag.move('b3', point, f.ray);
  f.drag.drop('b2', f.ray);
  assert.equal(game.exportSave(f.session.state), before, 'Foreign object cannot consume the lift');
  assert.equal(f.town.lifted, 'b3');
  f.drag.drop('b3', f.ray);
  assert.equal(f.session.state.buildings.length, 1);
  assert.equal(f.town.lifted, null);
  const merged = game.exportSave(f.session.state);
  f.drag.drop('b3', f.ray);
  assert.equal(game.exportSave(f.session.state), merged);
});

test('object drag routes covered-screen motion to both building and stack lifecycles', () => {
  const text = ts.transpileModule(
    fs.readFileSync('assets/scripts/presentation/ObjectDrag.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', text)(
    (id) => {
      if (id === './BuildingDrag') return { BuildingDrag: class {} };
      if (id === './StackDrag') return { StackDrag: class {} };
      if (id === './DropDrag') return { DropDrag: class {} };
      throw new Error(`Unexpected dependency ${id}`);
    },
    module,
    module.exports,
  );
  const calls = [];
  const objects = Object.create(module.exports.ObjectDrag.prototype);
  objects.buildings = { move: (...args) => calls.push(['building', ...args]) };
  objects.stacks = { move: (...args) => calls.push(['pile', ...args]) };
  objects.drops = { move: (...args) => calls.push(['drop', ...args]) };
  const world = { x: 4, y: 0, z: 7 },
    screen = { x: 2, y: 20 };
  objects.move('b2', world, null, screen);
  objects.move('pile:3:4', world, null, screen);
  objects.move('drop:d5', world, null, screen);
  assert.deepEqual(calls, [
    ['building', 'b2', world, null],
    ['pile', 'pile:3:4', world, null, screen],
    ['drop', 'drop:d5', world, null, screen],
  ]);
});

function uiModule(name, dependencies, browser) {
  const source = ts.transpileModule(
    fs.readFileSync(`assets/scripts/presentation/${name}.ts`, 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        experimentalDecorators: true,
      },
    },
  ).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'window', 'navigator', source)(
    (id) => {
      if (id in dependencies) return dependencies[id];
      if (
        [
          './CameraVisibility',
          './V6TownNavigation',
          './TownStreamingFrame',
          './TownUiActions',
        ].includes(id)
      )
        return uiModule(id.slice(2), dependencies, browser);
      if (id === '../domain/game') return game;
      if (id === '../domain/world') return require('../.domain-build/domain/world');
      if (id.startsWith('../application/')) return require(`../.domain-build/${id.slice(3)}`);
      throw new Error(`Unexpected dependency ${id}`);
    },
    module,
    module.exports,
    browser,
    undefined,
  );
  return module.exports;
}
function eventWindow() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, callback, capture) {
      assert.equal(capture, true, 'Cancel before the canvas Cocos listener sees the event');
      const handlers = listeners.get(type) ?? new Set();
      handlers.add(callback);
      listeners.set(type, handlers);
    },
    removeEventListener(type, callback, capture) {
      assert.equal(capture, true);
      listeners.get(type)?.delete(callback);
    },
    emit(type, event = {}) {
      for (const callback of listeners.get(type) ?? []) callback({ target: this, ...event });
    },
  };
}
/** Real bootstrap -> controller -> camera -> gesture -> BuildingDrag cancellation path. */
function focusFixture(...browserArgs) {
  const browser = browserArgs.length ? browserArgs[0] : eventWindow();
  const f = fixture();
  let now = 0,
    taps = 0;
  const point = { x: f.base.x + 1, y: f.base.z + 1 };
  const { MapGesture } = require('../.domain-build/application/MapGesture');
  const gesture = new MapGesture(
    {
      candidate: () => 'b2',
      tap: () => taps++,
      drag: (id) => f.drag.move(id, { x: point.x, z: point.y }, f.ray),
      drop: (id) => f.drag.drop(id, f.ray),
      cancel: () => f.drag.clear(),
      pan() {},
      pinch() {},
    },
    () => now,
  );
  const provenance = uiModule('InputProvenance', {}, browser);
  const sourceEvents = [];
  const touchEmitter = {
    emit(type, event) {
      sourceEvents.push({ type, touch: provenance.isTouchEvent(event) });
    },
  };
  const mouseEmitter = {
    emit(type, event) {
      sourceEvents.push({ type, touch: provenance.isTouchEvent(event) });
    },
  };
  const originalTouchEmit = touchEmitter.emit,
    originalMouseEmit = mouseEmitter.emit;
  const engineInput = {
    _touchInput: { _eventTarget: touchEmitter },
    _mouseInput: { _eventTarget: mouseEmitter },
    getAllTouches: () => [],
  };
  const { MapCamera } = uiModule(
    'MapCamera',
    {
      cc: { input: engineInput },
      './Palette': {},
      './SceneLighting': {},
      './TouchPicking': {},
      './InputProvenance': provenance,
    },
    browser,
  );
  const map = Object.create(MapCamera.prototype);
  map.contacts = new Set([0]);
  map.owners = new Map([[0, 'mouse:0']]);
  map.contactTouches = new Map([[0, { getID: () => 0 }]]);
  map.gesture = gesture;
  const { TownController } = uiModule(
    'TownController',
    Object.fromEntries(
      [
        'cc',
        './CollectionBinding',
        './TownView',
        './TownHUD',
        './ToolRouter',
        './HudDescription',
        './ObjectDrag',
        './ObjectContext',
        './MapCamera',
        './HudActions',
        './RouteActions',
        './UiContracts',
      ].map((name) => [name, {}]),
    ),
    browser,
  );
  const cancellations = { tray: 0, tool: 0, hud: 0, menu: 0, disposed: 0 };
  const controller = Object.create(TownController.prototype);
  Object.assign(controller, {
    hud: {
      cancelTools: () => cancellations.tray++,
      cancelGestures: () => cancellations.hud++,
    },
    tools: { cancel: () => cancellations.tool++ },
    map,
    dispose: () => cancellations.disposed++,
  });
  const hooks = new Map();
  const events = {
    on: (event, callback, context) => hooks.set(event, () => callback.call(context)),
    off: (event) => hooks.delete(event),
  };
  const guard = uiModule('BrowserInputGuard', {}, browser);
  const { TownBootstrap } = uiModule(
    'TownBootstrap',
    {
      cc: {
        _decorator: { ccclass: () => (value) => value },
        Component: class {},
        screen: events,
        game: events,
        Game: { EVENT_HIDE: 'hide', EVENT_SHOW: 'show' },
        sys: { localStorage: {} },
        input: engineInput,
      },
      './TownController': { TownController },
      './BrowserInputGuard': guard,
      './InputProvenance': provenance,
      './SceneLighting': { configureTownLighting() {} },
      '../application/GameStart': require('../.domain-build/application/GameStart'),
      '../application/ExclusiveGameStorage': {
        ExclusiveGameStorage: class {
          warning = '';
          start() {}
          dispose() {}
        },
      },
      './StartScreen': {
        StartScreen: class {
          cancelGestures() {
            cancellations.menu++;
          }
          dispose() {}
        },
      },
    },
    browser,
  );
  const bootstrap = new TownBootstrap();
  bootstrap.node = { scene: {} };
  bootstrap.render = () => {};
  bootstrap.onLoad();
  bootstrap.controller = controller;
  return {
    ...f,
    browser,
    map,
    hooks,
    cancellations,
    bootstrap,
    controller,
    gesture,
    point,
    provenance,
    engineInput,
    sourceEvents,
    originalTouchEmit,
    originalMouseEmit,
    taps: () => taps,
    begin(id = 0, long = true) {
      gesture.begin(id, point, point);
      if (long) {
        now += 500;
        gesture.poll();
      }
    },
  };
}
for (const interruption of ['blur', 'missing mouseup', 'new press after missing mouseup'])
  test(`${interruption} clears the actual input route before a reused mouse ID can merge`, () => {
    const f = focusFixture();
    const before = game.exportSave(f.session.state);
    f.browser.emit('mousedown', { button: 0, buttons: 1 });
    f.begin();
    assert.equal(f.town.lifted, 'b2');
    if (interruption === 'blur') f.browser.emit('blur');
    else if (interruption === 'missing mouseup') f.browser.emit('mousemove', { buttons: 0 });
    else f.browser.emit('mousedown', { button: 0, buttons: 1 });
    assert.equal(f.town.lifted, null);
    assert.equal(f.map.contacts.size, 0);
    assert.equal(f.map.contactTouches.size, 0);
    assert.equal(f.gesture.has(0), false);
    for (const part of ['tray', 'tool', 'hud', 'menu']) assert.equal(f.cancellations[part], 1);
    // Cocos may still simulate touch motion/end after losing the hardware release.
    f.gesture.move(0, f.point, f.point);
    f.gesture.end(0, f.point);
    assert.equal(game.exportSave(f.session.state), before);
    assert.equal(f.taps(), 0);
    if (interruption !== 'new press after missing mouseup')
      f.browser.emit('mousedown', { button: 0, buttons: 1 });
    f.begin(0, false);
    f.browser.emit('mouseup', { button: 0, buttons: 0 });
    f.gesture.end(0, f.point);
    assert.equal(f.taps(), 1, 'The next click starts fresh instead of dropping the old building');
    assert.equal(game.exportSave(f.session.state), before);
    f.browser.emit('mousedown', { button: 0, buttons: 1 });
    f.begin();
    f.browser.emit('mousemove', { buttons: 1 });
    f.browser.emit('mouseup', { button: 0, buttons: 0 });
    f.gesture.end(0, f.point);
    assert.equal(f.session.state.buildings.length, 1, 'A subsequent genuine drag still merges');
    f.bootstrap.onDestroy();
  });

test('ordinary hover and touch movement do not cancel valid gestures or repeatedly refresh HUD', () => {
  const f = focusFixture();
  f.begin(8);
  for (let i = 0; i < 4; i++) f.browser.emit('mousemove', { buttons: 0 });
  assert.equal(f.gesture.has(8), true);
  assert.equal(f.town.lifted, 'b2');
  assert.equal(f.cancellations.tool, 0);
  f.browser.emit('blur');
  assert.equal(f.gesture.has(8), false, 'Focus loss cancels touch gestures too');
  for (let i = 0; i < 4; i++) f.browser.emit('mousemove', { buttons: 0 });
  assert.equal(f.cancellations.tool, 1);
  f.bootstrap.onDestroy();
});

test('canvas focus blurring a DOM element does not lose mouse tracking', () => {
  const f = focusFixture();
  f.browser.emit('mousedown', { button: 0, buttons: 1 });
  f.browser.emit('blur', { target: { tagName: 'INPUT' } });
  f.begin();
  assert.equal(f.town.lifted, 'b2');
  assert.equal(f.cancellations.tool, 0);
  f.browser.emit('mousemove', { buttons: 0 });
  assert.equal(f.town.lifted, null);
  assert.equal(f.cancellations.tool, 1);
  f.bootstrap.onDestroy();
});

for (const button of [1, 2])
  test(`missed release of mouse button ${button} also cancels Cocos simulated touch ID 0`, () => {
    const f = focusFixture(),
      before = game.exportSave(f.session.state);
    f.browser.emit('mousedown', { button });
    f.begin();
    assert.equal(f.town.lifted, 'b2');
    f.browser.emit('mousemove', { buttons: 0 });
    f.gesture.move(0, f.point, f.point);
    f.gesture.end(0, f.point);
    assert.equal(f.town.lifted, null);
    assert.equal(game.exportSave(f.session.state), before);
    f.bootstrap.onDestroy();
  });

test('destroy releases every browser listener and native lifecycle hook without stale callbacks', () => {
  const f = focusFixture();
  assert.equal(f.browser.listeners.size, 4);
  f.bootstrap.onDestroy();
  assert.ok([...f.browser.listeners.values()].every((handlers) => handlers.size === 0));
  assert.equal(f.hooks.size, 0);
  f.browser.emit('blur');
  f.browser.emit('mousedown', { button: 0 });
  f.browser.emit('mousemove', { buttons: 0 });
  assert.equal(f.cancellations.tool, 0);
  assert.equal(f.cancellations.disposed, 1);
});

for (const browser of [undefined, {}])
  test(`native bootstrap works with ${browser ? 'a non-DOM window shim' : 'no window'}`, () => {
    const f = focusFixture(browser);
    assert.equal(f.cancellations.tool, 0);
    assert.doesNotThrow(() => f.bootstrap.onDestroy());
  });

test('a second mouse button does not erase the still-held first button in the browser guard', () => {
  const f = focusFixture(),
    before = game.exportSave(f.session.state);
  f.browser.emit('mousedown', { button: 0, buttons: 1 });
  f.begin();
  f.browser.emit('mousedown', { button: 2, buttons: 3 });
  assert.equal(f.cancellations.tool, 0, 'A distinct button is not a missed release of the first');
  assert.equal(f.town.lifted, 'b2');
  f.browser.emit('mouseup', { button: 2, buttons: 1 });
  f.browser.emit('mousemove', { buttons: 1 });
  assert.equal(f.cancellations.tool, 0);
  f.browser.emit('mousemove', { buttons: 0 });
  assert.equal(f.cancellations.tool, 1, 'The missing first-button release still cancels');
  assert.equal(f.town.lifted, null);
  f.gesture.end(0, f.point);
  assert.equal(game.exportSave(f.session.state), before);
  f.bootstrap.onDestroy();
});

test('repeating the same mouse button after its lost release resets once and permits a fresh drag', () => {
  const f = focusFixture(),
    before = game.exportSave(f.session.state);
  f.browser.emit('mousedown', { button: 2, buttons: 2 });
  f.begin();
  f.browser.emit('mousedown', { button: 0, buttons: 3 });
  f.browser.emit('mouseup', { button: 0, buttons: 2 });
  f.browser.emit('mousedown', { button: 2, buttons: 2 });
  for (const part of ['tray', 'tool', 'hud', 'menu']) assert.equal(f.cancellations[part], 1);
  assert.equal(f.gesture.has(0), false);
  assert.equal(f.town.lifted, null);
  f.gesture.end(0, f.point);
  assert.equal(game.exportSave(f.session.state), before);
  f.begin();
  f.browser.emit('mouseup', { button: 2, buttons: 0 });
  f.gesture.end(0, f.point);
  assert.equal(f.session.state.buildings.length, 1, 'Only the fresh gesture may merge');
  assert.equal(f.cancellations.tool, 1);
  f.bootstrap.onDestroy();
});

test('bootstrap installs the real input provenance adapter and restores both source emitters', () => {
  const f = focusFixture();
  const touch = { getTouches: () => [{ getID: () => 7 }] };
  const mouse = { getButton: () => 0 };
  const touchEmitter = f.engineInput._touchInput._eventTarget;
  const mouseEmitter = f.engineInput._mouseInput._eventTarget;
  assert.notEqual(touchEmitter.emit, f.originalTouchEmit);
  assert.notEqual(mouseEmitter.emit, f.originalMouseEmit);
  touchEmitter.emit('touch-start', touch);
  mouseEmitter.emit('mouse-down', mouse);
  assert.deepEqual(f.sourceEvents, [
    { type: 'touch-start', touch: true },
    { type: 'mouse-down', touch: false },
  ]);
  assert.equal(f.provenance.hasInputConflict(f.engineInput), true);
  f.browser.emit('blur');
  assert.equal(f.provenance.hasInputConflict(f.engineInput), false);
  f.bootstrap.onDestroy();
  assert.equal(touchEmitter.emit, f.originalTouchEmit);
  assert.equal(mouseEmitter.emit, f.originalMouseEmit);
  touchEmitter.emit('touch-start', touch);
  assert.deepEqual(f.sourceEvents.at(-1), { type: 'touch-start', touch: false });
});

test('partial button loss cancels before Cocos turns the remaining button into a move', () => {
  const f = focusFixture();
  const before = game.exportSave(f.session.state);
  f.browser.emit('mousedown', { button: 0, buttons: 1 });
  f.browser.emit('mousedown', { button: 2, buttons: 3 });
  f.begin();
  f.browser.emit('mousemove', { buttons: 2 });
  assert.equal(f.cancellations.tool, 1);
  assert.equal(f.town.lifted, null);
  f.gesture.end(0, f.point);
  assert.equal(game.exportSave(f.session.state), before);
  f.bootstrap.onDestroy();
});

test('game hide clears browser button history before a fresh different-button gesture', () => {
  const f = focusFixture();
  const lifecycleSession = { suspend() {}, resume() {} };
  f.controller.session = lifecycleSession;
  f.bootstrap.controllerSession = lifecycleSession;
  f.bootstrap.flow.session = lifecycleSession;
  f.bootstrap.queueRender = () => {};
  f.browser.emit('mousedown', { button: 2, buttons: 2 });
  f.begin();
  f.hooks.get('hide')();
  assert.equal(f.gesture.interacting, false);
  assert.equal(f.town.lifted, null);
  const cancellations = f.cancellations.tool;
  f.hooks.get('show')();
  f.browser.emit('mousedown', { button: 0, buttons: 1 });
  f.begin(0, false);
  f.browser.emit('mousemove', { buttons: 1 });
  assert.equal(f.gesture.has(0), true);
  assert.equal(f.cancellations.tool, cancellations);
  f.browser.emit('mouseup', { button: 0, buttons: 0 });
  f.gesture.end(0, f.point);
  assert.equal(f.taps(), 1);
  f.bootstrap.onDestroy();
});
