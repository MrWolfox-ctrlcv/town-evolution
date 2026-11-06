/**
 * Source-level presentation integration, not a Cocos/browser/pixel test.
 * Real tray listeners -> router -> drags -> TownView/GroundObjects picking ->
 * GameSession -> domain/storage. Only engine scene/UI/rendering and camera
 * projection are narrow collaborators. Event objects model Creator's documented
 * outside-release CANCEL delivery while retaining hardware END eventCode.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const game = require('../.domain-build/domain/game.js');
const { GameSession } = require('../.domain-build/application/GameSession.js');

const {
  Node: ResourceNode,
  Factory: ResourceFactory,
  ModelPicking: ResourcePicking,
} = require('./helpers/resource-picking-ui.cjs');
class SceneNode extends ResourceNode {
  static EventType = {
    TOUCH_START: 'touch-start',
    TOUCH_MOVE: 'touch-move',
    TOUCH_END: 'touch-end',
    TOUCH_CANCEL: 'touch-cancel',
  };
  constructor(name) {
    super(name);
    this.name = name;
    this.children = [];
    this.listeners = new Map();
    this.active = true;
  }
  addChild(child) {
    this.children.push(child);
    child.parent = this;
  }
  on(type, callback, owner) {
    this.listeners.set(type, (event) => callback.call(owner, event));
  }
  emit(type, event) {
    this.listeners.get(type)?.(event);
  }
  getChildByName(name) {
    return this.children.find((node) => node.name === name) ?? null;
  }
  setPosition(...position) {
    this.position = position;
  }
  setWorldPosition(position) {
    this.worldPosition = position;
  }

  addComponent(Type) {
    return new Type();
  }
  getComponent() {
    return { setContentSize() {}, clear() {}, roundRect() {}, stroke() {} };
  }
  destroy() {
    if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this);
    this.destroyed = true;
  }
}
class Factory extends ResourceFactory {
  shape(parent, name, ...position) {
    const node = new SceneNode(name);
    node.setPosition(...position.slice(0, 3));
    parent.addChild(node);
    return node;
  }
  building(building) {
    const node = new SceneNode(building.id);
    const b = building;
    const id = require('../.domain-build/art/BuildingAssets').buildingAssetId(b, 100);
    const asset =
      b.kind === 'farm'
        ? `${b.farmSize === 6 ? 'farm-large-bed' : 'farm-cell-bed'}${b.irrigated ? '-water' : ''}`
        : id;
    const visual = this.asset(asset, b.kind === 'farm' ? 'Soil' : 'BuildingMesh');
    visual.setRotationFromEuler(0, b.rotation * 90, 0);
    const { width, depth } = game.footprint(b);
    node.setPosition(b.x + width / 2, 0, b.z + depth / 2);
    node.addChild(visual);
    return node;
  }
  dispose() {}
}
class Column {
  constructor(parent) {
    this.root = new SceneNode();
    this.entries = [];
    parent.addChild(this.root);
  }
  add(kind, name) {
    const entry = { kind, node: new SceneNode(name), text: {} };
    this.entries.push(entry);
    this.root.addChild(entry.node);
    return entry;
  }
  show() {}
  layout() {}
  cancelGesture() {}
  regions() {
    return [
      {
        node: this.root,
        hitTest: (point) => point.x < 0,
      },
    ];
  }
}
class Feedback {
  configure() {}
  chop() {}
  stack() {}
  construct() {}
  clear() {}
}
const cache = new Map();
const collaborators = {
  cc: {
    Node: SceneNode,
    UITransform: class {},
    Graphics: class {},
    Vec2: class {
      constructor(x, y) {
        Object.assign(this, { x, y });
      }
    },
    Vec3: class {
      constructor(x, y, z) {
        Object.assign(this, { x, y, z });
      }
    },
  },
  './ModelFactory': { ModelFactory: Factory },
  './ModelPicking': { ModelPicking: ResourcePicking },

  './TownFeedback': { TownFeedback: Feedback },
  './IslandView': {
    IslandView: class {
      sync() {}
    },
  },
  './Palette': { color: (value) => value },
  './Widgets': {
    uiNode: (name, parent) => {
      const node = new SceneNode(name);
      parent.addChild(node);
      return node;
    },
  },
  './TrayColumn': { TrayColumn: Column },
  './TrayIcons': {
    TrayIcons: class {
      draw() {}
    },
  },
};
function presentation(name) {
  if (cache.has(name)) return cache.get(name);
  const filename = path.resolve(__dirname, `../assets/scripts/presentation/${name}.ts`);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (id) => {
      if (Object.hasOwn(collaborators, id)) return collaborators[id];
      if (id.startsWith('../')) return require(`../.domain-build/${id.slice(3)}.js`);
      assert.ok(id.startsWith('./'), `Unexpected presentation import ${id}`);
      return presentation(id.slice(2));
    },
    module,
    module.exports,
  );
  cache.set(name, module.exports);
  return module.exports;
}
const { ToolTray } = presentation('ToolTray');
const { ToolRouter } = presentation('ToolRouter');
const { TownView } = presentation('TownView');
const E = SceneNode.EventType;

function fixture(terrainVersion = 1) {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const session = new GameSession(
    storage,
    () => 100,
    () => game.createGame(100, 1, terrainVersion),
  );
  const root = new SceneNode('Root');
  const town = new TownView(root);
  const refresh = () => town.sync(session.state, null, null, 100);
  refresh();
  const map = {
    cancelGesture() {},
    contains: (point) => point.x >= 0,
    screenRay: (point) =>
      point.ray ?? { o: { x: point.x, y: 20, z: point.y }, d: { x: 0, y: -1, z: 0 } },
    ground: (point) => point.ground ?? { x: point.x, z: point.y },
  };
  const router = new ToolRouter(root, session, map, town, {}, refresh);
  const tray = new ToolTray(root);
  tray.layout(1280, 800, 70);
  tray.setHandlers(router);
  const tile = (kind) =>
    [...tray.left.entries, ...tray.right.entries].find((entry) => entry.kind === kind).node;
  function send(kind, type, point, id = 0, eventCode = type, simulate) {
    tile(kind).emit(type, {
      ...(simulate === undefined ? {} : { simulate }),
      getID: () => id,
      getLocation: () => point,
      // Analytic ray coordinates use the island origin; UI has a screen inset.
      getUILocation: () => ({ x: point.x + 100, y: point.y + 100 }),
      getAllTouches: () => [{ id }],
      getEventCode: () => eventCode,
    });
  }
  function drag(kind, point, id = 0, finish = E.TOUCH_END) {
    send(kind, E.TOUCH_START, { x: -10, y: 30 }, id);
    const before = game.exportSave(session.state);
    send(kind, E.TOUCH_MOVE, point, id);
    assert.equal(game.exportSave(session.state), before, 'Hovering never commits');
    send(kind, E.TOUCH_CANCEL, point, id, finish);
    return before;
  }
  return { session, storage, values, town, map, router, tray, send, drag, tile };
}
function cellForRecipe(session, amount, tool = 'hammer') {
  const stocked = structuredClone(session.state);
  stocked.inventory.wood = amount;
  for (let z = 0; z < game.CONFIG.gridSize; z++)
    for (let x = 0; x < game.CONFIG.gridSize; x++) {
      const dropped = game.dispatch(
        stocked,
        { type: 'dropProduct', item: 'wood', quantity: amount, x, z },
        100,
      );
      if (dropped.ok && game.dispatch(dropped.state, { type: 'useTool', tool, x, z }, 100).ok)
        return { x: x + 0.5, y: z + 0.5 };
    }
  assert.fail('No valid crafting cell in starting town');
}
function harvest(f, count, id) {
  for (let i = 0; i < count; i++) {
    const tree = f.session.state.trees.find(
      (tree) => f.town.pickTree(f.map.screenRay({ x: tree.x + 0.5, y: tree.z + 0.5 })) === tree.id,
    );
    assert.ok(tree, 'An actual tree mesh is pickable');
    const wood = f.session.state.inventory.wood;
    f.drag('axe', { x: tree.x + 0.5, y: tree.z + 0.5 }, id);
    assert.equal(f.session.state.inventory.wood, wood + 2, f.session.message);
  }
}

for (const [input, id] of [
  ['mouse-derived touch', 0],
  ['touch', 7],
])
  for (const terrainVersion of [1, 3])
    test(`${input}, terrain ${terrainVersion}: source-tile CANCEL with hardware END completes chop, stock drops and all wood recipes`, () => {
      for (const [amount, kind, recipe, tool] of [
        [1, 'orderBoard', 'build-order-board', 'hammer'],
        [2, 'crate', 'build-crate', 'hammer'],
        [3, 'handcart', 'build-handcart', 'saw'],
        [4, 'boat', 'build-boat', 'saw'],
        [3, 'woodenPier', 'build-wooden-pier', 'hammer'],
        [4, 'house', 'build-house', 'hammer'],
      ]) {
        const f = fixture(terrainVersion);
        harvest(f, Math.ceil(amount / 2), id);
        const point = cellForRecipe(f.session, amount, tool);
        const wood = f.session.state.inventory.wood;
        const seeds = f.session.state.inventory.treeSeed;
        const tools = structuredClone(f.session.state.tools);
        for (let i = 0; i < amount; i++) {
          f.drag('wood', point, id);
          assert.equal(f.session.state.inventory.wood, wood - i - 1, f.session.message);
          assert.equal(
            f.session.state.groundStacks.find(
              (pile) => pile.x === Math.floor(point.x) && pile.z === Math.floor(point.y),
            )?.amount,
            i + 1,
          );
        }
        assert.ok(
          f.town.pickStack(f.map.screenRay(point)),
          'Real pile triangles are hittable after refresh',
        );
        const plan = game.toolCraftPlan(
          f.session.state,
          tool,
          Math.floor(point.x),
          Math.floor(point.y),
        );
        assert.equal(plan.reason, null);
        f.drag(tool, point, id);
        const built = f.session.state.buildings.find(
          (building) => building.id === plan.building.id,
        );
        assert.equal(built?.kind, kind, f.session.message);
        assert.deepEqual(built, plan.building);
        assert.equal(f.session.state.groundStacks.length, 0);
        assert.equal(f.session.state.fusion.discoveries[recipe].count, 1);
        assert.equal(f.session.state.inventory.treeSeed, seeds);
        assert.deepEqual(f.session.state.tools, tools);
        const after = game.exportSave(f.session.state);
        f.send(tool, E.TOUCH_CANCEL, point, id, E.TOUCH_END);
        f.send(tool, E.TOUCH_END, point, id);
        assert.equal(
          game.exportSave(f.session.state),
          after,
          'Duplicate release does not repeat commands',
        );
        assert.equal(f.router.active, false);
        assert.equal(f.tray.ghost.active, false);
        assert.equal(f.tray.returnTarget.active, false);
        assert.deepEqual(new GameSession(f.storage, () => 100).state, f.session.state);
      }
    });

test('real hardware cancellation, tray return and foreign releases preserve stocks and allow a new gesture', () => {
  const f = fixture();
  harvest(f, 1, 7);
  const point = cellForRecipe(f.session, 2);
  for (const kind of ['wood', 'hammer', 'saw', 'axe']) {
    const before = f.drag(kind, point, 7, E.TOUCH_CANCEL);
    assert.equal(game.exportSave(f.session.state), before);
    assert.equal(f.router.active, false);
    f.send(kind, E.TOUCH_CANCEL, point, 7, E.TOUCH_END);
    assert.equal(game.exportSave(f.session.state), before);
    f.drag(kind, { x: -10, y: 30 }, 7);
    assert.equal(game.exportSave(f.session.state), before, 'Returning to tray consumes nothing');
  }
  f.send('wood', E.TOUCH_START, { x: -10, y: 30 }, 7);
  const before = game.exportSave(f.session.state);
  f.send('wood', E.TOUCH_CANCEL, point, 8, E.TOUCH_END);
  assert.equal(f.router.active, true);
  assert.equal(game.exportSave(f.session.state), before);
  f.send('wood', E.TOUCH_END, point, 7);
  assert.equal(f.session.state.groundStacks[0].amount, 1);
  f.drag('hammer', point, 7);
  assert.equal(f.session.state.buildings.at(-1).kind, 'orderBoard');
  assert.deepEqual(new GameSession(f.storage, () => 100).state, f.session.state);
});

test('hammer follows the visible wood pile hit rather than a different ground-projection cell', () => {
  const f = fixture();
  harvest(f, 1, 0);
  const point = cellForRecipe(f.session, 1);
  f.drag('wood', point, 0);
  // A shallow view can intersect the raised mesh before reaching a neighboring
  // ground cell. The production pickers, not a supplied pile ID, resolve this ray.
  const angled = {
    ...point,
    ray: { o: { x: point.x - 98.75, y: 20, z: point.y }, d: { x: 5, y: -1, z: 0 } },
    ground: { x: point.x + 1.25, z: point.y },
  };
  const pile = f.town.pickStack(f.map.screenRay(angled));
  assert.ok(pile, 'Actual pile triangles intersect the shallow ray');
  assert.notEqual(pile.x, Math.floor(angled.ground.x));
  f.drag('hammer', angled, 0);
  assert.equal(f.session.state.buildings.at(-1).kind, 'orderBoard', f.session.message);
  assert.equal(f.session.state.buildings.at(-1).x, pile.x);
  assert.equal(f.session.state.groundStacks.length, 0);
});

function syncNaturalSurface(f) {
  const { ContinuousResources } = require('../.domain-build/art/ContinuousResources');
  const { terrainAt } = require('../.domain-build/domain/terrain');
  const state = f.session.state;
  f.town.island.naturalSurface = new ContinuousResources(40, state.mapSeed, (x, z) =>
    terrainAt(x, z, state.mapSeed, state.terrainVersion),
  ).sync(state.naturalResources).naturalSurface;
  f.town.sync(state, null, null, 100);
}
for (const id of [0, 7])
  test(`visible wood behind tree canopy air can be selected, long-pressed and hammered (${id})`, () => {
    const f = fixture(3),
      state = structuredClone(f.session.state);
    state.inventory.wood = 1;
    const dropped = game.dispatch(
      state,
      { type: 'dropProduct', item: 'wood', quantity: 1, x: 9, z: 21 },
      100,
    );
    assert.equal(dropped.ok, true, dropped.error);
    f.session.state = game.importSave(game.exportSave(dropped.state), 100);
    syncNaturalSurface(f);
    const point = {
      x: 9.5,
      y: 21.5,
      ray: {
        o: { x: 19.346091082202307, y: 13.10294047558195, z: 33.30609451690152 },
        d: { x: -0.4869206048708966, y: -0.6492274731611954, z: -0.584304725845076 },
      },
    };
    assert.equal(f.town.pickTree(point.ray), null);
    assert.equal(f.town.pickNatural(point.ray), null);
    assert.equal(f.town.pickStack(point.ray)?.id, 'pile:9:21');
    const { createUiState } = presentation('UiContracts'),
      { pickObject } = presentation('ObjectContext'),
      { StackDrag } = presentation('StackDrag'),
      ui = createUiState();
    pickObject(ui, f.town, point.ray);
    assert.deepEqual(ui.selectedPile, { x: 9, z: 21 });
    assert.equal(ui.selectedResource, null);
    const stack = new StackDrag(new SceneNode('Root'), f.session, ui, f.town, () => {}, {});
    assert.equal(stack.candidate(point.ray), 'pile:9:21');
    const trees = structuredClone(f.session.state.trees),
      plan = game.toolCraftPlan(f.session.state, 'hammer', 9, 21);
    assert.equal(plan.reason, null);
    f.drag('hammer', point, id);
    assert.deepEqual(f.session.state.buildings.at(-1), plan.building);
    assert.equal(f.session.state.groundStacks.length, 0);
    assert.deepEqual(f.session.state.trees, trees);
    assert.deepEqual(new GameSession(f.storage, () => 100).state, f.session.state);
  });

test('dropping an axe in visible air beside a tree never chops or changes the save', () => {
  const f = fixture(3);
  syncNaturalSurface(f);
  const point = {
    x: 9,
    y: 22.5,
    ray: {
      o: { x: 18.738412097417932, y: 13.884549463223909, z: 34.18609451690152 },
      d: { x: -0.4869206048708966, y: -0.6492274731611954, z: -0.584304725845076 },
    },
    ground: { x: 8.325000000000001, z: 21.69 },
  };
  assert.equal(f.town.pickTree(point.ray), null);
  f.session.save();
  const saved = [...f.values];
  for (const id of [0, 7]) {
    const before = f.drag('axe', point, id);
    assert.equal(game.exportSave(f.session.state), before);
    assert.deepEqual([...f.values], saved);
    assert.equal(f.session.message, '未使用工具');
  }
});

test('a saw over air in an occupied wood tile does not craft through its ground projection', () => {
  const f = fixture(3),
    state = structuredClone(f.session.state);
  state.inventory.wood = 1;
  const dropped = game.dispatch(
    state,
    { type: 'dropProduct', item: 'wood', quantity: 1, x: 9, z: 21 },
    100,
  );
  assert.equal(dropped.ok, true, dropped.error);
  f.session.state = game.importSave(game.exportSave(dropped.state), 100);
  syncNaturalSurface(f);
  const point = { x: 9.69, y: 21.69 };
  assert.equal(f.town.pickStack(f.map.screenRay(point)), null);
  assert.equal(f.town.pickTree(f.map.screenRay(point)), null);
  assert.equal(f.town.pickNatural(f.map.screenRay(point)), null);
  f.session.save();
  const saved = [...f.values];
  const before = f.drag('saw', point, 7);
  assert.equal(game.exportSave(f.session.state), before);
  assert.deepEqual([...f.values], saved);
  assert.equal(f.session.message, '未选中地面材料');
});

function toleranceFixture() {
  const { camera } = require('./helpers/touch-camera.cjs'),
    { markTouchRay } = presentation('TouchPicking'),
    f = fixture(3),
    c = camera(),
    state = structuredClone(f.session.state);
  state.trees = [];
  state.naturalResources = [];
  state.inventory.wood = 1;
  const dropped = game.dispatch(
    state,
    { type: 'dropProduct', item: 'wood', quantity: 1, x: 9, z: 21 },
    100,
  );
  assert.equal(dropped.ok, true, dropped.error);
  f.session.state = game.importSave(game.exportSave(dropped.state), 100);
  f.town.sync(f.session.state, null, null, 100);
  const query = (p) =>
    markTouchRay(c.ray(p), {
      point: p,
      radius: 6,
      project: c.project,
      ray: c.ray,
      contains: c.contains,
    });
  f.map.screenRay = (p) => (p.touch === true ? query(p) : c.ray(p));
  f.map.contains = c.contains;
  const center = c.project({ x: 9.5, y: 0.14, z: 21.5 });
  let point;
  for (const offset of [5, 6, 7, 8, 9, 10, 11]) {
    const candidate = { x: center.x + offset, y: center.y };
    if (!f.town.pickStack(c.ray(candidate)) && f.town.pickStack(query(candidate))) {
      point = candidate;
      break;
    }
  }
  assert.ok(point, 'real mesh is close to the finger but not on its central ray');
  const { StackDrag } = presentation('StackDrag'),
    { createUiState } = presentation('UiContracts'),
    stack = new StackDrag(new SceneNode('Root'), f.session, createUiState(), f.town, () => {}, {});
  assert.equal(stack.candidate(c.ray(point)), null);
  assert.equal(stack.candidate(query(point)), 'pile:9:21');
  f.session.save();
  return { f, point };
}

for (const route of ['mouse', 'web', 'native'])
  for (const adapter of ['known', 'absent', 'unknown'])
    test(`actual ${route} input, ${adapter} adapter: only trusted fingers get nearby wood tolerance`, () => {
      const { f, point } = toleranceFixture();
      const provenance = presentation('InputProvenance');
      const input = require('./helpers/cocos-input-route.cjs')(f.tile('hammer'), E, provenance, {
        adapter,
      });
      collaborators.cc.input = input.input;
      const commands = [];
      let writes = 0;
      const setItem = f.storage.setItem;
      f.storage.setItem = (...args) => {
        writes++;
        return setItem(...args);
      };
      const run = f.session.run.bind(f.session);
      f.session.run = (command) => {
        commands.push(command);
        return run(command);
      };
      const before = game.exportSave(f.session.state);
      const saved = [...f.values];
      const send = (type, p = point) => input.send(route, type, p, 0);
      const restored = () => {
        assert.equal(f.router.active, false);
        assert.equal(f.tray.ghost.active, false);
        assert.equal(f.tray.returnTarget.active, false);
        assert.deepEqual(input.processor.claimedTouchIdList, []);
      };
      try {
        // True hardware cancellation must neither craft nor leave pointer capture.
        if (route !== 'mouse') {
          send(E.TOUCH_START, { x: -10, y: 30 });
          send(E.TOUCH_MOVE);
          send(E.TOUCH_CANCEL);
          restored();
          assert.equal(game.exportSave(f.session.state), before);
          assert.deepEqual([...f.values], saved);
          assert.equal(writes, 0, 'No storage writes before a successful command');
          assert.equal(commands.length, 0);
        }
        send(E.TOUCH_START, { x: -10, y: 30 });
        send(E.TOUCH_MOVE);
        assert.equal(game.exportSave(f.session.state), before, 'Hover never crafts');
        assert.deepEqual([...f.values], saved);
        assert.equal(writes, 0, 'No storage writes before a successful command');
        assert.equal(commands.length, 0);
        send(E.TOUCH_END);
        restored();
        const final = input.delivered.at(-1);
        assert.equal(final.type, E.TOUCH_CANCEL, 'Real node processor rewrites outside END');
        assert.equal(final.code, E.TOUCH_END, 'Original hardware END remains available');
        assert.equal(final.simulate, false, 'Both real fingers and simulated mouse use false');
        assert.equal(final.id, 0, 'A real finger may share the mouse numeric ID');
        if (route !== 'mouse' && adapter === 'known') {
          assert.equal(f.session.state.buildings.at(-1).kind, 'orderBoard');
          assert.equal(f.session.state.groundStacks.length, 0);
          assert.equal(f.session.state.fusion.discoveries['build-order-board'].count, 1);
          assert.equal(commands.length, 1);
          assert.deepEqual(new GameSession(f.storage, () => 100).state, f.session.state);
        } else {
          assert.equal(commands.length, 0, 'Exact pointer miss issues no command');
          assert.equal(writes, 0, 'No storage writes before a successful command');
          assert.equal(game.exportSave(f.session.state), before);
          assert.deepEqual([...f.values], saved);
        }
        assert.equal(final.finger, route !== 'mouse' && adapter === 'known');
        const after = game.exportSave(f.session.state);
        const afterCommands = commands.length;
        send(E.TOUCH_END);
        assert.equal(
          game.exportSave(f.session.state),
          after,
          'Duplicate release never repeats craft',
        );
        assert.equal(commands.length, afterCommands);
      } finally {
        input.release();
        assert.equal(
          input.touchTarget.emit,
          input.originalTouchEmit,
          'Dispose restores source emitter',
        );
        delete collaborators.cc.input;
      }
    });

for (const scenario of [
  'foreign-button-end',
  'multiple-buttons',
  'foreign-mouse-end',
  'mixed-id-zero',
])
  test(`actual sources: ${scenario} cannot commit a tool and a fresh gesture works`, () => {
    const f = fixture();
    harvest(f, 1, 0);
    const point = cellForRecipe(f.session, 1);
    f.drag('wood', point, 0);
    const input = require('./helpers/cocos-input-route.cjs')(
      f.tile('hammer'),
      E,
      presentation('InputProvenance'),
    );
    collaborators.cc.input = input.input;
    const before = game.exportSave(f.session.state),
      saved = [...f.values];
    const commands = [];
    const run = f.session.run.bind(f.session);
    f.session.run = (command) => {
      commands.push(command);
      return run(command);
    };
    let writes = 0;
    const setItem = f.storage.setItem;
    f.storage.setItem = (...args) => {
      writes++;
      return setItem(...args);
    };
    const origin = { x: -10, y: 30 };
    const initialRoute = ['foreign-button-end', 'multiple-buttons'].includes(scenario)
      ? 'mouse'
      : 'web';
    const send = (route, type, p = point, button = 0) => input.send(route, type, p, 0, button);
    try {
      send(initialRoute, E.TOUCH_START, origin);
      send(initialRoute, E.TOUCH_MOVE);
      if (scenario === 'mixed-id-zero') send('mouse', E.TOUCH_START, origin);
      if (scenario === 'multiple-buttons') send('mouse', E.TOUCH_START, origin, 2);
      send(
        'mouse',
        E.TOUCH_END,
        point,
        ['foreign-button-end', 'multiple-buttons'].includes(scenario) ? 2 : 0,
      );
      assert.equal(game.exportSave(f.session.state), before);
      assert.deepEqual([...f.values], saved);
      assert.equal(commands.length, 0, 'A foreign owner never runs a command');
      assert.equal(writes, 0);
      assert.equal(f.router.active, false);
      assert.equal(f.tray.ghost.active, false);
      assert.equal(f.tray.returnTarget.active, false);
      // Finish the original physical contact even if Cocos already released the shared ID.
      send(initialRoute, E.TOUCH_END);
      assert.equal(commands.length, 0);
      assert.deepEqual(input.processor.claimedTouchIdList, []);
      send(initialRoute, E.TOUCH_START, origin);
      send(initialRoute, E.TOUCH_MOVE);
      send(initialRoute, E.TOUCH_END);
      assert.equal(commands.length, 1);
      assert.equal(f.session.state.buildings.at(-1).kind, 'orderBoard');
      assert.equal(f.session.state.groundStacks.length, 0);
      assert.equal(f.session.state.fusion.discoveries['build-order-board'].count, 1);
      assert.deepEqual(new GameSession(f.storage, () => 100).state, f.session.state);
      assert.equal(f.router.active, false);
      assert.equal(f.tray.ghost.active, false);
      assert.deepEqual(input.processor.claimedTouchIdList, []);
    } finally {
      input.release();
      delete collaborators.cc.input;
    }
  });

test('house alternate-anchor hover outline and committed building use the same full footprint', () => {
  const f = fixture();
  // A valid saved town with a tree on the original footprint's right edge.
  const state = game.createGame(100, 1, 1);
  state.trees = [{ id: `t${state.nextTreeId++}`, x: 11, z: 7 }];
  state.naturalResources = [];
  state.groundStacks = [{ x: 10, z: 7, item: 'wood', amount: 4 }];
  f.session.state = game.importSave(game.exportSave(state), 100);
  f.town.sync(f.session.state, null, null, 100);
  const point = { x: 10.5, y: 7.5 };
  const plan = game.toolCraftPlan(f.session.state, 'hammer', 10, 7);
  assert.equal(plan.reason, null);
  assert.deepEqual([plan.building.x, plan.building.z], [9, 7]);
  f.send('hammer', E.TOUCH_START, { x: -10, y: 30 }, 7);
  f.send('hammer', E.TOUCH_MOVE, point, 7);
  assert.deepEqual(f.router.tool.marker.position, [10, 0, 8]);
  assert.equal(f.session.state.groundStacks[0].amount, 4, 'Preview does not spend materials');
  f.send('hammer', E.TOUCH_CANCEL, point, 7, E.TOUCH_END);
  assert.deepEqual(f.session.state.buildings.at(-1), plan.building);
  assert.equal(f.session.state.fusion.discoveries['build-house'].count, 1);
  assert.equal(f.session.state.groundStacks.length, 0);
  assert.deepEqual(new GameSession(f.storage, () => 100).state, f.session.state);
});

function farmFixture(irrigated = true) {
  const f = fixture();
  const state = structuredClone(f.session.state);
  state.trees = [];
  state.naturalResources = [];
  const farm = state.buildings.find((b) => b.kind === 'farm');
  if (irrigated) farm.irrigated = true;
  for (const crop of game.CROP_KEYS) state.inventory[crop] = 4;
  f.session.state = game.importSave(game.exportSave(state), 100);
  f.town.sync(f.session.state, null, null, 100);
  const center = require('../.domain-build/application/FarmCells').farmCellCenter(farm, 8);
  const point = { x: center.x, y: center.z };
  assert.equal(f.town.pickBuilding(f.map.screenRay(point)), farm.id);
  return { ...f, point, farmId: farm.id };
}
for (const crop of game.CROP_KEYS.filter((item) => game.CROPS[item].field === 'dry'))
  for (const id of [0, 7])
    test(`complete tray chain keeps ${crop} water-field rejection on move, revisit and outside END (${id})`, () => {
      const f = farmFixture();
      const before = game.exportSave(f.session.state);
      const rejected = new RegExp(`${game.CROPS[crop].label}.*旱田.*水田`);
      f.send(crop, E.TOUCH_START, { x: -10, y: 30 }, id);
      f.send(crop, E.TOUCH_MOVE, f.point, id);
      assert.match(
        f.session.message,
        rejected,
        'Stock hover must not overwrite the farm rejection',
      );
      f.send(crop, E.TOUCH_MOVE, { x: 0.5, y: 0.5 }, id);
      f.send(crop, E.TOUCH_MOVE, f.point, id);
      assert.match(f.session.message, rejected, 'Revisited cells retain their farm feedback');
      f.send(crop, E.TOUCH_CANCEL, f.point, id, E.TOUCH_END);
      assert.match(
        f.session.message,
        rejected,
        'Release must not turn a rejection into cancellation',
      );
      assert.equal(game.exportSave(f.session.state), before);
      assert.equal(f.router.active, false);
      assert.equal(f.tray.ghost.active, false);
      f.send(crop, E.TOUCH_END, f.point, id);
      assert.equal(game.exportSave(f.session.state), before);
      assert.match(f.session.message, rejected);
    });

test('a rejected field hover does not block later ground placement or genuine cancellation', () => {
  for (const finish of [E.TOUCH_END, E.TOUCH_CANCEL]) {
    const f = farmFixture();
    const before = game.exportSave(f.session.state);
    const point = cellForRecipe(f.session, 1);
    f.send('wheat', E.TOUCH_START, { x: -10, y: 30 }, 7);
    f.send('wheat', E.TOUCH_MOVE, f.point, 7);
    f.send('wheat', E.TOUCH_MOVE, point, 7);
    f.send('wheat', E.TOUCH_CANCEL, point, 7, finish);
    if (finish === E.TOUCH_CANCEL) assert.equal(game.exportSave(f.session.state), before);
    else {
      assert.equal(f.session.state.inventory.wheat, 3);
      assert.deepEqual(f.session.state.groundStacks, [
        { x: Math.floor(point.x), z: Math.floor(point.y), item: 'wheat', amount: 1 },
      ]);
      assert.deepEqual(new GameSession(f.storage, () => 100).state, f.session.state);
    }
  }
});

test('dry-field planting still commits once and an occupied field retains its rejection', () => {
  const f = farmFixture(false);
  f.send('lettuce', E.TOUCH_START, { x: -10, y: 30 }, 7);
  f.send('lettuce', E.TOUCH_MOVE, f.point, 7);
  const afterPlanting = game.exportSave(f.session.state);
  const farm = f.session.state.buildings.find((b) => b.id === f.farmId);
  assert.equal(farm.cropJobs[8].crop, 'lettuce');
  const planted = farm.cropJobs.filter(Boolean).length;
  assert.equal(f.session.state.inventory.lettuce, 4 - planted);
  f.send('lettuce', E.TOUCH_CANCEL, f.point, 7, E.TOUCH_END);
  assert.equal(game.exportSave(f.session.state), afterPlanting);
  f.send('lettuce', E.TOUCH_START, { x: -10, y: 30 }, 7);
  f.send('lettuce', E.TOUCH_MOVE, f.point, 7);
  f.send('lettuce', E.TOUCH_CANCEL, f.point, 7, E.TOUCH_END);
  assert.equal(game.exportSave(f.session.state), afterPlanting);
  assert.equal(f.session.message, '此小格已经种植');
  assert.deepEqual(new GameSession(f.storage, () => 100).state, f.session.state);
});
