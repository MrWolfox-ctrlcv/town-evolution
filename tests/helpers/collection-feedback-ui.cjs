/** Source-level HUD integration: production listeners, layout, actions and persistence.
 * Engine rendering/tween timing and unrelated HUD ornaments are narrow doubles,
 * not a browser/GPU/pixel test. Pointer targets are chosen by screen-space hitTest.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const game = require('../../.domain-build/domain/game.js');
const { emptyStock } = require('../../.domain-build/domain/commerce.js');
const { GameSession } = require('../../.domain-build/application/GameSession.js');
class Node {
  static EventType = {
    TOUCH_START: 'start',
    TOUCH_MOVE: 'move',
    TOUCH_END: 'end',
    TOUCH_CANCEL: 'cancel',
  };
  constructor(name) {
    Object.assign(this, {
      name,
      children: [],
      components: [],
      events: new Map(),
      active: true,
      position: { x: 0, y: 0, z: 0 },
    });
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
  getChildByName(name) {
    return this.children.find((n) => n.name === name) ?? null;
  }
  get activeInHierarchy() {
    return this.active && (!this.parent || this.parent.activeInHierarchy);
  }
  get worldPosition() {
    const p = this.parent?.worldPosition ?? { x: 0, y: 0 };
    return { x: p.x + this.position.x, y: p.y + this.position.y };
  }
  setPosition(x, y, z = 0) {
    this.position = typeof x === 'object' ? x : { x, y, z };
  }
  setScale(x, y = x, z = 1) {
    this.scale = { x, y, z };
  }
  setSiblingIndex() {}
  off() {}
  destroy() {
    this.active = false;
    this.destroyed = true;
    if (this.parent) this.parent.children = this.parent.children.filter((n) => n !== this);
  }
  on(type, fn, owner, capture = false) {
    this.events.set(type, [...(this.events.get(type) ?? []), { fn, owner, capture }]);
  }
  emit(type, e, capture = false) {
    for (const l of this.events.get(type) ?? []) if (l.capture === capture) l.fn.call(l.owner, e);
  }
}
class UITransform {
  setContentSize(width, height) {
    Object.assign(this, { width, height, contentSize: { width, height } });
  }
  convertToNodeSpaceAR(p) {
    const c = this.node.worldPosition;
    return new Vec(p.x - c.x, p.y - c.y, (p.z ?? 0) - (c.z ?? 0));
  }
  hitTest(p) {
    const c = this.node.worldPosition;
    return Math.abs(p.x - c.x) <= this.width / 2 && Math.abs(p.y - c.y) <= this.height / 2;
  }
}
class Graphics {
  clear() {}
  roundRect() {}
  fill() {}
  ellipse() {}
  stroke() {}
}
class Label {
  static Overflow = { SHRINK: 1 };
  static HorizontalAlign = { LEFT: 0, CENTER: 1 };
  static VerticalAlign = { CENTER: 1 };
}
class Vec {
  constructor(x, y, z = 0) {
    Object.assign(this, { x, y, z });
  }
}
class Ornament {
  constructor() {
    this.data = null;
  }
  layout() {}
  render(data) {
    this.data = data;
  }
  setState() {}
  cancel() {}
  cancelGesture() {}
  close() {}
  open() {}
  covers() {
    return false;
  }
  dispose() {}
  regions() {
    return [];
  }
}
class IdleDrag {
  updateHint() {}
  begin() {
    assert.fail('Empty stock must never start a drag');
  }
  cancel() {}
}
class Artwork {
  bind() {}
  dispose() {}
}
const screen = { windowSize: { width: 390, height: 844 }, devicePixelRatio: 1 };
const startedFlights = [];
const dependencies = {
  cc: {
    Node,
    UITransform,
    Graphics,
    Label,
    LabelOutline: class {},
    UIOpacity: class {},
    Canvas: class {},
    Camera: class {
      static ProjectionType = { ORTHO: 1 };
      static ClearFlag = { DEPTH_ONLY: 1 };
    },
    Layers: { Enum: { UI_2D: 1 } },
    Vec2: Vec,
    Vec3: Vec,
    screen,
    ResolutionPolicy: {},
    view: {
      resizeWithBrowserSize() {},
      setDesignResolutionSize() {},
      getViewportRect: () => ({ x: 0, y: 0 }),
      getScaleX: () => 1,
      getScaleY: () => 1,
    },
    Tween: { stopAllByTarget() {} },
    tween(target) {
      return {
        to(_duration, values) {
          this.values = values;
          return this;
        },
        call(callback) {
          this.callback = callback;
          return this;
        },
        start() {
          Object.assign(target, this.values);
          this.callback?.();
        },
      };
    },
  },
  './Palette': { PALETTE: {}, color: (v) => v },
  './ActionArtwork': { ActionArtwork: Artwork, actionIcon: (text) => text },
  './TrayIcons': {
    TRAY_LABELS: { vegetable: '胡萝卜', wheat: '小麦', lettuce: '生菜' },
    TrayIcons: class {
      draw(node, kind) {
        if (node.name === 'CollectedItem') startedFlights.push({ node, kind });
      }
      dispose() {}
    },
  },
  './FarmTools': { FarmTools: IdleDrag },
  './StockDrag': { StockDrag: IdleDrag },
  './ToolUseDrag': { ToolUseDrag: IdleDrag },
  './TownView': {},
  './MapCamera': {},
  './ObjectDrag': {},
  './ModelFactory': {
    ModelFactory: class {
      dispose() {}
    },
  },
  './PileModel': {},
  ...Object.fromEntries(
    ['RadialActions', 'StatusToast', 'ResourceCounters', 'RecipeHandbook'].map((name) => [
      `./${name}`,
      { [name]: Ornament },
    ]),
  ),
};
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const { outputText } = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, `../../assets/scripts/presentation/${name}.ts`), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  );
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (id) => {
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      if (id.startsWith('../')) return require(`../../.domain-build/${id.slice(3)}.js`);
      return load(id.slice(2));
    },
    module,
    module.exports,
  );
  cache.set(name, module.exports);
  return module.exports;
}
const { TownHUD } = load('TownHUD');
const { TownController } = load('TownController');
const { ToolRouter } = load('ToolRouter');
const { createUiState } = load('UiContracts');
const baseline = game.createDemoGame(60000);
function fixture(width = 390, height = 667, tab = 'manage', selection = 'building') {
  screen.windowSize = { width, height };
  const state = structuredClone(baseline);
  state.inventory = emptyStock();
  const values = new Map();
  const storage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  const session = new GameSession(
    storage,
    () => 60000,
    () => state,
  );
  const ui = createUiState();
  ui.tab = tab;
  if (selection === 'building') ui.selected = state.buildings[0].id;
  else if (selection === 'pile')
    ui.selectedPile = { x: state.groundStacks[0].x, z: state.groundStacks[0].z };
  else ui.selectedResource = { kind: 'tree', id: state.trees[0].id };
  const root = new Node('Root'),
    commands = [],
    trace = [],
    messages = [];
  const controller = {
    elapsed: 0,
    map: { tick() {} },
    session,
    ui,
    town: { sync() {} },
    deferredLayout: { update: () => false },
    projectSelection() {},
    refresh() {
      TownController.prototype.refresh.call(this);
    },
  };
  const hud = (controller.hud = new TownHUD(
    root,
    (text) => {
      messages.push(text);
      session.message = text;
      controller.refresh();
    },
    (t) => TownController.prototype.changeTab.call(controller, t),
  ));
  const router = (controller.tools = new ToolRouter(root, session, {}, {}, ui, () =>
    controller.refresh(),
  ));
  controller.handlers = {
    command(c) {
      commands.push(c);
      session.run(c);
      controller.refresh();
    },
    cancel() {
      TownController.prototype.cancel.call(controller);
    },
  };
  for (const method of ['closeDetails', 'openDetails', 'render']) {
    const original = hud[method];
    hud[method] = function (...args) {
      trace.push(method);
      return original.apply(this, args);
    };
  }
  const begin = router.begin;
  router.begin = function (...args) {
    trace.push('begin');
    const result = begin.apply(this, args);
    trace.push(`accepted:${result}`);
    return result;
  };
  hud.setToolHandlers(router);
  hud.layout();
  // Model Canvas.alignCanvasWithScreen: local HUD origin is the viewport centre.
  hud.canvas.setPosition(width / 2, height / 2);
  controller.refresh();
  function nodes(node = root) {
    return [node, ...node.children.flatMap((n) => nodes(n))];
  }
  function hit(point) {
    return nodes()
      .reverse()
      .find(
        (n) =>
          n.activeInHierarchy &&
          n.events.has('start') &&
          n.getComponent(UITransform)?.hitTest(point),
      );
  }
  function event(point, id = 7) {
    return {
      getID: () => id,
      getAllTouches: () => [{}],
      getLocation: () => point,
      getUILocation: () => point,
      getEventCode: () => 'end',
    };
  }
  function deliver(node, type, point, id = 7) {
    const e = event(point, id);
    const ancestors = [];
    for (let n = node.parent; n; n = n.parent) ancestors.unshift(n);
    for (const n of ancestors) n.emit(type, e, true);
    node.emit(type, e);
  }
  function tap(node, id = 7) {
    const point = node.worldPosition;
    assert.ok(
      point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height,
      'Tap is inside the viewport',
    );
    assert.equal(
      hit(point),
      node,
      `${node.name} must be the top visible hit at ${JSON.stringify(point)}`,
    );
    deliver(node, 'start', point, id);
    deliver(node, 'end', point, id);
    return { node, point, id };
  }
  function cropNode(crop) {
    const n = hud.tools.right.entries.find((e) => e.kind === crop).node;
    for (let i = 0; !n.activeInHierarchy && i < 9; i++) tap(hud.tools.right.pager);
    assert.ok(n.activeInHierarchy);
    return n;
  }
  function open(crop, id = 7) {
    const tile = cropNode(crop);
    trace.length = 0;
    tap(tile, id);
    assert.deepEqual(trace, [
      'closeDetails',
      'begin',
      'render',
      'accepted:false',
      'openDetails',
      'render',
    ]);
  }
  function buy(crop) {
    return hud.bottom.buttons.find((b) => b.title.string.startsWith(`${game.CROPS[crop].label} ×1`))
      .node;
  }
  const { bindCollections } = load('CollectionBinding');
  const events = [];
  bindCollections(
    session,
    { project: () => ({ x: width / 2, y: height - 150 }) },
    hud,
    () => controller.refresh(),
    { naturalOrigin: () => ({ x: 1, y: 1, z: 1 }), dropOrigin: () => ({ x: 1, y: 0.03, z: 1 }) },
  );
  const binding = session.collectionListener;
  session.setCollectionListener((e) => {
    events.push(e);
    binding(e);
  });
  const start = startedFlights.length;
  function step(dt = 0) {
    TownController.prototype.tick.call(controller, dt);
  }
  function starts() {
    return startedFlights.slice(start);
  }
  function recoverPile(warehouse = true) {
    const pile = session.state.groundStacks[0];
    const { StackDrag } = load('StackDrag');
    const drag = Object.create(StackDrag.prototype);
    Object.assign(drag, {
      session,
      ui,
      source: { ...pile, id: `pile:${pile.x}:${pile.z}` },
      sourceInvalid: false,
      dropTargets: new Map(),
      ghost: null,
      ring: null,
      products: hud,
      town: {
        pickBuilding: () =>
          warehouse ? session.state.buildings.find((b) => b.kind === 'expandedWarehouse').id : null,
        setLiftedStack() {},
      },
      refresh: () => controller.refresh(),
    });
    const id = drag.source.id;
    drag.drop(id, {}, { x: width / 2, y: height - 150 });
    return { pile, drag, id };
  }
  return {
    step,
    starts,
    events,
    recoverPile,
    state,
    session,
    storage,
    values,
    ui,
    hud,
    router,
    commands,
    messages,
    controller,
    tap,
    hit,
    deliver,
    open,
    buy,
  };
}

module.exports = {
  fixture,
  game,
  GameSession,
  scene: { Node, UITransform, screen, dependencies, load },
};
