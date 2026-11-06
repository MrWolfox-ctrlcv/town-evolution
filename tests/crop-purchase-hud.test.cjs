/** Source-level HUD integration: production listeners, layout, actions and persistence.
 * Engine rendering/tween timing and unrelated HUD ornaments are narrow doubles,
 * not a browser/GPU/pixel test. Pointer targets are chosen by screen-space hitTest.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const game = require('../.domain-build/domain/game.js');
const { emptyStock } = require('../.domain-build/domain/commerce.js');
const { GameSession } = require('../.domain-build/application/GameSession.js');
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
  setScale() {}
  on(type, fn, owner, capture = false) {
    this.events.set(type, [...(this.events.get(type) ?? []), { fn, owner, capture }]);
  }
  emit(type, e, capture = false) {
    for (const l of this.events.get(type) ?? []) if (l.capture === capture) l.fn.call(l.owner, e);
  }
}
class UITransform {
  setContentSize(width, height) {
    Object.assign(this, { width, height });
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
  regions() {
    return [];
  }
}
class IdleDrag {
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
    view: { resizeWithBrowserSize() {}, setDesignResolutionSize() {} },
    Tween: { stopAllByTarget() {} },
    tween(target) {
      return {
        to(_duration, values) {
          this.values = values;
          return this;
        },
        start() {
          Object.assign(target, this.values);
        },
      };
    },
  },
  './Palette': { PALETTE: {}, color: (v) => v },
  './ActionArtwork': { ActionArtwork: Artwork, actionIcon: (text) => text },
  './TrayIcons': {
    TRAY_LABELS: { vegetable: '胡萝卜', wheat: '小麦', lettuce: '生菜' },
    TrayIcons: class {
      draw() {}
    },
  },
  './FarmTools': { FarmTools: IdleDrag },
  './StockDrag': { StockDrag: IdleDrag },
  './ToolUseDrag': { ToolUseDrag: IdleDrag },
  './V6TerrainTool': { V6TerrainTool: IdleDrag },
  './TownView': {},
  './MapCamera': {},
  './ObjectDrag': {},
  './CollectionBinding': {},
  ...Object.fromEntries(
    ['RadialActions', 'StatusToast', 'ResourceCounters', 'CollectionFlights', 'RecipeHandbook'].map(
      (name) => [`./${name}`, { [name]: Ornament }],
    ),
  ),
};
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const { outputText } = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, `../assets/scripts/presentation/${name}.ts`), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  );
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (id) => {
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      if (id.startsWith('../')) return require(`../.domain-build/${id.slice(3)}.js`);
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
function fixture(width, height, tab, selection = 'building') {
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
  return {
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
for (const [width, height] of [
  [390, 844],
  [844, 390],
  [390, 480],
])
  for (const tab of ['manage', 'orders', 'tools'])
    for (const crop of game.CROP_KEYS)
      test(`${width}x${height} ${tab}: visible empty ${crop} routes through HUD, opens correctly and buys once`, () => {
        const f = fixture(
          width,
          height,
          tab,
          { manage: 'building', orders: 'pile', tools: 'tree' }[tab],
        );
        const before = game.exportSave(f.session.state),
          coins = f.session.state.coins;
        if (tab !== 'manage')
          assert.equal(f.hud.bottom.heading.string, { orders: '订单', tools: '工具与小镇' }[tab]);
        f.open(crop, width === 390 ? 7 : 0);
        assert.equal(f.ui.cropShopOpen, true);
        assert.match(f.hud.bottom.heading.string, /^购买作物/);
        assert.equal(f.hud.bottom.context.activeInHierarchy, true);
        assert.equal(f.hud.bottom.rotate.node.activeInHierarchy, false);
        assert.equal(f.hud.radial.data.target, null, 'No stale object actions');
        assert.equal(f.router.active, false);
        assert.equal(f.hud.tools.ghost.active, false);
        assert.equal(game.exportSave(f.session.state), before);
        assert.equal(f.hud.coversMapPoint(f.hud.bottom.context.worldPosition), true);
        assert.equal(
          f.hud.coversMapPoint({ x: width / 2, y: height - 70 }),
          false,
          'Uncovered map remains available',
        );
        const l = f.hud.bottom.screen;
        const obscured = l.width - l.panelWidth < 144 && l.height - 92 - l.panelHeight < 430;
        assert.equal(f.hud.tools.right.root.activeInHierarchy, !obscured);
        assert.equal(f.hud.tools.left.root.activeInHierarchy, !obscured);
        if (obscured) {
          assert.equal(
            f.hud.tools.regions().length,
            0,
            'Hidden trays cannot intercept map touches',
          );
          const tile = f.hud.tools.right.entries.find((e) => e.kind === crop).node;
          assert.notEqual(
            f.hit(tile.worldPosition),
            tile,
            'Screen hit selection excludes the covered product',
          );
        }
        const released = f.tap(f.buy(crop));
        f.deliver(released.node, 'end', released.point, released.id);
        assert.equal(f.commands.length, 1);
        assert.equal(f.session.state.inventory[crop], 1);
        assert.equal(f.session.state.coins, coins - game.CROPS[crop].buy);
        for (const key of ['buildings', 'trees', 'naturalResources', 'groundStacks'])
          assert.deepEqual(f.session.state[key], f.state[key]);
        assert.deepEqual(new GameSession(f.storage, () => 60000).state, f.session.state);
      });

for (const [width, height] of [
  [390, 844],
  [844, 390],
  [390, 480],
])
  for (const tab of ['orders', 'tools'])
    test(`${width}x${height} ${tab}: cancelled buy, visible close and empty-stock reopen never spend`, () => {
      const f = fixture(width, height, tab);
      const before = game.exportSave(f.session.state);
      f.open('wheat');
      const b = f.buy('wheat'),
        point = b.worldPosition;
      assert.equal(f.hit(point), b);
      f.deliver(b, 'start', point);
      f.deliver(b, 'cancel', point);
      f.deliver(b, 'end', point);
      assert.equal(f.commands.length, 0);
      const close = f.hud.bottom.buttons.find((b) => b.title.string === '关闭').node;
      f.tap(close);
      assert.equal(f.ui.cropShopOpen, false);
      assert.equal(
        f.hud.bottom.heading.string,
        { orders: '订单', tools: '工具与小镇' }[tab],
        'Leaving the shop restores the original tab title',
      );
      // The shelf's own X is the visible way to uncover compact-screen trays.
      if (!f.hud.tools.right.root.activeInHierarchy) f.tap(f.hud.bottom.closeButton.node);
      f.open('wheat');
      assert.match(f.hud.bottom.heading.string, /^购买作物/);
      assert.equal(game.exportSave(f.session.state), before);
      f.tap(f.buy('wheat'));
      assert.equal(f.commands.length, 1);
    });

for (const reason of ['coins', 'capacity'])
  test(`HUD ${reason} failure stays disabled and does not dispatch or alter saved bytes`, () => {
    const f = fixture(390, 844, 'tools');
    if (reason === 'coins') f.state.coins = 0;
    else f.state.inventory.wood = game.getCapacity(f.state);
    f.session.save();
    const before = game.exportSave(f.session.state),
      saved = [...f.values];
    f.open('lettuce');
    f.tap(f.buy('lettuce'));
    assert.equal(f.commands.length, 0);
    assert.match(f.messages.at(-1), reason === 'coins' ? /金币不足/ : /仓库空间不足/);
    assert.equal(game.exportSave(f.session.state), before);
    assert.deepEqual([...f.values], saved);
  });

test('HUD storage failure surfaces unsaved status and save retry does not buy twice', () => {
  const f = fixture(390, 844, 'manage');
  f.session.save();
  const saved = [...f.values],
    set = f.storage.setItem;
  f.open('vegetable');
  f.storage.setItem = () => {
    throw new Error('storage unavailable');
  };
  const release = f.tap(f.buy('vegetable'));
  f.deliver(release.node, 'end', release.point);
  assert.equal(f.commands.length, 1);
  assert.equal(f.session.hasUnsavedChanges, true);
  assert.match(f.hud.message.data, /保存失败/);
  assert.deepEqual([...f.values], saved);
  const purchased = game.exportSave(f.session.state);
  f.storage.setItem = set;
  assert.equal(f.session.save(), true);
  assert.equal(game.exportSave(f.session.state), purchased);
  assert.deepEqual(new GameSession(f.storage, () => 60000).state, f.session.state);
});
