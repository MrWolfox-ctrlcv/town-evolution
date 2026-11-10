/** Real input coordinators and radial button callbacks with narrow scene doubles.
 * No browser, WebGL, native storage or physical-device acceptance is implied. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  fixture,
  game,
  GameSession,
  load,
  Node,
  tap,
  assertExclusive,
} = require('./helpers/selection-fixture.cjs');
const { ToolRouter } = load('ToolRouter');

function setup(amount = 2) {
  const f = fixture();
  const s = game.createGame(100000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.inventory = require('../.domain-build/domain/commerce').emptyStock();
  s.inventory.wood = amount;
  f.session.state = s;
  assert.equal(f.session.save(), true);
  const point = { x: 9.5, y: 5.5 };
  const map = {
    contains: (p) => p.x >= 0 && p.y >= 0,
    screenRay: (p) => ({ ...p, o: { x: p.x, y: 20, z: p.y }, d: { x: 0, y: -1, z: 0 } }),
    ground: (p) => ({ x: p.x, y: 0, z: p.y }),
    cancelGesture() {},
  };
  const town = {
    pickBuilding: () => null,
    pickTree: () => null,
    pickNatural: () => null,
    pickDrop: () => null,
    pickStack: (r) =>
      f.session.state.groundStacks.find(
        (p) => p.x === Math.floor(r.x) && p.z === Math.floor(r.y),
      ) ?? null,
  };
  const parent = new Node('World');
  const router = new ToolRouter(parent, f.session, map, town, f.ui, f.render);
  const commits = [],
    originalRun = f.session.run.bind(f.session);
  f.session.run = (command) => {
    commits.push(command);
    return originalRun(command);
  };
  function gesture(kind, outcome = 'drop', at = point) {
    assert.equal(router.begin(kind, 7, at), true);
    router.move(7, at, false);
    if (outcome === 'cancel') router.cancel();
    else router.end(7, at, outcome === 'return');
    router.end(7, at, false);
  }
  return { ...f, router, point, parent, town, buildingTown: f.town, commits, gesture };
}

for (const [amount, kind] of [
  [1, 'fence'],
  [2, 'bench'],
]) {
  test(`${amount} wood stock gestures and saw release create one ${kind}, preserve quantity and reload`, () => {
    const f = setup(amount),
      initialTools = structuredClone(f.session.state.tools);
    for (let i = 0; i < amount; i++) f.gesture('wood');
    assert.equal(f.session.state.inventory.wood, 0);
    assert.deepEqual(f.session.state.groundStacks, [{ item: 'wood', amount, x: 9, z: 5 }]);
    const before = game.exportSave(f.session.state),
      persisted = [...f.data];
    assert.equal(f.router.begin('saw', 9, f.point), true);
    f.router.move(9, f.point, false);
    assert.equal(game.exportSave(f.session.state), before, 'preview cannot consume materials');
    assert.deepEqual([...f.data], persisted);
    assert.equal(f.session.message, '', 'legal preview is accepted');
    f.router.end(8, f.point, false);
    assert.equal(game.exportSave(f.session.state), before, 'wrong pointer cannot commit');
    f.router.end(9, f.point, false);
    f.router.end(9, f.point, false);
    assert.equal(f.session.state.buildings.at(-1).kind, kind);
    assert.equal(f.session.state.groundStacks.length, 0);
    assert.equal(f.commits.filter((c) => c.tool === 'saw').length, 1);
    assert.deepEqual(f.session.state.tools, initialTools);
    assert.equal(f.session.state.fusion.discoveries[`build-${kind}`].count, 1);
    assert.deepEqual(new GameSession(f.storage, () => 100000).state, f.session.state);
  });

  test(`${kind} tool preview cancels or takes the tray-return callback without spending wood`, () => {
    for (const outcome of ['cancel', 'return']) {
      const f = setup(amount);
      for (let i = 0; i < amount; i++) f.gesture('wood');
      const before = game.exportSave(f.session.state),
        persisted = [...f.data];
      f.gesture('saw', outcome);
      assert.equal(game.exportSave(f.session.state), before);
      assert.deepEqual([...f.data], persisted);
      assert.equal(f.commits.filter((c) => c.tool === 'saw').length, 0);
    }
  });

  test(`${kind} selects, rotates through a real radial button and moves through BuildingDrag once`, () => {
    const f = setup(amount);
    for (let i = 0; i < amount; i++) f.gesture('wood');
    f.gesture('saw');
    const b = f.session.state.buildings.at(-1);
    assert.equal(b.kind, kind);
    f.choose(b, 'building');
    assertExclusive(f.ui, { kind: 'building', id: b.id });
    assert.match(f.menu.data.detail, kind === 'fence' ? /围栏/ : /长凳/);
    const rotation = f.shown().find((button) => /转向/.test(button.action.text));
    assert.ok(rotation, 'new entity has a live radial rotation action');
    tap(rotation);
    assert.equal(f.session.state.buildings.find((x) => x.id === b.id).rotation, 1);
    const current = f.session.state.buildings.find((x) => x.id === b.id);
    const target = { ...current, x: 10, z: 5 };
    const id = f.lift(f.building, current, 'building');
    const ray = f.ray(target);
    delete ray.buildingId;
    f.building.move(id, { x: 10.5, y: 0, z: 5.5 }, ray);
    f.finish(f.building, id, ray);
    f.finish(f.building, id, ray);
    const result = f.session.state.buildings.find((x) => x.id === b.id);
    assert.deepEqual(
      { x: result.x, z: result.z, rotation: result.rotation },
      { x: 10, z: 5, rotation: 1 },
    );
    assert.equal(f.commits.filter((c) => c.type === 'moveBuilding').length, 1);
    assertExclusive(f.ui, { kind: 'building', id: b.id });
    assert.deepEqual(new GameSession(f.storage, () => 100000).state, f.session.state);
  });

  test(`${kind} interrupted building drags and blocked destinations retain the selected entity`, () => {
    for (const outcome of ['cancel', 'outside', 'occupied']) {
      const f = setup(amount);
      for (let i = 0; i < amount; i++) f.gesture('wood');
      f.gesture('saw');
      const b = f.session.state.buildings.at(-1);
      assert.equal(b.kind, kind);
      f.choose(b, 'building');
      const before = game.exportSave(f.session.state),
        persisted = [...f.data];
      const id = f.lift(f.building, b, 'building');
      if (outcome === 'cancel') f.building.clear();
      else
        f.finish(
          f.building,
          id,
          outcome === 'outside' ? null : f.ray(f.session.state.buildings[0]),
        );
      assert.equal(game.exportSave(f.session.state), before);
      assert.deepEqual([...f.data], persisted);
      assertExclusive(f.ui, { kind: 'building', id: b.id });
    }
  });
}

test('stock return or cancellation never pre-spends a unit or changes an existing pile', () => {
  for (const outcome of ['return', 'cancel']) {
    const f = setup(2),
      before = game.exportSave(f.session.state),
      persisted = [...f.data];
    f.gesture('wood', outcome);
    assert.equal(game.exportSave(f.session.state), before);
    assert.deepEqual([...f.data], persisted);
    assert.equal(f.commits.length, 0);
  }
});

for (const [tool, amount, kind] of [
  ['hammer', 1, 'orderBoard'],
  ['hammer', 2, 'crate'],
  ['saw', 3, 'handcart'],
  ['saw', 4, 'boat'],
])
  test(`existing ${amount} wood + ${tool} UI route still produces ${kind}`, () => {
    const f = setup(amount);
    for (let i = 0; i < amount; i++) f.gesture('wood');
    f.gesture(tool);
    assert.equal(f.session.state.buildings.at(-1).kind, kind);
    assert.equal(f.session.state.groundStacks.length, 0);
    assert.equal(f.commits.filter((c) => c.tool === tool).length, 1);
  });

test('the exact one/two-wood piles can be recovered before crafting, and full storage keeps them intact', () => {
  for (const amount of [1, 2])
    for (const full of [false, true]) {
      const f = setup(amount);
      for (let i = 0; i < amount; i++) f.gesture('wood');
      if (full) f.session.state.inventory.vegetable = game.getCapacity(f.session.state);
      assert.ok(f.session.save());
      const before = game.exportSave(f.session.state),
        persisted = [...f.data];
      const pile = f.session.state.groundStacks[0];
      f.choose(pile, 'pile');
      const id = f.lift(f.stack, pile, 'pile');
      f.finish(f.stack, id, null, { returning: true });
      f.finish(f.stack, id, null, { returning: true });
      if (full) {
        assert.equal(game.exportSave(f.session.state), before);
        assert.deepEqual([...f.data], persisted);
        assert.equal(f.session.state.groundStacks[0].amount, amount);
        assert.match(f.session.message, /仓库空间不足/);
      } else {
        assert.equal(f.session.state.inventory.wood, amount);
        assert.equal(f.session.state.groundStacks.length, 0);
        assert.equal(f.commits.filter((c) => c.type === 'pickupStack').length, 1);
      }
    }
});

test('releasing a crafted prop over either side through ObjectDrag cancels without deleting it', () => {
  const { ObjectDrag } = load('ObjectDrag');
  for (const amount of [1, 2])
    for (const x of [-10, 1300]) {
      const f = setup(amount);
      for (let i = 0; i < amount; i++) f.gesture('wood');
      f.gesture('saw');
      const b = f.session.state.buildings.at(-1);
      assert.equal(b.kind, amount === 1 ? 'fence' : 'bench');
      const drag = new ObjectDrag(
        new Node('World'),
        f.session,
        f.ui,
        f.buildingTown,
        f.render,
        f.products,
      );
      const id = drag.candidate(f.ray(b));
      assert.equal(id, b.id);
      const before = game.exportSave(f.session.state),
        persisted = [...f.data];
      drag.move(id, { x: b.x + 0.5, y: 0, z: b.z + 0.5 }, null, { x, y: 200, returning: true });
      drag.drop(id, null, { x, y: 200, returning: true });
      assert.equal(game.exportSave(f.session.state), before);
      assert.deepEqual([...f.data], persisted);
      assert.equal(f.session.state.buildings.find((item) => item.id === id).kind, b.kind);
      assert.match(f.session.message, /已取消/);
    }
});
