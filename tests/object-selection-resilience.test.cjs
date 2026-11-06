/** Persistent regression coverage of the six independent-review cases. No GPU/DOM event claim. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  fixture,
  assertExclusive,
  game,
  GameSession,
  load,
  Node,
  event,
} = require('./helpers/selection-fixture.cjs');
const { MapGesture } = require('../.domain-build/application/MapGesture');
const { ObjectDrag } = load('ObjectDrag');
function objects(f) {
  return new ObjectDrag(new Node('World'), f.session, f.ui, f.town, f.render, f.products);
}
/** Find a genuinely different legal placement so autosave cannot take its same-bytes shortcut. */
function sourceFor(f, kind) {
  return kind === 'building'
    ? f.session.state.buildings.find((b) => b.kind === 'shop')
    : f.session.state.groundStacks.find((p) => p.item === 'wood');
}
function selectedTarget(kind, source, destination = source) {
  return kind === 'building'
    ? { kind, id: source.id }
    : { kind, x: destination.x, z: destination.z };
}
function relocation(f, source, kind) {
  for (let radius = 1; radius <= 20; radius++)
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const command = {
          ...(kind === 'building'
            ? { type: 'moveBuilding', buildingId: source.id }
            : { type: 'moveStack', fromX: source.x, fromZ: source.z }),
          x: source.x + dx,
          z: source.z + dz,
        };
        const result = game.dispatch(f.session.state, command, 100000);
        if (result.ok) return { command, state: result.state, ray: f.ray(command, 'ground') };
      }
  assert.fail('fixture needs a legal changed destination, not a no-op drop');
}

test('ObjectDrag dispatches both source kinds and ignores foreign releases without cancelling the live lift', () => {
  for (const kind of ['building', 'pile']) {
    const f = fixture(),
      drag = objects(f),
      tree = f.session.state.trees[0];
    const source =
      kind === 'building'
        ? f.session.state.buildings.find((b) => b.kind === 'shop')
        : f.session.state.groundStacks[0];
    f.choose(tree, 'tree');
    const before = game.exportSave(f.session.state),
      saved = [...f.data.entries()];
    const id = f.lift(drag, source, kind);
    drag.drop(kind === 'building' ? 'b999999' : 'pile:999:999', f.ray(source, kind), {});
    assert.equal(kind === 'building' ? drag.buildings.source : drag.stacks.source.id, id);
    assertExclusive(f.ui, { kind: 'tree', id: tree.id });
    assert.equal(game.exportSave(f.session.state), before);
    assert.deepEqual([...f.data.entries()], saved);
    f.finish(drag, id, f.ray(source, kind));
    assertExclusive(
      f.ui,
      kind === 'building' ? { kind, id: source.id } : { kind, x: source.x, z: source.z },
    );
    assert.equal(drag.buildings.source, null);
    assert.equal(drag.stacks.source, null);
    assert.deepEqual(new GameSession(f.storage, () => 100000).state, f.session.state);
  }
});

test('ordinary HUD rerenders preserve a current captured radial action and release it exactly once', () => {
  const f = fixture(),
    pile = f.session.state.groundStacks.find((p) => p.item === 'wood');
  f.choose(pile, 'pile');
  const button = f.shown()[0];
  button.node.emit('start', event());
  f.render();
  f.render();
  button.node.emit('end', event());
  button.node.emit('end', event());
  assert.deepEqual(f.commands, [{ type: 'pickupStack', x: pile.x, z: pile.z }]);
  assert.equal(
    f.session.state.groundStacks.some((p) => p.x === pile.x && p.z === pile.z),
    false,
  );
  assert.deepEqual(new GameSession(f.storage, () => 100000).state, f.session.state);
});

test('corrupt or recovered mode during a lift rejects release and new candidates without changing selection or saved data', () => {
  for (const mode of ['corrupt', 'recovered'])
    for (const kind of ['building', 'pile']) {
      const f = fixture(),
        drag = objects(f),
        tree = f.session.state.trees[0];
      const source =
        kind === 'building'
          ? f.session.state.buildings.find((b) => b.kind === 'shop')
          : f.session.state.groundStacks[0];
      f.choose(tree, 'tree');
      const before = game.exportSave(f.session.state),
        saved = [...f.data.entries()];
      const id = f.lift(drag, source, kind);
      f.session.mode = mode;
      f.finish(drag, id, f.ray(source, kind));
      assertExclusive(f.ui, { kind: 'tree', id: tree.id });
      assert.equal(game.exportSave(f.session.state), before);
      assert.deepEqual([...f.data.entries()], saved);
      assert.equal(drag.candidate(f.ray(source, kind)), null);
      assert.equal(f.menu.root.active, false);
    }
});

test('quota failure preserves the old save while committing the moved object in memory, then retries safely', () => {
  for (const kind of ['building', 'pile']) {
    const f = fixture(),
      drag = objects(f),
      source = sourceFor(f, kind);
    f.choose(f.session.state.trees[0], 'tree');
    const destination = relocation(f, source, kind),
      saved = [...f.data.entries()],
      write = f.storage.setItem;
    const id = f.lift(drag, source, kind);
    let attempts = 0;
    f.storage.setItem = () => {
      attempts++;
      throw Error('quota');
    };
    f.finish(drag, id, destination.ray);
    assert.ok(attempts > 0, 'the move must attempt a real storage write');
    assert.deepEqual(f.session.state, destination.state);
    assertExclusive(f.ui, selectedTarget(kind, source, destination.command));
    assert.equal(f.session.hasUnsavedChanges, true);
    assert.match(f.session.statusMessage, /保存失败/);
    assert.deepEqual([...f.data.entries()], saved);
    f.storage.setItem = write;
    assert.equal(f.session.save(), true);
    assert.equal(f.session.hasUnsavedChanges, false);
    assert.deepEqual(new GameSession(f.storage, () => 100000).state, destination.state);
  }
});

test('a newer session save during the drag rejects the old release before either state or selection changes', () => {
  for (const kind of ['building', 'pile']) {
    const f = fixture(),
      drag = objects(f),
      source = sourceFor(f, kind),
      old = f.session.state.trees[0];
    f.choose(old, 'tree');
    const destination = relocation(f, source, kind),
      before = game.exportSave(f.session.state);
    const id = f.lift(drag, source, kind);
    const rival = new GameSession(f.storage, () => 100000);
    assert.ok(rival.run({ type: 'buyCrop', item: 'wheat', quantity: 1 }));
    const newer = [...f.data.entries()];
    f.finish(drag, id, destination.ray);
    assert.equal(f.session.hasSaveConflict, true);
    assert.match(f.session.statusMessage, /另一页面/);
    assert.equal(game.exportSave(f.session.state), before);
    assertExclusive(f.ui, { kind: 'tree', id: old.id });
    assert.deepEqual([...f.data.entries()], newer);
    assert.deepEqual(new GameSession(f.storage, () => 100000).state, rival.state);
  }
});

test('MapGesture through ObjectDrag cancels a two-finger lift and accepts only a fresh single-finger long press', () => {
  for (const kind of ['building', 'pile']) {
    const f = fixture(),
      drag = objects(f),
      object = sourceFor(f, kind),
      old = f.session.state.trees[0];
    f.choose(old, 'tree');
    const destination = relocation(f, object, kind),
      before = game.exportSave(f.session.state),
      saved = [...f.data.entries()];
    let now = 0;
    const commands = [],
      run = f.session.run.bind(f.session);
    f.session.run = (command) => {
      commands.push(command);
      return run(command);
    };
    const rayFor = (p) => (p.x < 200 ? f.ray(object, kind) : destination.ray);
    const gesture = new MapGesture(
      {
        candidate: (p) => drag.candidate(rayFor(p)),
        drag: (id, p) => {
          const r = rayFor(p);
          drag.move(id, { x: r.o.x, y: 0, z: r.o.z }, r, p);
        },
        drop: (id, p) => drag.drop(id, rayFor(p), p),
        cancel: () => drag.clear(),
        tap: () => assert.fail('a long press cannot also become a tap'),
        pan() {},
        pinch() {},
      },
      () => now,
    );
    const source = { x: 100, y: 100 },
      target = { x: 250, y: 100 };
    function sync() {
      f.menu.setSuppressed(gesture.interacting);
      f.render();
    }
    gesture.begin(1, source, source);
    sync();
    now += 450;
    gesture.poll();
    sync();
    assert.equal(
      kind === 'building' ? drag.buildings.source : drag.stacks.source.id,
      kind === 'building' ? object.id : `pile:${object.x}:${object.z}`,
    );
    gesture.begin(2, target, target);
    sync();
    gesture.end(2, target);
    gesture.end(1, source);
    sync();
    assert.equal(drag.buildings.source, null);
    assert.equal(drag.stacks.source, null);
    assert.deepEqual(commands, []);
    assertExclusive(f.ui, { kind: 'tree', id: old.id });
    assert.equal(game.exportSave(f.session.state), before);
    assert.deepEqual([...f.data.entries()], saved);
    gesture.begin(3, source, source);
    sync();
    now += 450;
    gesture.poll();
    sync();
    gesture.move(3, target, target);
    sync();
    gesture.end(3, target);
    gesture.end(3, target);
    sync();
    assert.deepEqual(commands, [destination.command]);
    assertExclusive(f.ui, selectedTarget(kind, object, destination.command));
    assert.deepEqual(f.session.state, destination.state);
    assert.deepEqual(new GameSession(f.storage, () => 100000).state, destination.state);
  }
});
