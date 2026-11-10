/** Production control listeners with recording Cocos nodes and synthetic contacts.
 * This checks coordinate/capture contracts, not rendering, a browser or a device. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');

function fixture() {
  const helper = require.resolve('./handbook-gestures-ui.test.cjs');
  const prelude = fs.readFileSync(helper, 'utf8').split('const { RecipeHandbook } = load')[0];
  const { Node, UITransform, dependencies, load, geometry, Vec2 } = new Function(
    'require',
    prelude + '\nreturn { Node, UITransform, dependencies, load, geometry, Vec2 };',
  )(createRequire(helper));
  dependencies.cc.input = { getAllTouches: () => [] };
  const viewport = { x: 26, y: 38 };
  const scale = { x: 2, y: 3 };
  dependencies.cc.view = {
    getViewportRect: () => viewport,
    getScaleX: () => scale.x,
    getScaleY: () => scale.y,
  };
  dependencies['./TrayIcons'] = {
    TRAY_LABELS: {},
    TrayIcons: class {
      draw() {}
      dispose() {}
    },
  };
  dependencies['./ActionArtwork'] = {
    ActionArtwork: class {
      bind() {}
      dispose() {}
    },
    actionIcon: () => 'manage',
  };
  const { uiNode } = load('Widgets');
  const scene = new Node('Scene');
  const canvas = uiNode('Canvas', scene);
  const full = { width: 1000, height: 800 };
  canvas.setPosition(full.width / 2, full.height / 2);
  canvas.getComponent(UITransform).setContentSize(full.width, full.height);
  const safe = { x: 43, y: 29, width: 902, height: 730 };
  const parent = uiNode('SafeControls', canvas);
  parent.setPosition(
    safe.x + safe.width / 2 - full.width / 2,
    safe.y + safe.height / 2 - full.height / 2,
  );
  parent.getComponent(UITransform).setContentSize(safe.width, safe.height);
  const map = uiNode('FullCanvasMapInput', canvas);
  map.getComponent(UITransform).setContentSize(full.width, full.height);
  const { ToolTray } = load('ToolTray');
  const { RecipeHandbook } = load('RecipeHandbook');
  const { RadialActions } = load('RadialActions');
  const tray = new ToolTray(parent, canvas);
  tray.layout(safe.width, safe.height, 50, 80, 0, safe);
  const records = [];
  tray.setHandlers({
    begin: (kind, id, point) => records.push({ phase: 'begin', kind, id, point }),
    move: (id, point, returning) => records.push({ phase: 'move', id, point, returning }),
    end: (id, point, returning) => records.push({ phase: 'end', id, point, returning }),
    cancel: () => records.push({ phase: 'cancel' }),
  });
  const descendants = (node) => [node, ...node.children.flatMap(descendants)];
  const node = (name) => {
    const result = descendants(canvas).find((candidate) => candidate.name === name);
    assert.ok(result, name);
    return result;
  };
  function event(target, point, id = 7, phase = 'start') {
    // Physical coordinates deliberately differ from UI coordinates on both axes.
    const raw = new Vec2(point.x * scale.x + viewport.x, point.y * scale.y + viewport.y);
    const result = {
      target,
      getID: () => id,
      getUILocation: () => new Vec2(point.x, point.y),
      getLocation: () => raw,
      getEventCode: () => phase,
      getAllTouches: () => [result],
    };
    return { event: result, raw };
  }
  function invoke(target, phase, e, capture = false) {
    for (const listener of [...(target.events.get(phase) ?? [])]) {
      if (listener.capture === capture) listener.fn.call(listener.context ?? target, e);
    }
  }
  function send(phase, point, id = 7) {
    const e = event(node('HarvestTool'), point, id, phase);
    invoke(e.event.target, phase, e.event);
    return e;
  }
  return {
    dependencies,
    load,
    Node,
    UITransform,
    Vec2,
    tray,
    records,
    safe,
    canvas,
    parent,
    map,
    node,
    event,
    send,
    invoke,
    geometry,
    RecipeHandbook,
    RadialActions,
    viewport,
    scale,
  };
}

test('translated safe parent keeps drag ghost at global UI contact plus intentional lift; handlers retain raw screen points', () => {
  const f = fixture();
  const start = f.send('start', { x: 250, y: 500 });
  const moved = f.send('move', { x: 440, y: 340 });
  const ghost = f.node('ToolGhost');
  assert.equal(ghost.active, true);
  const world = f.geometry(ghost);
  assert.equal(world.x, 440);
  assert.equal(world.y, 340 + 22, 'existing finger-clearance lift is preserved');
  assert.equal(f.records[0].point, start.raw, 'begin forwards original getLocation object');
  assert.equal(f.records[1].point, moved.raw, 'move forwards original getLocation object');
  assert.equal(moved.raw.x, 906);
  assert.equal(moved.raw.y, 1058);
  const end = f.send('end', { x: 440, y: 340 });
  assert.equal(f.records.at(-1).phase, 'end');
  assert.equal(f.records.at(-1).point, end.raw);
  assert.equal(ghost.active, false);
  f.tray.dispose();
});

test('tray accepts exact safe-rectangle boundaries and cancels just outside every edge', () => {
  const f = fixture();
  const { x, y, width, height } = f.safe;
  const right = x + width,
    top = y + height;
  for (const point of [
    { x, y },
    { x: right, y },
    { x, y: top },
    { x: right, y: top },
  ]) {
    f.send('start', { x: 300, y: 300 });
    const end = f.send('end', point);
    assert.equal(f.records.at(-1).phase, 'end', JSON.stringify(point));
    assert.equal(f.records.at(-1).point, end.raw);
  }
  for (const point of [
    { x: x - 0.01, y: 300 },
    { x: right + 0.01, y: 300 },
    { x: 300, y: y - 0.01 },
    { x: 300, y: top + 0.01 },
  ]) {
    f.send('start', { x: 300, y: 300 });
    f.send('end', point);
    assert.equal(f.records.at(-1).phase, 'cancel', JSON.stringify(point));
    assert.equal(f.node('ToolGhost').active, false);
  }
  f.tray.dispose();
});

test('tray and handbook capture on full canvas, observe sibling map contacts, and dispose releases capture', () => {
  const f = fixture();
  const book = new f.RecipeHandbook(f.parent, false, f.canvas);
  book.layout(f.safe.width, f.safe.height);
  const captureCount = (target, phase) =>
    (target.events.get(phase) ?? []).filter((l) => l.capture).length;
  assert.equal(captureCount(f.canvas, 'start'), 2);
  for (const phase of ['move', 'end', 'cancel']) assert.equal(captureCount(f.canvas, phase), 1);
  for (const phase of ['start', 'move', 'end', 'cancel'])
    assert.equal(captureCount(f.parent, phase), 0);
  assert.equal(f.map.parent, f.canvas);
  assert.notEqual(f.map.parent, f.parent);
  f.send('start', { x: 250, y: 300 }, 7);
  const sibling = f.event(f.map, { x: 10, y: 10 }, 8);
  f.invoke(f.canvas, 'start', sibling.event, true);
  assert.equal(f.records.at(-1).phase, 'cancel', 'second contact outside safe parent cancels drag');
  assert.ok(book.startedPointers.has(8), 'production handbook capture observed sibling start');
  f.tray.dispose();
  assert.equal(captureCount(f.canvas, 'start'), 1, 'tray removed only its own capture');
  book.dispose();
  for (const phase of ['start', 'move', 'end', 'cancel'])
    assert.equal(captureCount(f.canvas, phase), 0);
  assert.equal(book.startedPointers.size, 0);
  f.invoke(f.canvas, 'start', f.event(f.map, { x: 10, y: 10 }, 9).event, true);
  assert.equal(book.startedPointers.size, 0, 'disposed handbook no longer sees contacts');
});

test('radial projection removes engine viewport, asymmetric scale and safe origin exactly once', () => {
  const f = fixture();
  const radial = new f.RadialActions(f.parent, () => {});
  radial.layout(f.safe.width, f.safe.height, f.safe);
  const ui = [
    { x: 320, y: 270 },
    { x: 380, y: 330 },
  ];
  const points = ui.map((p) => ({
    x: p.x * f.scale.x + f.viewport.x,
    y: p.y * f.scale.y + f.viewport.y,
  }));
  radial.project(points, []);
  assert.deepEqual(radial.anchor, { left: -174, right: -114, bottom: -124, top: -64 });
  const parent = f.geometry(f.parent);
  assert.equal(radial.anchor.left + parent.x, ui[0].x);
  assert.equal(radial.anchor.top + parent.y, ui[1].y);
  radial.dispose();
  f.tray.dispose();
});

test('real StartScreen canvas capture preserves real handbook two-finger paper pinch', () => {
  const f = fixture();
  const cc = f.dependencies.cc;
  class Camera {
    static ProjectionType = { ORTHO: 1 };
    static ClearFlag = { DEPTH_ONLY: 1 };
  }
  Object.assign(cc, {
    Camera,
    Canvas: class {},
    ResolutionPolicy: { SHOW_ALL: 1 },
    screen: { devicePixelRatio: 1, windowSize: { width: 1000, height: 800 } },
    sys: { isBrowser: false, getSafeAreaRect: () => f.safe },
  });
  cc.view.resizeWithBrowserSize = () => {};
  f.dependencies['./SettingsPanel'] = {
    SettingsPanel: class {
      cancelGestures() {}
      dispose() {}
    },
  };
  f.dependencies['./StartArtwork'] = { StartArtwork: class {} };
  const { StartScreen } = f.load('StartScreen');
  const start = new StartScreen(
    new f.Node('StartScene'),
    { session: { state: require('../.domain-build/domain/game').createGame(0) } },
    () => {},
  );
  assert.equal(start.handbook, null, 'Closed title handbook is not constructed');
  start.openHandbook();
  const firstBook = start.handbook;
  start.openHandbook();
  assert.equal(start.handbook, firstBook, 'Reopening reuses the existing handbook');
  const canvas = start.canvas;
  canvas.setPosition(500, 400);
  canvas.getComponent(f.UITransform).setContentSize(1000, 800);
  start.controls.layout(1000, 800);
  const book = start.handbook;
  assert.ok(book instanceof f.RecipeHandbook, 'handbook is production class, not a replacement');
  book.layout(f.safe.width, f.safe.height);
  // Open the real paper directly: menu rendering/data is unrelated to this input regression.
  book.show('paper');
  const paper = book.paper;
  const center = f.geometry(paper);
  const contacts = new Map();
  function contact(id, point) {
    return {
      getID: () => id,
      getLocation: () => new f.Vec2(point.x, point.y),
      getUILocation: () => new f.Vec2(point.x, point.y),
    };
  }
  cc.input.getAllTouches = () => [...contacts].map(([id, point]) => contact(id, point));
  function dispatch(phase, id, point) {
    contacts.set(id, point);
    const e = {
      ...contact(id, point),
      target: paper,
      propagationStopped: false,
      getEventCode: () => phase,
      getAllTouches: cc.input.getAllTouches,
    };
    const route = [];
    for (let n = paper; n; n = n.parent) route.unshift(n);
    for (const ancestor of route.slice(0, -1)) {
      f.invoke(ancestor, phase, e, true);
      if (e.propagationStopped) return;
    }
    f.invoke(paper, phase, e, true);
    f.invoke(paper, phase, e);
    if (!e.propagationStopped) {
      for (const ancestor of route.slice(0, -1).reverse()) {
        f.invoke(ancestor, phase, e);
        if (e.propagationStopped) break;
      }
    }
  }
  const initialScale = paper.scale.x;
  dispatch('start', 11, { x: center.x - 40, y: center.y });
  assert.equal(book.pointers.size, 1);
  dispatch('start', 12, { x: center.x + 40, y: center.y });
  assert.equal(book.pointers.size, 2, 'StartScreen capture must not clear the first paper pointer');
  dispatch('move', 12, { x: center.x + 60, y: center.y });
  assert.ok(
    Math.abs(paper.scale.x - initialScale * 1.25) < 1e-9,
    'real paper move keeps both contacts and scales by the distance ratio',
  );
  dispatch('end', 12, { x: center.x + 60, y: center.y });
  contacts.delete(12);
  dispatch('end', 11, { x: center.x - 40, y: center.y });
  contacts.delete(11);
  assert.equal(book.pointers.size, 0);
  start.dispose();
  assert.equal((canvas.events.get('start') ?? []).filter((listener) => listener.capture).length, 0);
  f.tray.dispose();
});
