/** Production commands and gesture code with CPU scene adapters, not GPU/device validation. */
const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { GameSession } = require('../.domain-build/application/GameSession');
const { presentation, SceneNode } = require('./helpers/demo-campaign-scene.cjs');
const { ToolUseDrag } = presentation('ToolUseDrag');
const point = (x, z, pile = true) => ({
  x: x + 0.5,
  z: z + 0.5,
  ...(pile ? { pile: { x, z } } : {}),
});
function fixture(wood = 3, stone = 3) {
  const state = g.createGame(1000, 1, 1);
  state.trees = [];
  state.naturalResources = [];
  state.groundStacks = [
    { x: 10, z: 10, item: 'wood', amount: wood },
    { x: 11, z: 10, item: 'stone', amount: stone },
    { x: 12, z: 10, item: 'wood', amount: 1 },
  ];
  const values = new Map();
  const storage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  const session = new GameSession(
    storage,
    () => 1000,
    () => g.importSave(g.exportSave(state), 1000),
  );
  const commands = [],
    events = [];
  session.setCollectionListener((e) => events.push(e));
  const run = session.run.bind(session);
  session.run = (c) => {
    commands.push(c);
    return run(c);
  };
  const map = {
    cancelGesture() {},
    contains: (p) => !p.outside,
    screenRay: (p) => p,
    ground: (p) => ({ x: p.x, z: p.z }),
  };
  const town = {
    pickBuilding: (p) => p.buildingId ?? null,
    pickTree: (p) => p.treeId ?? null,
    pickNatural: (p) => p.resourceId ?? null,
    pickStack: (p) => p.pile ?? null,
  };
  const tool = new ToolUseDrag(new SceneNode('World'), session, map, town, () => {});
  const a = point(10, 10),
    b = point(11, 10),
    destination = point(10, 11, false);
  const select = () => {
    tool.begin('hammer', 7);
    tool.move(7, a);
    tool.move(7, b);
  };
  return { state, session, storage, values, commands, events, tool, a, b, destination, select };
}

test('mixed hammer previews only explicit units and one result, spends nothing until one release', () => {
  const f = fixture(),
    before = g.exportSave(f.session.state),
    stock = { ...f.session.state.inventory };
  f.tool.begin('hammer', 7);
  f.tool.move(7, f.a);
  assert.equal(f.tool.marker.children.filter((n) => n.name === 'MixedSource').length, 2);
  f.tool.move(7, f.a);
  f.tool.move(7, f.b);
  assert.equal(f.session.message, '', 'No recipe text is exposed by hover');
  assert.equal(f.tool.marker.children.filter((n) => n.name === 'MixedSource').length, 4);
  assert.ok(
    !f.tool.marker.children.some((n) => n.name === 'MixedCraftResult'),
    'Remaining stone prevents building over its pile',
  );
  f.tool.move(7, f.destination);
  assert.equal(
    f.tool.marker.children.find((n) => n.name === 'MixedCraftResult').asset,
    'stone-oven',
  );
  assert.deepEqual(
    f.tool.marker.children.filter((n) => n.name === 'SelectedMixedUnit').map((n) => n.asset),
    ['pile-wood-1', 'pile-stone-1'],
  );
  assert.equal(g.exportSave(f.session.state), before);
  assert.equal(f.commands.length, 0);
  f.tool.end(8, f.destination);
  assert.equal(f.commands.length, 0);
  f.tool.end(7, f.destination);
  f.tool.end(7, f.destination);
  assert.equal(f.commands.length, 1);
  assert.deepEqual(f.commands[0], {
    type: 'craftMixed',
    recipeId: 'build-stone-oven',
    tool: 'hammer',
    sources: f.state.groundStacks.slice(0, 2),
    x: 10,
    z: 11,
  });
  assert.deepEqual(f.session.state.inventory, stock);
  assert.deepEqual(
    f.session.state.groundStacks.map((p) => p.amount),
    [2, 2, 1],
  );
  assert.equal(f.session.state.buildings.at(-1).kind, 'stoneOven');
  assert.equal(f.events.length, 0, 'No fake inventory collection flight');
  assert.deepEqual(new GameSession(f.storage, () => 1000).state, f.session.state);
});

test('third piles never replace locked sources or become a hidden single-pile fallback', () => {
  const f = fixture();
  f.select();
  const before = g.exportSave(f.session.state);
  f.tool.move(7, point(12, 10));
  assert.deepEqual(f.tool.command(f.destination).sources, f.state.groundStacks.slice(0, 2));
  f.tool.end(7, point(12, 10));
  assert.equal(f.commands[0].type, 'craftMixed');
  assert.equal(g.exportSave(f.session.state), before);
});

for (const ending of ['cancel', 'outside', 'building', 'tree', 'natural'])
  test(`mixed ${ending} leaves both source piles and inventory untouched`, () => {
    const f = fixture();
    f.select();
    const before = g.exportSave(f.session.state);
    if (ending === 'cancel') {
      f.tool.cancel();
      f.tool.end(7, f.destination);
    } else
      f.tool.end(7, {
        ...f.destination,
        ...(ending === 'outside'
          ? { outside: true }
          : ending === 'building'
            ? { buildingId: 'b1' }
            : ending === 'tree'
              ? { treeId: 'tree' }
              : { resourceId: 'hill' }),
      });
    assert.equal(f.commands.length, 0);
    assert.equal(g.exportSave(f.session.state), before);
    assert.equal(f.tool.mixed.complete, false);
  });

test('observed changed sources invalidate the gesture even after their old amount is restored', () => {
  const f = fixture();
  f.select();
  f.session.state.groundStacks[0].amount++;
  f.tool.move(7, f.destination);
  assert.match(f.session.message, /材料堆已变化/);
  f.session.state.groundStacks[0].amount--;
  const before = g.exportSave(f.session.state);
  f.tool.end(7, f.destination);
  assert.equal(f.commands.length, 0);
  assert.equal(g.exportSave(f.session.state), before);
});

test('one source cannot silently find another or spend stocked inventory', () => {
  const f = fixture(1, 1),
    before = g.exportSave(f.session.state);
  f.tool.begin('hammer', 7);
  f.tool.move(7, f.a);
  f.tool.end(7, f.destination);
  assert.equal(f.commands.length, 0);
  assert.equal(g.exportSave(f.session.state), before);
  f.tool.begin('hammer', 7);
  f.tool.end(7, f.a);
  assert.equal(f.commands[0].type, 'useTool');
  assert.equal(f.session.state.buildings.at(-1).kind, 'orderBoard');
  assert.equal(f.session.state.groundStacks.find((p) => p.item === 'stone').amount, 1);
});
