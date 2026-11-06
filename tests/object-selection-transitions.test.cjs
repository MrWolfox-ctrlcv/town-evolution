const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  fixture,
  assertExclusive,
  game,
  GameSession,
  event,
  tap,
  TownController,
  baseline,
} = require('./helpers/selection-fixture.cjs');

test('pile selection then a real building lift/drop renders only the shop HUD and radial commands', () => {
  const f = fixture(),
    pile = f.session.state.groundStacks.find((p) => p.item === 'wood'),
    shop = f.session.state.buildings.find((b) => b.kind === 'shop');
  f.choose(pile, 'pile');
  const oldButton = f.shown()[0];
  oldButton.node.emit('start', event());
  const id = f.lift(f.building, shop, 'building');
  f.finish(f.building, id, f.ray(shop));
  oldButton.node.emit('end', event());
  assert.equal(f.commands.length, 0, 'the captured old pile action is cancelled');
  assertExclusive(f.ui, { kind: 'building', id: shop.id });
  assert.match(f.menu.data.detail, /^商店/);
  assert.equal(
    f.shown().some((b) => /收回/.test(b.action.text)),
    false,
  );
  assert.deepEqual(f.bottom.at(-1).actions, [], 'object controls route only to the radial menu');
  const sell = f.shown().find((b) => /^卖/.test(b.action.text));
  assert.ok(sell);
  tap(sell);
  assert.equal(f.commands.at(-1).type, 'shopTrade');
  assert.equal(f.commands.at(-1).buildingId, shop.id);
  assert.deepEqual(f.session.state.groundStacks, baseline.groundStacks);
  assert.deepEqual(new GameSession(f.storage, () => 100000).state, f.session.state);
});

test('tree, mineral, pile and building transitions have one target, including actual drag release', () => {
  for (const oldKind of ['tree', 'natural', 'pile', 'building']) {
    const f = fixture(),
      state = f.session.state;
    const old = {
      tree: state.trees[0],
      natural: state.naturalResources[0],
      pile: state.groundStacks[0],
      building: state.buildings[0],
    }[oldKind];
    f.choose(old, oldKind);
    const pile = state.groundStacks.find((p) => p.item === 'wood');
    const id = f.lift(f.stack, pile, 'pile');
    f.finish(f.stack, id, f.ray(pile, 'pile'));
    assertExclusive(f.ui, { kind: 'pile', x: pile.x, z: pile.z });
    assert.match(f.menu.data.detail, /木材/);
    assert.equal(f.menu.data.rotation, null);
    assert.equal(f.menu.data.actions.length, 2);
    for (const nextKind of ['tree', 'natural', 'building']) {
      const target = {
        tree: state.trees[0],
        natural: state.naturalResources[0],
        building: state.buildings[0],
      }[nextKind];
      f.choose(target, nextKind);
      assertExclusive(f.ui, { kind: nextKind, id: target.id });
    }
  }
});

test('cancelled or invalid lifts preserve the original exclusive selection and all saved progress', () => {
  for (const kind of ['building', 'pile'])
    for (const outcome of ['cancel', 'outside', 'invalid']) {
      const f = fixture(),
        tree = f.session.state.trees[0];
      f.choose(tree, 'tree');
      const before = game.exportSave(f.session.state),
        saved = [...f.data.entries()];
      const source =
        kind === 'building'
          ? f.session.state.buildings.find((b) => b.kind === 'shop')
          : f.session.state.groundStacks[0];
      const drag = kind === 'building' ? f.building : f.stack,
        id = f.lift(drag, source, kind);
      if (outcome === 'cancel') {
        drag.clear();
        f.menu.setSuppressed(false);
        f.render();
      } else
        f.finish(
          drag,
          id,
          outcome === 'outside'
            ? null
            : f.ray(f.session.state.buildings.find((b) => b.kind === 'farm')),
        );
      assertExclusive(f.ui, { kind: 'tree', id: tree.id });
      assert.equal(game.exportSave(f.session.state), before);
      assert.deepEqual([...f.data.entries()], saved);
      assert.match(f.menu.data.detail, /树木/);
    }
});

test('successful whole-pile recovery clears an old resource selection rather than reviving it', () => {
  const f = fixture(),
    tree = f.session.state.trees[0],
    pile = f.session.state.groundStacks.find((p) => p.item === 'wood');
  f.choose(tree, 'tree');
  const id = f.lift(f.stack, pile, 'pile');
  f.finish(f.stack, id, null, { returning: true });
  assertExclusive(f.ui, null);
  assert.equal(f.menu.root.active, false);
  assert.equal(
    f.session.state.groundStacks.some((p) => p.x === pile.x && p.z === pile.z),
    false,
  );
  assert.deepEqual(new GameSession(f.storage, () => 100000).state, f.session.state);
});

test('full and partial pile merges focus the destination and preserve exactly the domain result', () => {
  for (const item of ['wood', 'soil']) {
    const f = fixture(),
      piles = f.session.state.groundStacks.filter((p) => p.item === item);
    const source = piles.find((p) => p.amount === (item === 'wood' ? 2 : 5));
    const target = piles.find((p) => p.amount === (item === 'wood' ? 1 : 4));
    f.choose(f.session.state.naturalResources[0], 'natural');
    const expected = game.dispatch(
      f.session.state,
      { type: 'moveStack', fromX: source.x, fromZ: source.z, x: target.x, z: target.z },
      100000,
    );
    assert.ok(expected.ok, expected.error);
    const id = f.lift(f.stack, source, 'pile');
    f.stack.move(id, { x: target.x + 0.5, y: 0, z: target.z + 0.5 }, f.ray(target, 'pile'), {});
    f.finish(f.stack, id, f.ray(target, 'pile'));
    assertExclusive(f.ui, { kind: 'pile', x: target.x, z: target.z });
    assert.deepEqual(f.session.state, expected.state);
    assert.deepEqual(new GameSession(f.storage, () => 100000).state, expected.state);
    assert.equal(f.menu.data.rotation, null);
  }
});

test('house/stone-mill and three-farm direct merges select only the retained result and cannot revive prior controls', () => {
  for (const type of ['house', 'farm']) {
    const f = fixture();
    let source, target;
    if (type === 'house') {
      source = f.session.state.buildings.find((b) => b.kind === 'stoneMill');
      target = f.session.state.buildings.find((b) => b.kind === 'house');
      const crate = f.session.state.buildings.find((b) => b.kind === 'crate');
      const before = game.exportSave(f.session.state),
        saved = [...f.data];
      const rejected = game.dispatch(
        f.session.state,
        { type: 'dragMerge', sourceId: crate.id, targetId: target.id },
        100000,
      );
      assert.equal(
        rejected.ok,
        false,
        'Building and object cannot bypass explicit hammer assembly',
      );
      assert.equal(rejected.state, f.session.state);
      assert.equal(game.exportSave(f.session.state), before);
      assert.deepEqual([...f.data], saved);
    } else {
      const farms = f.session.state.buildings.filter((b) => b.kind === 'farm' && !b.farmSize);
      outer: for (const a of farms)
        for (const b of farms) {
          if (!f.session.reason({ type: 'dragMerge', sourceId: a.id, targetId: b.id })) {
            source = a;
            target = b;
            break outer;
          }
        }
    }
    assert.ok(source && target);
    f.choose(f.session.state.groundStacks[0], 'pile');
    const expected = game.dispatch(
      f.session.state,
      { type: 'dragMerge', sourceId: source.id, targetId: target.id },
      100000,
    );
    assert.ok(expected.ok, expected.error);
    const id = f.lift(f.building, source, 'building');
    f.building.move(id, { x: target.x + 0.5, y: 0, z: target.z + 0.5 }, f.ray(target));
    f.finish(f.building, id, f.ray(target));
    assertExclusive(f.ui, { kind: 'building', id: target.id });
    const result = f.session.state.buildings.find((b) => b.id === target.id);
    assert.equal(type === 'house' ? result.kind : result.farmSize, type === 'house' ? 'mill' : 6);
    assert.deepEqual(f.session.state, expected.state);
    assert.equal(
      f.menu.data.actions.some((a) => /^整堆收回|^收回1份/.test(a.text)),
      false,
    );
    assert.deepEqual(new GameSession(f.storage, () => 100000).state, f.session.state);
  }
});

test('controller cancel and tab changes clear every selection without saving or altering progress', () => {
  for (const kind of ['building', 'pile', 'tree', 'natural'])
    for (const operation of ['cancel', 'changeTab']) {
      const f = fixture(),
        state = f.session.state;
      const target = {
        building: state.buildings[0],
        pile: state.groundStacks[0],
        tree: state.trees[0],
        natural: state.naturalResources[0],
      }[kind];
      f.choose(target, kind);
      const before = game.exportSave(state),
        saved = [...f.data.entries()];
      const controller = Object.assign(Object.create(TownController.prototype), {
        ui: f.ui,
        session: f.session,
        refresh: f.render,
      });
      controller[operation]('tools');
      assertExclusive(f.ui, null);
      assert.equal(game.exportSave(f.session.state), before);
      assert.deepEqual([...f.data.entries()], saved);
      assert.equal(f.menu.root.active, false);
    }
});

test('successful drag from an open global panel replaces its old controls with the chosen object', () => {
  const f = fixture(),
    shop = f.session.state.buildings.find((b) => b.kind === 'shop');
  f.ui.cropShopOpen = true;
  f.ui.moreBuildingActions = true;
  const id = f.lift(f.building, shop, 'building');
  f.finish(f.building, id, f.ray(shop));
  assertExclusive(f.ui, { kind: 'building', id: shop.id });
  assert.equal(f.ui.cropShopOpen, false);
  assert.equal(f.ui.moreBuildingActions, false);
  assert.match(f.menu.data.detail, /^商店/);
});
