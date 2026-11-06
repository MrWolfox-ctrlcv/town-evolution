/** Production RecipeHandbook + ActionButton listeners; recording Cocos nodes, not GPU QA. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const helperFile = require.resolve('./handbook-pages-ui.test.cjs');
let prelude = fs.readFileSync(helperFile, 'utf8');
prelude = prelude.slice(0, prelude.indexOf('const { HandbookPages } = load'));
const { Node, UITransform, RecordingArt, dependencies, load } = new Function(
  'require',
  prelude + '\nreturn { Node, UITransform, RecordingArt, dependencies, load };',
)(createRequire(helperFile));
class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
  clone() {
    return new Vec2(this.x, this.y);
  }
  set(p) {
    this.x = p.x;
    this.y = p.y;
  }
  static distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
dependencies.cc.Vec2 = Vec2;
Node.EventType.MOUSE_WHEEL = 'wheel';
Object.assign(Node.prototype, {
  setPosition(x, y) {
    this.position = typeof x === 'object' ? { ...x } : { x, y };
  },
  setScale(x, y) {
    this.scale = { x, y };
  },
  setSiblingIndex() {},
  getChildByName(name) {
    return this.children.find((n) => n.name === name);
  },
  isChildOf(node) {
    return this.parent === node || !!this.parent?.isChildOf(node);
  },
  on(type, fn, context, capture = false) {
    this.events.set(type, [...(this.events.get(type) ?? []), { fn, context, capture }]);
  },
  off(type, fn, context, capture = false) {
    this.events.set(
      type,
      (this.events.get(type) ?? []).filter(
        (l) => l.fn !== fn || l.context !== context || l.capture !== capture,
      ),
    );
  },
});
function geometry(node) {
  if (!node.parent) return { x: 0, y: 0, scale: 1 };
  const p = geometry(node.parent);
  return {
    x: p.x + (node.position?.x ?? 0) * p.scale,
    y: p.y + (node.position?.y ?? 0) * p.scale,
    scale: p.scale * (node.scale?.x ?? 1),
  };
}
UITransform.prototype.setContentSize = function (w, h) {
  this.width = w;
  this.height = h;
};
UITransform.prototype.hitTest = function (p) {
  const g = geometry(this.node);
  let root = this.node;
  while (root.parent) root = root.parent;
  p = { x: p.x / (root.dpr ?? 1), y: p.y / (root.dpr ?? 1) };
  return (
    Math.abs(p.x - g.x) <= (this.width * g.scale) / 2 &&
    Math.abs(p.y - g.y) <= (this.height * g.scale) / 2
  );
};
for (const name of ['folder', 'directory']) RecordingArt.prototype[name] = function () {};
RecordingArt.prototype.dispose = function () {};
RecordingArt.prototype.paper = function (node) {
  node.getComponent(UITransform).setContentSize(320, 350);
};
RecordingArt.prototype.navigationButton = function (node) {
  const art = new Node('NavigationArtwork');
  art.addComponent(UITransform).setContentSize(36, 36);
  node.addChild(art);
};
const { RecipeHandbook } = load('RecipeHandbook');
const game = require('../.domain-build/domain/game.js');
function fixture({ width = 1000, height = 800, dpr = 1 } = {}) {
  const root = new Node('Canvas');
  root.dpr = dpr;
  const book = new RecipeHandbook(root);
  book.layout(width, height);
  const state = game.createDemoGame(60000);
  book.setState(state);
  const beforeSave = game.exportSave(state);
  const descendants = (n) => [n, ...n.children.flatMap(descendants)];
  const node = (name) => {
    const found = descendants(root).find((n) => n.name === name);
    assert.ok(found, name);
    return found;
  };
  const contacts = new Map();
  function dispatch(type, id, target, point, code = type) {
    const route = [];
    for (let n = target; n; n = n.parent) route.unshift(n);
    const event = {
      target,
      currentTarget: null,
      propagationStopped: false,
      getID: () => id,
      getLocation: () => new Vec2(point.x * dpr, point.y * dpr),
      getUILocation: () => new Vec2(point.x, point.y),
      getAllTouches: () =>
        [...contacts.entries()].map(([touchId, c]) => ({
          getID: () => touchId,
          getLocation: () => new Vec2(c.point.x * dpr, c.point.y * dpr),
          getUILocation: () => new Vec2(c.point.x, c.point.y),
        })),
      getEventCode: () => code,
    };
    const invoke = (n, capture) => {
      event.currentTarget = n;
      for (const l of [...(n.events.get(type) ?? [])])
        if (l.capture === capture) l.fn.call(l.context ?? n, event);
    };
    for (const n of route.slice(0, -1)) {
      invoke(n, true);
      if (event.propagationStopped) return;
    }
    invoke(target, true);
    invoke(target, false);
    if (event.propagationStopped) return;
    for (const n of route.slice(0, -1).reverse()) {
      invoke(n, false);
      if (event.propagationStopped) return;
    }
  }
  function start(id, target, point = geometry(target)) {
    assert.ok(!contacts.has(id));
    contacts.set(id, { target, point });
    dispatch('start', id, target, point);
  }
  function startBatch(touches) {
    for (const { id, target, point = geometry(target) } of touches) {
      assert.ok(!contacts.has(id));
      contacts.set(id, { target, point });
    }
    for (const { id } of touches) {
      const contact = contacts.get(id);
      dispatch('start', id, contact.target, contact.point);
    }
  }
  function move(id, point) {
    const c = contacts.get(id);
    assert.ok(c);
    c.point = point;
    dispatch('move', id, c.target, point);
  }
  function end(id, cancel = false) {
    const c = contacts.get(id);
    assert.ok(c);
    dispatch(cancel ? 'cancel' : 'end', id, c.target, c.point);
    contacts.delete(id);
  }
  function tap(name) {
    const n = node(name);
    start(100, n);
    end(100);
  }
  function wheel(target, x, y) {
    const event = {
      target,
      propagationStopped: false,
      getScrollX: () => x,
      getScrollY: () => y,
    };
    for (let current = target; current; current = current.parent) {
      event.currentTarget = current;
      for (const l of current.events.get('wheel') ?? [])
        if (!l.capture) l.fn.call(l.context ?? current, event);
      if (event.propagationStopped) break;
    }
    return event;
  }
  tap('RecipeBookOpen');
  tap('RecipeCategory-gather-wood');
  const paper = node('RecipeHandbook');
  const point = (x, y) => {
    const g = geometry(paper);
    return { x: g.x + x * g.scale, y: g.y + y * g.scale };
  };
  const snapshot = () => ({ x: paper.position.x, y: paper.position.y, scale: paper.scale.x });
  const detail = () =>
    descendants(paper)
      .flatMap((n) => n.components.filter((c) => typeof c.string === 'string').map((c) => c.string))
      .find((s) => /^\d+ \/ \d+$/.test(s));
  return {
    book,
    root,
    paper,
    node,
    start,
    startBatch,
    move,
    end,
    tap,
    wheel,
    point,
    snapshot,
    detail,
    dispatch,
    unchanged: () => assert.equal(game.exportSave(state), beforeSave),
  };
}
for (const target of ['directory', 'paper', 'navigation artwork']) {
  test(`handbook ${target} ignores horizontal/zero/invalid wheel while retaining occlusion`, () => {
    const f = fixture();
    if (target === 'directory') f.tap('RecipeBookBack');
    const node =
      target === 'directory'
        ? f.node('RecipeDirectory')
        : target === 'paper'
          ? f.paper
          : f.node('RecipeNext').getChildByName('NavigationArtwork');
    const before = f.snapshot(),
      page = f.detail();
    let leaked = 0;
    f.root.on('wheel', () => leaked++);
    for (const [x, y] of [
      [120, 0],
      [-120, 0],
      [0, 0],
      [0, -0],
      [0, NaN],
      [0, Infinity],
      [0, -Infinity],
    ]) {
      assert.equal(f.wheel(node, x, y).propagationStopped, true);
      assert.deepEqual(f.snapshot(), before, `wheel ${x}, ${y} must leave paper unchanged`);
      assert.equal(f.detail(), page);
    }
    assert.equal(leaked, 0, 'paper still prevents wheel input from reaching the island');
    f.unchanged();
  });
}
test('vertical handbook wheel keeps its direction, bounds and navigation', () => {
  const f = fixture(),
    before = f.snapshot().scale;
  const artwork = f.node('RecipeNext').getChildByName('NavigationArtwork');
  f.wheel(artwork, 80, 1);
  assert.ok(Math.abs(f.snapshot().scale - before * 1.1) < 1e-10);
  f.wheel(f.paper, -80, -1);
  assert.ok(Math.abs(f.snapshot().scale - before) < 1e-10);
  for (let i = 0; i < 30; i++) f.wheel(f.paper, 0, 1);
  assert.equal(f.snapshot().scale, 1.65);
  for (let i = 0; i < 30; i++) f.wheel(f.paper, 0, -1);
  assert.equal(f.snapshot().scale, 0.75);
  const page = f.detail();
  f.tap('RecipeNext');
  assert.notEqual(f.detail(), page);
  f.tap('RecipeBookClose');
  assert.equal(f.paper.active, false);
  f.unchanged();
});
for (const pattern of [
  'body-body',
  'body-next',
  'next-body',
  'next-close',
  'nextChild-closeChild',
]) {
  test(`paper pinch ${pattern} zooms without navigating, closing or mutating save`, () => {
    const f = fixture(),
      before = f.snapshot(),
      page = f.detail();
    const target = (name) =>
      name === 'body'
        ? f.paper
        : name.endsWith('Child')
          ? f
              .node(name.startsWith('next') ? 'RecipeNext' : 'RecipeBookClose')
              .getChildByName('NavigationArtwork')
          : f.node(name === 'next' ? 'RecipeNext' : 'RecipeBookClose');
    const [a, b] = pattern.split('-');
    const pa = a === 'body' ? f.point(-80, 0) : geometry(target(a));
    const pb = b === 'body' ? f.point(68, 0) : geometry(target(b));
    f.start(17, target(a), pa);
    f.start(93, target(b), pb);
    const dx = pa.x - pb.x,
      dy = pa.y - pb.y;
    f.move(17, { x: pa.x + dx * 0.2, y: pa.y + dy * 0.2 });
    assert.ok(f.snapshot().scale > before.scale, JSON.stringify({ before, after: f.snapshot() }));
    const enlarged = f.snapshot().scale;
    f.move(93, { x: pb.x - dx * 0.2, y: pb.y - dy * 0.2 });
    assert.ok(f.snapshot().scale > enlarged, 'second captured touch also contributes to zoom');
    f.end(93);
    f.end(17);
    assert.equal(f.paper.active, true);
    assert.equal(f.detail(), page);
    f.unchanged();
  });
}
test('single tap navigation and close survive, ordinary body drag still moves', () => {
  const f = fixture(),
    page = f.detail();
  f.tap('RecipeNext');
  assert.notEqual(f.detail(), page);
  f.tap('RecipePrevious');
  assert.equal(f.detail(), page);
  const before = f.snapshot(),
    p = f.point(-80, 0);
  f.start(41, f.paper, p);
  f.move(41, { x: p.x - 30, y: p.y + 20 });
  f.end(41);
  assert.notEqual(f.snapshot().x, before.x);
  assert.equal(f.snapshot().scale, before.scale);
  f.tap('RecipeBookClose');
  assert.equal(f.paper.active, false);
  f.unchanged();
});
test('cancel and three IDs never execute stale navigation, new single tap works', () => {
  const f = fixture(),
    page = f.detail();
  f.start(2, f.node('RecipeNext'));
  f.start(70, f.paper, f.point(-60, 0));
  f.start(801, f.paper, f.point(0, -60));
  const blocked = f.snapshot();
  f.move(70, f.point(-90, 0));
  assert.deepEqual(f.snapshot(), blocked, 'third finger cancels the entire paper gesture');
  f.end(2, true);
  f.end(801);
  f.end(70);
  assert.equal(f.detail(), page);
  assert.equal(f.paper.active, true);
  f.tap('RecipeNext');
  assert.notEqual(f.detail(), page);
  f.unchanged();
});
test('button pinch near screen edge remains clamped and cancel permits next drag', () => {
  const f = fixture();
  const p = f.point(-80, 0);
  f.start(31, f.paper, p);
  f.move(31, { x: p.x + 1000, y: p.y + 1000 });
  f.end(31);
  const a = geometry(f.node('RecipeNext')),
    b = f.point(-70, -50);
  f.start(40, f.node('RecipeNext'), a);
  f.start(51, f.paper, b);
  f.move(51, { x: b.x - 90, y: b.y - 90 });
  const box = f.snapshot();
  assert.ok(box.scale > 0.95);
  assert.ok(Math.abs(box.x) + 160 * box.scale <= 492 + 1e-6);
  assert.ok(Math.abs(box.y) + 175 * box.scale <= 392 + 1e-6);
  f.end(40, true);
  f.end(51);
  const before = f.snapshot(),
    c = f.point(0, -80);
  f.start(400, f.paper, c);
  f.move(400, { x: c.x - 30, y: c.y - 30 });
  f.end(400);
  assert.notDeepEqual(f.snapshot(), before);
  f.unchanged();
});

test('canceling button pinch clears movement and preserves fresh back/close taps', () => {
  const f = fixture(),
    page = f.detail();
  f.start(7, f.node('RecipeNext'));
  f.start(38, f.paper, f.point(-70, -50));
  f.move(38, f.point(-110, -80));
  f.end(7, true);
  const afterCancel = f.snapshot();
  f.move(38, f.point(-130, -90));
  assert.deepEqual(f.snapshot(), afterCancel, 'remaining canceled contact cannot drag paper');
  f.end(38);
  assert.equal(f.detail(), page);
  f.tap('RecipeBookBack');
  assert.equal(f.paper.active, false);
  assert.equal(f.node('RecipeDirectory').active, true);
  f.tap('RecipeDirectoryClose');
  assert.equal(f.node('RecipeDirectory').active, false);
  f.unchanged();
});

test('outside-sheet contact cancels paper gesture and unknown IDs do not steal active pinch', () => {
  const f = fixture(),
    page = f.detail();
  f.start(5, f.paper, f.point(-80, 0));
  f.start(6, f.node('RecipeNext'));
  f.dispatch('move', 999, f.paper, f.point(0, 0));
  f.dispatch('end', 999, f.paper, f.point(0, 0));
  f.dispatch('cancel', 999, f.paper, f.point(0, 0));
  const before = f.snapshot();
  f.move(5, f.point(-120, -40));
  assert.ok(f.snapshot().scale > before.scale);
  const outside = new Node('MapInput');
  f.root.addChild(outside);
  f.start(99, outside, { x: -490, y: 390 });
  const blocked = f.snapshot();
  f.move(5, f.point(-145, -80));
  assert.deepEqual(f.snapshot(), blocked);
  f.end(6);
  f.end(5);
  f.end(99);
  assert.equal(f.detail(), page);
  f.unchanged();
});

test('one finger moving from a button neither drags paper nor executes its click', () => {
  const f = fixture(),
    before = f.snapshot(),
    page = f.detail(),
    p = geometry(f.node('RecipeNext'));
  f.start(331, f.node('RecipeNext'), p);
  f.move(331, { x: p.x - 45, y: p.y - 40 });
  assert.deepEqual(f.snapshot(), before);
  f.end(331);
  assert.equal(f.detail(), page);
  f.unchanged();
});
test('dispose removes parent listeners and cancels ongoing captured contacts', () => {
  const f = fixture();
  f.start(21, f.node('RecipeNext'));
  f.start(88, f.paper, f.point(-80, 0));
  f.book.dispose();
  assert.equal([...f.root.events.values()].flat().length, 0);
  assert.equal(f.paper.destroyed, true);
  f.unchanged();
});
for (const [width, height, dpr] of [
  [1000, 800, 2],
  [390, 844, 2],
  [568, 320, 3],
]) {
  test(`button pinch uses logical motion and physical hit tests at ${width}x${height} DPR${dpr}`, () => {
    const f = fixture({ width, height, dpr }),
      a = geometry(f.node('RecipeNext')),
      b = f.point(-70, -50),
      before = f.snapshot();
    f.start(61, f.node('RecipeNext'), a);
    f.start(480, f.paper, b);
    const factor = width > height && height < 400 ? 0.9 : 1.1;
    f.move(480, { x: a.x + (b.x - a.x) * factor, y: a.y + (b.y - a.y) * factor });
    assert.ok(
      Math.abs(f.snapshot().scale - before.scale * factor) < 1e-6,
      JSON.stringify({ before, after: f.snapshot(), factor }),
    );
    f.end(61);
    f.end(480);
    f.book.layout(height, width);
    const box = f.snapshot();
    assert.ok(Math.abs(box.x) + 160 * box.scale <= height / 2 - 8 + 1e-6);
    assert.ok(Math.abs(box.y) + 175 * box.scale <= width / 2 - 8 + 1e-6);
    f.unchanged();
  });
}

for (const pattern of [
  'body-body',
  'body-next',
  'next-body',
  'next-close',
  'nextChild-closeChild',
]) {
  test(`simultaneous START batch ${pattern} establishes pinch without executing buttons`, () => {
    const f = fixture(),
      before = f.snapshot(),
      page = f.detail();
    const target = (name) =>
      name === 'body'
        ? f.paper
        : name.endsWith('Child')
          ? f
              .node(name.startsWith('next') ? 'RecipeNext' : 'RecipeBookClose')
              .getChildByName('NavigationArtwork')
          : f.node(name === 'next' ? 'RecipeNext' : 'RecipeBookClose');
    const [a, b] = pattern.split('-');
    const pa = a === 'body' ? f.point(-80, 0) : geometry(target(a));
    const pb = b === 'body' ? f.point(68, 0) : geometry(target(b));
    f.startBatch([
      { id: 312, target: target(a), point: pa },
      { id: 901, target: target(b), point: pb },
    ]);
    f.move(312, { x: pa.x + (pa.x - pb.x) * 0.2, y: pa.y + (pa.y - pb.y) * 0.2 });
    assert.ok(f.snapshot().scale > before.scale, JSON.stringify({ before, after: f.snapshot() }));
    f.end(901);
    f.end(312);
    assert.equal(f.detail(), page);
    assert.equal(f.paper.active, true);
    f.unchanged();
  });
}
for (const mapFirst of [false, true]) {
  test(`simultaneous paper+map START batch (${mapFirst ? 'map first' : 'paper first'}) leaves map routed and paper canceled`, () => {
    const f = fixture(),
      before = f.snapshot(),
      page = f.detail(),
      map = new Node('MapInput');
    f.root.addChild(map);
    const seen = [];
    for (const type of ['start', 'move', 'end']) map.on(type, () => seen.push(type));
    const touches = [
      { id: 39, target: f.node('RecipeNext'), point: geometry(f.node('RecipeNext')) },
      { id: 78, target: map, point: { x: -490, y: 390 } },
    ];
    f.startBatch(mapFirst ? touches.toReversed() : touches);
    f.move(78, { x: -460, y: 360 });
    f.move(39, f.point(-100, -80));
    f.end(39);
    f.end(78);
    assert.deepEqual(seen, ['start', 'move', 'end']);
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.detail(), page);
    assert.equal(f.paper.active, true);
    f.unchanged();
  });
}

for (const onButton of [false, true]) {
  test(`map-origin contact moving onto paper cannot seed or resurrect pinch (${onButton ? 'button' : 'body'})`, () => {
    const f = fixture(),
      map = new Node('MapInput'),
      page = f.detail();
    f.root.addChild(map);
    const seen = [];
    for (const type of ['start', 'move', 'end']) map.on(type, () => seen.push(type));
    f.start(881, map, { x: -490, y: 390 });
    f.move(881, f.point(-80, 0));
    const target = onButton ? f.node('RecipeNext') : f.paper;
    const p = onButton ? geometry(target) : f.point(68, 0);
    f.start(92, target, p);
    const blocked = f.snapshot();
    f.move(92, { x: p.x + 25, y: p.y - 25 });
    assert.deepEqual(f.snapshot(), blocked, 'map origin cannot become paper pinch');
    f.end(881);
    f.start(771, f.paper, f.point(-90, -60));
    f.move(771, f.point(-135, -90));
    assert.deepEqual(f.snapshot(), blocked, 'old canceled sheet contact cannot be revived');
    f.end(92);
    f.end(771);
    assert.deepEqual(seen, ['start', 'move', 'end']);
    assert.equal(f.detail(), page);
    const fresh = f.snapshot(),
      a = f.point(-70, 0),
      b = geometry(f.node('RecipeNext'));
    f.start(22, f.paper, a);
    f.start(33, f.node('RecipeNext'), b);
    f.move(22, { x: a.x + (a.x - b.x) * 0.2, y: a.y + (a.y - b.y) * 0.2 });
    assert.ok(f.snapshot().scale > fresh.scale, 'new gesture after all old contacts end works');
    f.end(22);
    f.end(33);
    f.unchanged();
  });
}
