/** Execute the real Cocos-facing menu and button routing with narrow scene collaborators. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
class Node {
  static EventType = {
    TOUCH_START: 'start',
    TOUCH_MOVE: 'move',
    TOUCH_END: 'end',
    TOUCH_CANCEL: 'cancel',
  };
  active = true;
  children = [];
  components = [];
  events = new Map();
  position = { x: 0, y: 0 };
  worldMatrix = { x: 0, y: 0, z: 0, angle: 0, scale: 1 };
  constructor(name = '') {
    this.name = name;
  }
  get activeInHierarchy() {
    return this.active && (!this.parent || this.parent.activeInHierarchy);
  }
  addChild(node) {
    node.parent = this;
    this.children.push(node);
  }
  addComponent(Type) {
    const c = new Type();
    c.node = this;
    this.components.push(c);
    return c;
  }
  getComponent(Type) {
    return this.components.find((c) => c instanceof Type) ?? null;
  }
  getComponentsInChildren(Type) {
    return [
      ...this.components.filter((c) => c instanceof Type),
      ...this.children.flatMap((n) => n.getComponentsInChildren(Type)),
    ];
  }
  setPosition(x, y) {
    this.position = { x, y };
  }
  on(type, listener) {
    this.events.set(type, [...(this.events.get(type) ?? []), listener]);
  }
  emit(type, event) {
    for (const listener of this.events.get(type) ?? []) listener(event);
  }
  destroy() {
    this.destroyed = true;
    this.active = false;
  }
}
class UITransform {
  setContentSize(width, height) {
    Object.assign(this, { width, height });
  }
  hitTest(p) {
    const n = this.node.position;
    return Math.abs(p.x - n.x) <= this.width / 2 && Math.abs(p.y - n.y) <= this.height / 2;
  }
}
class Label {
  static Overflow = { SHRINK: 1 };
  static HorizontalAlign = { LEFT: 0, CENTER: 1 };
  static VerticalAlign = { CENTER: 1 };
}
class LabelOutline {}
class Graphics {
  clear() {}
  roundRect() {}
  fill() {}
  ellipse() {}
  stroke() {}
}
class Vec2 {
  constructor(x, y) {
    Object.assign(this, { x, y });
  }
}
class Vec3 {
  set(x, y, z) {
    Object.assign(this, { x, y, z });
    return this;
  }
  static transformMat4(out, p, m) {
    const { x, y, z } = p,
      c = Math.cos(m.angle),
      s = Math.sin(m.angle);
    return out.set(
      m.x + (x * c - z * s) * m.scale,
      m.y + y * m.scale,
      m.z + (x * s + z * c) * m.scale,
    );
  }
}
class MeshRenderer {
  enabled = true;
}
class ActionArtwork {
  bind() {}
  dispose() {}
}
const cc = {
  Node,
  UITransform,
  Label,
  LabelOutline,
  Graphics,
  Vec2,
  Vec3,
  MeshRenderer,
  Mesh: class {},
  gfx: { AttributeName: { ATTR_POSITION: 'positions' } },
  Layers: { Enum: { UI_2D: 1 } },
  view: { getViewportRect: () => ({ x: 0, y: 0 }), getScaleX: () => 1, getScaleY: () => 1 },
};
const cache = {};
function load(name) {
  if (cache[name]) return cache[name];
  const code = ts.transpileModule(
    fs.readFileSync(`assets/scripts/presentation/${name}.ts`, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id === 'cc') return cc;
      if (id === './ActionArtwork') return { ActionArtwork, actionIcon: () => 'manage' };
      if (id === './Palette') return { PALETTE: {}, color: (c) => c };
      if (id.startsWith('../')) return require(`../.domain-build/${id.slice(3)}.js`);
      return load(id.slice(2));
    },
    module,
    module.exports,
  );
  cache[name] = module.exports;
  return module.exports;
}
const { RadialActions } = load('RadialActions');
const { modelBounds } = load('ObjectBounds');
function event(id = 1, x = 0, y = 0, touches = 1) {
  return {
    getID: () => id,
    getUILocation: () => ({ x, y }),
    getAllTouches: () => Array(touches).fill({}),
  };
}
function tap(button) {
  button.node.emit('start', event());
  button.node.emit('end', event());
}
function fixture(count = 2) {
  const messages = [],
    runs = [];
  const menu = new RadialActions(new Node('Canvas'), (m) => messages.push(m));
  const data = {
    target: { kind: 'building', id: 'b1' },
    detail: '住宅 · 长按移动',
    actions: Array.from({ length: count }, (_, i) => ({
      text: `操作${i}`,
      run: () => runs.push(i),
    })),
    rotation: null,
  };
  menu.open();
  menu.render(data);
  menu.project(
    [
      { x: 155, y: 382 },
      { x: 235, y: 472 },
    ],
    [],
  );
  return {
    menu,
    data,
    messages,
    runs,
    shown: () => menu.buttons.filter((b) => b.node.activeInHierarchy),
  };
}
test('center and gaps pass through to the world; real buttons commit once and disabled buttons explain', () => {
  const f = fixture();
  assert.equal(f.menu.covers({ x: 0, y: 0 }), false);
  const [first] = f.shown();
  assert.equal(f.menu.covers(first.node.position), true);
  tap(first);
  first.node.emit('end', event());
  assert.deepEqual(f.runs, [0]);
  f.data.actions[0] = {
    text: '操作0',
    enabled: false,
    reason: '仓库已满',
    run: () => f.runs.push('blocked'),
  };
  f.menu.render(f.data);
  tap(f.shown()[0]);
  assert.deepEqual(f.messages, ['仓库已满']);
  assert.deepEqual(f.runs, [0]);
});
test('switching objects, moving camera, dragging a button and adding a second finger cancel a captured action', () => {
  const f = fixture();
  let b = f.shown()[0];
  b.node.emit('start', event());
  f.menu.render({ ...f.data, target: { kind: 'tree', id: 't1' } });
  b.node.emit('end', event());
  f.menu.project(
    [
      { x: 155, y: 382 },
      { x: 235, y: 472 },
    ],
    [],
  );
  b = f.shown()[0];
  b.node.emit('start', event());
  f.menu.project(
    [
      { x: 175, y: 382 },
      { x: 255, y: 472 },
    ],
    [],
  );
  b.node.emit('end', event());
  b = f.shown()[0];
  b.node.emit('start', event());
  b.node.emit('move', event(1, 30, 0));
  b.node.emit('end', event());
  b.node.emit('start', event());
  b.node.emit('start', event(2, 0, 0, 2));
  b.node.emit('end', event());
  assert.deepEqual(f.runs, []);
  tap(b);
  assert.deepEqual(f.runs, [0]);
});
test('close persists across refresh, reopen is explicit, suppression leaves no ghost hit areas', () => {
  const f = fixture();
  tap(f.shown().at(-1));
  assert.equal(f.menu.root.active, false);
  f.menu.render(f.data);
  assert.equal(f.menu.root.active, false);
  f.menu.open();
  f.menu.project(
    [
      { x: 155, y: 382 },
      { x: 235, y: 472 },
    ],
    [],
  );
  assert.equal(f.menu.root.active, true);
  const b = f.shown()[0];
  b.node.emit('start', event());
  f.menu.setSuppressed(true);
  b.node.emit('end', event());
  assert.deepEqual(f.runs, []);
  assert.equal(f.menu.covers(b.node.position), false);
  f.menu.setSuppressed(false);
  assert.equal(f.menu.root.active, true);
  f.menu.render({ ...f.data, target: null });
  assert.equal(f.menu.root.active, false);
  f.menu.dispose();
  assert.equal(f.menu.root.destroyed, true);
});
test('identical labels refresh command closures rather than retaining stale order or shipment IDs', () => {
  const f = fixture(1);
  f.data.actions[0] = { text: '操作0', run: () => f.runs.push('new-offer') };
  f.menu.render(f.data);
  tap(f.shown()[0]);
  assert.deepEqual(f.runs, ['new-offer']);
});
test('compact overflow pages through every action, retaining close and avoiding duplicate commits', () => {
  const f = fixture(7);
  f.menu.layout(320, 320);
  f.menu.project(
    [
      { x: 70, y: 105 },
      { x: 250, y: 215 },
    ],
    [],
  );
  const visited = new Set();
  for (let i = 0; i < 10; i++) {
    const shown = f.shown();
    for (const b of shown)
      if (/^操作/.test(b.action.text)) {
        visited.add(b.action.text);
        tap(b);
      }
    const more = shown.find((b) => /^更多/.test(b.action.text));
    assert.ok(shown.some((b) => b.action.text === '关闭'));
    if (!more) break;
    tap(more);
  }
  assert.equal(visited.size, 7);
});
test('model anchors use actual mesh vertices without precomputed bounds and track rotation, movement and scale', () => {
  const root = new Node();
  const mesh = {
    struct: { primitives: [{}] },
    reads: 0,
    readAttribute() {
      this.reads++;
      return [0, 0, 0, 2, 4, 1];
    },
  };
  const child = new Node();
  root.addChild(child);
  const renderer = child.addComponent(MeshRenderer);
  renderer.mesh = mesh;
  assert.deepEqual(modelBounds(root), { min: [0, 0, 0], max: [2, 4, 1] });
  child.worldMatrix = { x: 10, y: 2, z: 5, angle: Math.PI / 2, scale: 2 };
  const b = modelBounds(root);
  assert.ok(Math.abs(b.min[0] - 8) < 1e-8);
  assert.deepEqual(b.max, [10, 10, 9]);
  assert.equal(mesh.reads, 1);
  child.active = false;
  assert.equal(modelBounds(root), null);
});
