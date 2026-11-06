/** Real tray, router, menu, button and GameSession code; scene drawing is doubled, not GPU tested. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const game = require('../.domain-build/domain/game.js');
const { GameSession } = require('../.domain-build/application/GameSession.js');
const { emptyStock } = require('../.domain-build/domain/commerce.js');
class Node {
  static EventType = {
    TOUCH_START: 'start',
    TOUCH_MOVE: 'move',
    TOUCH_END: 'end',
    TOUCH_CANCEL: 'cancel',
  };
  constructor(name) {
    this.name = name;
    this.children = [];
    this.events = new Map();
    this.components = [];
    this.active = true;
  }
  addChild(n) {
    n.parent = this;
    this.children.push(n);
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
    return this.children.find((n) => n.name === name);
  }
  get activeInHierarchy() {
    return this.active && (!this.parent || this.parent.activeInHierarchy);
  }
  setPosition() {}
  on(type, callback, owner) {
    this.events.set(type, [...(this.events.get(type) ?? []), (e) => callback.call(owner, e)]);
  }
  emit(type, event) {
    for (const callback of this.events.get(type) ?? []) callback(event);
  }
}
class UITransform {
  setContentSize() {}
  hitTest() {
    return false;
  }
}
class Graphics {
  clear() {}
  roundRect() {}
  fill() {}
}
class Label {
  static Overflow = { SHRINK: 1 };
  static HorizontalAlign = { LEFT: 0, CENTER: 1 };
  static VerticalAlign = { CENTER: 1 };
}
class IdleDrag {
  begin() {}
  cancel() {}
  move() {}
  end() {}
}
const labels = { wood: '木材', vegetable: '胡萝卜', wheat: '小麦', lettuce: '生菜' };
const dependencies = {
  cc: {
    Node,
    UITransform,
    Graphics,
    Label,
    LabelOutline: class {},
    Layers: { Enum: { UI_2D: 1 } },
  },
  './Palette': { PALETTE: {}, color: (v) => v },
  './ActionArtwork': {},
  './TrayIcons': {
    TRAY_LABELS: labels,
    TrayIcons: class {
      draw() {}
    },
  },
  './FarmTools': { FarmTools: IdleDrag },
  './StockDrag': { StockDrag: IdleDrag },
  './ToolUseDrag': { ToolUseDrag: IdleDrag },
  './TownView': {},
  './TownHUD': {},
  './ObjectDrag': {},
  './MapCamera': {},
  './CollectionBinding': {},
};
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const { outputText } = ts.transpileModule(
    fs.readFileSync(`assets/scripts/presentation/${name}.ts`, 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    },
  );
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (id) => {
      if (Object.hasOwn(dependencies, id)) return dependencies[id];
      if (id.startsWith('../')) return require(`../.domain-build/${id.slice(3)}.js`);
      assert.ok(id.startsWith('./'), id);
      return load(id.slice(2));
    },
    module,
    module.exports,
  );
  cache.set(name, module.exports);
  return module.exports;
}
const { ToolTray } = load('ToolTray');
const { ToolRouter } = load('ToolRouter');
const { actions, rotationAction } = load('HudActions');
const { description } = load('HudDescription');
const { objectTarget } = load('ObjectContext');
const { createUiState } = load('UiContracts');
const { TownController } = load('TownController');
const { ActionButton } = load('Widgets');
const baseline = game.createDemoGame(60000);
const event = (id = 7) => ({
  getID: () => id,
  getAllTouches: () => [{}],
  getUILocation: () => ({ x: 0, y: 0 }),
  getLocation: () => ({ x: 0, y: 0 }),
  getEventCode: () => 'end',
});
function fixture(kind = 'pile', crop = 'wheat') {
  const state = structuredClone(baseline);
  state.inventory = emptyStock();
  const storageData = new Map();
  const storage = {
    getItem: (k) => storageData.get(k) ?? null,
    setItem: (k, v) => storageData.set(k, v),
    removeItem: (k) => storageData.delete(k),
  };
  const session = new GameSession(
    storage,
    () => 60000,
    () => state,
  );
  const ui = createUiState();
  if (kind === 'building') ui.selected = state.buildings[0].id;
  if (kind === 'pile') {
    const p = state.groundStacks[0];
    ui.selectedPile = { x: p.x, z: p.z };
  }
  if (kind === 'tree') ui.selectedResource = { kind: 'tree', id: state.trees[0].id };
  if (kind === 'natural')
    ui.selectedResource = { kind: 'natural', id: state.naturalResources[0].id };
  const parent = new Node('Canvas'),
    commands = [],
    messages = [];
  const controller = { ui, session, refresh() {} };
  const handlers = {
    command(c) {
      commands.push(c);
      session.run(c);
    },
    cancel() {
      TownController.prototype.cancel.call(controller);
    },
  };
  const router = new ToolRouter(parent, session, {}, {}, ui, () => {});
  const tray = new ToolTray(parent);
  tray.setHandlers(router);
  const tile = tray.right.entries.find((e) => e.kind === crop).node;
  function open(id = 7) {
    tile.emit('start', event(id));
    tile.emit('end', event(id));
  }
  function button(action) {
    const b = new ActionButton(parent, (text) => messages.push(text));
    b.set(action);
    return b;
  }
  function tap(b, id = 7) {
    b.node.emit('start', event(id));
    b.node.emit('end', event(id));
  }
  const menu = () => actions(session, ui, handlers);
  const buy = () => menu().find((a) => a.text.startsWith(`${game.CROPS[crop].label} ×1`));
  return {
    state,
    session,
    storage,
    storageData,
    ui,
    router,
    tray,
    commands,
    messages,
    open,
    menu,
    buy,
    button,
    tap,
  };
}
for (const kind of ['pile', 'tree', 'natural', 'building'])
  for (const crop of game.CROP_KEYS)
    test(`${kind} selection cannot hide empty ${crop} purchase controls or carry rotation into the menu`, () => {
      const f = fixture(kind, crop),
        before = game.exportSave(f.session.state);
      f.open();
      assert.equal(f.ui.cropShopOpen, true);
      assert.equal(f.router.active, false);
      assert.equal(f.tray.ghost.active, false);
      assert.equal(game.exportSave(f.session.state), before, 'Opening never buys');
      assert.match(description(f.session, f.ui), /^购买作物/);
      assert.equal(objectTarget(f.session, f.ui), null);
      assert.equal(rotationAction(f.session, f.ui, {}), null);
      const action = f.buy();
      assert.ok(action, 'The requested crop can actually be purchased');
      assert.equal(action.enabled, true);
      const button = f.button(action);
      f.tap(button);
      button.node.emit('end', event());
      assert.equal(f.commands.length, 1);
      assert.equal(f.session.state.inventory[crop], 1);
      assert.equal(f.session.state.coins, f.state.coins - game.CROPS[crop].buy);
      assert.deepEqual(f.session.state.groundStacks, f.state.groundStacks);
      assert.deepEqual(f.session.state.trees, f.state.trees);
      assert.deepEqual(f.session.state.naturalResources, f.state.naturalResources);
      assert.deepEqual(f.session.state.buildings, f.state.buildings);
      assert.deepEqual(new GameSession(f.storage, () => 60000).state, f.session.state);
    });

test('cancelled purchase touches and closing the menu spend nothing; mouse reopen still buys once', () => {
  const f = fixture('pile'),
    before = game.exportSave(f.session.state);
  f.open(0);
  assert.ok(f.buy());
  const button = f.button(f.buy());
  button.node.emit('start', event(0));
  button.node.emit('cancel', event(0));
  button.node.emit('end', event(0));
  assert.equal(f.commands.length, 0);
  f.tap(f.button(f.menu().find((a) => a.text === '关闭')), 0);
  assert.equal(f.ui.cropShopOpen, false);
  assert.equal(game.exportSave(f.session.state), before);
  f.open(0);
  f.tap(f.button(f.buy()), 0);
  assert.equal(f.commands.length, 1);
  assert.equal(f.session.state.inventory.wheat, 1);
});

for (const reason of ['coins', 'capacity'])
  test(`${reason} failure leaves purchase visible but disabled, with all state and saved bytes unchanged`, () => {
    const f = fixture('tree');
    if (reason === 'coins') f.state.coins = 0;
    else f.state.inventory.wood = game.getCapacity(f.state);
    assert.equal(f.session.save(), true);
    const before = game.exportSave(f.session.state);
    f.open();
    const action = f.buy();
    assert.ok(action);
    assert.equal(action.enabled, false);
    assert.match(action.reason, reason === 'coins' ? /金币不足/ : /仓库空间不足/);
    f.tap(f.button(action));
    assert.equal(f.commands.length, 0, 'Disabled button never dispatches');
    assert.match(f.messages.at(-1), reason === 'coins' ? /金币不足/ : /仓库空间不足/);
    assert.equal(game.exportSave(f.session.state), before);
    assert.deepEqual(new GameSession(f.storage, () => 60000).state, f.session.state);
    f.tap(f.button(f.menu().find((a) => a.text === '关闭')));
    assert.equal(f.ui.cropShopOpen, false);
  });

test('a previously enabled buy button is revalidated if coins or capacity change before release', () => {
  for (const reason of ['coins', 'capacity']) {
    const f = fixture('natural');
    f.open();
    const action = f.buy();
    assert.ok(action?.enabled);
    const button = f.button(action);
    button.node.emit('start', event());
    if (reason === 'coins') f.state.coins = 0;
    else f.state.inventory.wood = game.getCapacity(f.state);
    assert.equal(f.session.save(), true);
    const before = game.exportSave(f.session.state);
    button.node.emit('end', event());
    assert.equal(f.commands.length, 1);
    assert.match(f.session.message, reason === 'coins' ? /金币不足/ : /仓库空间不足/);
    assert.equal(game.exportSave(f.session.state), before);
    assert.deepEqual(new GameSession(f.storage, () => 60000).state, f.session.state);
  }
});

test('purchase save failure remains visible and retry saves once without charging again', () => {
  const f = fixture('pile');
  assert.equal(f.session.save(), true);
  const saved = [...f.storageData];
  const originalSet = f.storage.setItem;
  f.open();
  f.storage.setItem = () => {
    throw new Error('storage unavailable');
  };
  const b = f.button(f.buy());
  f.tap(b);
  b.node.emit('end', event());
  assert.equal(f.commands.length, 1);
  assert.equal(f.session.state.inventory.wheat, 1);
  assert.equal(f.session.state.coins, f.state.coins - game.CROPS.wheat.buy);
  assert.equal(f.session.hasUnsavedChanges, true);
  assert.match(f.session.statusMessage, /保存失败/);
  assert.deepEqual([...f.storageData], saved, 'Existing saved bytes remain intact');
  const purchased = game.exportSave(f.session.state);
  f.storage.setItem = originalSet;
  assert.equal(f.session.save(), true);
  assert.equal(f.session.hasUnsavedChanges, false);
  assert.equal(game.exportSave(f.session.state), purchased);
  assert.deepEqual(new GameSession(f.storage, () => 60000).state, f.session.state);
});

test('purchase state never displaces a reset, repurpose, tree-placement or tool-shop workflow', () => {
  for (const [property, value, heading, action] of [
    ['resetArmed', true, /重新开始/, /确认重置/],
    ['repurposeId', 'b2', /改建为公共订单板/, /确认改为订单板/],
    ['plantingTree', true, /点一块空地种树/, /取消种树/],
    ['toolShopOpen', true, /工具无限耐久/, /^关闭$/],
  ]) {
    const f = fixture('building');
    f.open();
    f.ui[property] = value;
    assert.match(description(f.session, f.ui), heading);
    assert.match(f.menu()[0].text, action);
    assert.equal(f.buy(), undefined);
    assert.equal(rotationAction(f.session, f.ui, {}), null);
  }
});
