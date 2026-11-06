/** Presentation routing unit tests with narrow collaborators, not a rendered Cocos test. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const game = require('../.domain-build/domain/game.js');
const { stackDropCommand } = require('../.domain-build/application/StackDrop.js');
function loadPresentation(name, collaborators) {
  const filename = path.resolve(__dirname, `../assets/scripts/presentation/${name}.ts`);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(
    (id) => {
      if (id === '../domain/game') return game;
      if (id.startsWith('../application/')) return require('../.domain-build/' + id.slice(3));
      if (['./TerrainInteraction', './V6TerrainTool'].includes(id))
        return require('./helpers/selection-ui.cjs').load(id.slice(2));
      if (id === './InputProvenance') return require('./helpers/input-provenance.cjs');
      assert.ok(id in collaborators, `Unexpected dependency: ${id}`);
      return collaborators[id];
    },
    module,
    module.exports,
  );
  return module.exports[name];
}
// Only screen hit-test boundaries are doubled here. Official Cocos declarations are
// checked separately by typecheck:cocos; these tests do not replace that check.
const ToolTray = loadPresentation('ToolTray', {
  cc: {
    Vec2: class {
      constructor(x, y) {
        Object.assign(this, { x, y });
      }
    },
  },
  './Palette': { color: (value) => value },
  './Widgets': {},
  './TrayIcons': {},
  './TrayColumn': {},
});
const left = { x: 36, y: 200 },
  right = { x: 1244, y: 200 };
function tray() {
  const target = Object.create(ToolTray.prototype);
  target.width = 1280;
  target.height = 800;
  const region = (point) => ({
    hitTest: (p) => p.x === point.x && p.y === point.y,
    node: { worldPosition: point },
  });
  target.left = { regions: () => [region(left)], cancelGesture() {} };
  target.right = { regions: () => [region(right)], cancelGesture() {} };
  target.returnTarget = {
    active: false,
    setWorldPosition(point) {
      this.position = point;
    },
    getComponent: () => ({ clear() {}, roundRect() {}, stroke() {} }),
  };
  target.ghost = { active: true };
  return target;
}
test('both visible side columns accept product returns and show the same validity highlight', () => {
  const surface = tray();
  for (const point of [left, right]) {
    assert.equal(surface.acceptsProductDrop(point), true);
    surface.highlightProductDrop(point, true);
    assert.equal(surface.returnTarget.active, true);
    assert.equal(surface.returnTarget.position, point);
    surface.highlightProductDrop(point, false);
    assert.equal(surface.returnValid, false);
  }
  assert.equal(surface.acceptsProductDrop({ x: 600, y: 200 }), false);
  surface.left.regions = surface.right.regions = () => [];
  assert.equal(surface.acceptsProductDrop(left), false);
  assert.equal(surface.acceptsProductDrop(right), false);
  surface.highlightProductDrop(left, true);
  assert.equal(surface.returnTarget.active, false, 'Hidden columns do not keep a return marker');
});
test('every ground product returns through either side without conversion, duplication or save loss', () => {
  for (const point of [left, right])
    for (const item of game.ITEM_KEYS) {
      const surface = tray();
      let state = game.createGame(0);
      state.inventory[item] = 5;
      const original = structuredClone(state);
      let result = game.dispatch(state, { type: 'dropProduct', item, quantity: 5, x: 2, z: 5 }, 0);
      assert.equal(result.ok, true, result.error);
      state = result.state;
      assert.equal(surface.acceptsProductDrop(point), true);
      const command = stackDropCommand({ x: 2, z: 5 }, { kind: 'products' });
      result = game.dispatch(state, command, 0);
      assert.equal(result.ok, true, result.error);
      assert.deepEqual(result.state, original);
      assert.deepEqual(game.importSave(game.exportSave(result.state), 0), original);
      const repeated = game.dispatch(result.state, command, 0);
      assert.equal(repeated.ok, false);
      assert.equal(repeated.state, result.state);
    }
});
test('full warehouse rejects every product from both sides and keeps the entire pile', () => {
  for (const point of [left, right])
    for (const item of game.ITEM_KEYS) {
      let state = game.createGame(0);
      state.inventory[item] = 5;
      state = game.dispatch(state, { type: 'dropProduct', item, quantity: 5, x: 2, z: 5 }, 0).state;
      state.inventory.vegetable += game.getCapacity(state) - game.getUsedStorage(state);
      const before = game.exportSave(state);
      assert.equal(tray().acceptsProductDrop(point), true);
      const result = game.dispatch(
        state,
        stackDropCommand({ x: 2, z: 5 }, { kind: 'products' }),
        0,
      );
      assert.equal(result.ok, false);
      assert.match(result.error, /整堆产品仍保留原地/);
      assert.equal(result.state, state);
      assert.equal(game.exportSave(state), before);
    }
});
function routerFixture(kind) {
  const drags = [];
  class Drag {
    hasActed = false;
    begin() {}
    move() {}
    end() {
      this.released = true;
      return this.hasActed;
    }
    cancel() {
      this.hasActed = false;
      this.cancelled = true;
    }
    constructor() {
      drags.push(this);
    }
  }
  const Router = loadPresentation('ToolRouter', {
    './FarmTools': { FarmTools: Drag },
    './StockDrag': { StockDrag: Drag },
    './ToolUseDrag': { ToolUseDrag: Drag },
  });
  const session = { mode: 'normal', state: game.createGame(0), message: '' };
  if (game.ITEM_KEYS.includes(kind)) session.state.inventory[kind] = 5;
  const router = new Router({}, session, {}, {}, {}, () => {});
  assert.equal(router.begin(kind, 7, left), true);
  return { router, session, drags };
}
test('returning held tools and inventory only ends the gesture, without an end-command or duplicate', () => {
  for (const kind of ['sickle', 'axe', 'saw', 'hammer', ...game.ITEM_KEYS]) {
    const { router, session, drags } = routerFixture(kind);
    const before = game.exportSave(session.state);
    router.move(7, right, true);
    assert.match(session.message, /松手收回/);
    router.end(7, right, true);
    assert.equal(router.active, false);
    assert.ok(drags.every((drag) => drag.cancelled && !drag.released));
    assert.equal(game.exportSave(session.state), before);
    router.end(7, right, true);
    assert.equal(game.exportSave(session.state), before, 'Repeated release does not duplicate');
  }
});
test('return after a committed planting stroke preserves the planted crop and remaining stock', () => {
  const { router, session, drags } = routerFixture('vegetable');
  const planted = game.dispatch(
    session.state,
    { type: 'plantCell', buildingId: 'b2', cell: 0, crop: 'vegetable' },
    0,
  );
  assert.equal(planted.ok, true, planted.error);
  session.state = planted.state;
  drags[0].hasActed = true;
  const before = game.exportSave(session.state);
  router.end(7, left, true);
  assert.equal(game.exportSave(session.state), before);
  assert.equal(session.state.inventory.vegetable, 4);
  assert.ok(session.state.buildings.find((b) => b.id === 'b2').cropJobs[0]);
});
test('cancelled and foreign-pointer releases cannot commit or clear a newer gesture', () => {
  const { router, session, drags } = routerFixture('axe');
  const before = game.exportSave(session.state);
  router.end(8, left, true);
  assert.equal(router.active, true);
  assert.ok(drags.every((drag) => !drag.released));
  router.cancel();
  router.end(7, left, false);
  assert.equal(router.active, false);
  assert.ok(drags.every((drag) => !drag.released));
  assert.equal(game.exportSave(session.state), before);
});
test('captured release forwards either side once and clears both drag visuals', () => {
  for (const point of [left, right]) {
    const surface = tray(),
      calls = [];
    surface.active = 7;
    surface.handlers = { end: (...args) => calls.push(args) };
    surface.highlightProductDrop(point, true);
    const event = { getLocation: () => point, getUILocation: () => point };
    surface.release(event);
    surface.release(event);
    assert.deepEqual(calls, [[7, point, true]]);
    assert.equal(surface.ghost.active, false);
    assert.equal(surface.returnTarget.active, false);
  }
});
