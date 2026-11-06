/** Production HUD collection wiring with narrow engine collaborators, not GPU rendering. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, game, GameSession } = require('./helpers/collection-feedback-ui.cjs');
function saved(f) {
  assert.deepEqual(new GameSession(f.storage, () => 60000).state, f.session.state);
}
function settle(f) {
  for (let i = 0; i < 90; i++) f.step(1 / 60);
}
for (const [width, height] of [
  [390, 667],
  [390, 844],
  [1200, 800],
]) {
  test(`${width}x${height}: warehouse recovery while purchase panel is open retains exactly one collection`, () => {
    const f = fixture(width, height);
    f.open('vegetable');
    const hidden = !f.hud.tools.right.root.activeInHierarchy;
    const { pile, drag, id } = f.recoverPile();
    assert.equal(f.session.state.inventory[pile.item], pile.amount);
    assert.equal(f.events.length, 1);
    assert.deepEqual(f.events[0].gains, [{ kind: pile.item, amount: pile.amount }]);
    assert.equal(f.ui.cropShopOpen, false);
    assert.equal(f.hud.tools.right.root.activeInHierarchy, true);
    if (hidden) assert.equal(f.starts().length, 0, 'Hidden destination cannot start an icon');
    const committed = game.exportSave(f.session.state),
      bytes = [...f.values];
    settle(f);
    assert.equal(f.starts().length, 1, 'Committed recovery starts once when the real tray returns');
    drag.drop(id, {}, { x: width / 2, y: height - 150 });
    settle(f);
    assert.equal(f.starts().length, 1);
    assert.equal(f.events.length, 1);
    assert.equal(game.exportSave(f.session.state), committed);
    assert.deepEqual(
      [...f.values],
      bytes,
      'Animation and repeated release do not save or mutate gameplay',
    );
    saved(f);
  });
  test(`${width}x${height}: purchase feedback survives concealed tray until close`, () => {
    const f = fixture(width, height);
    f.open('vegetable');
    const hidden = !f.hud.tools.right.root.activeInHierarchy;
    const released = f.tap(f.buy('vegetable'));
    f.deliver(released.node, 'end', released.point, released.id);
    assert.equal(f.commands.length, 1);
    assert.equal(f.session.state.inventory.vegetable, 1);
    assert.equal(f.events.length, 1);
    const committed = game.exportSave(f.session.state),
      bytes = [...f.values];
    settle(f);
    assert.equal(f.starts().length, hidden ? 0 : 1);
    f.tap(f.hud.bottom.closeButton.node);
    assert.equal(f.hud.tools.right.root.activeInHierarchy, true);
    settle(f);
    assert.equal(f.starts().length, 1, 'The hidden purchase is not lost or replayed twice');
    settle(f);
    assert.equal(f.starts().length, 1);
    assert.equal(game.exportSave(f.session.state), committed);
    assert.deepEqual([...f.values], bytes);
    saved(f);
  });
}
test('visible-tray warehouse recovery needs no panel transition', () => {
  const f = fixture();
  const { pile } = f.recoverPile();
  settle(f);
  assert.equal(f.starts().length, 1);
  assert.equal(f.session.state.inventory[pile.item], pile.amount);
  saved(f);
});
test('axe still flies, mining stays on ground, and explicit pickup alone flies once', () => {
  const f = fixture(1200, 800);
  const tree = f.session.state.trees[0];
  assert.equal(f.session.run({ type: 'useTool', tool: 'axe', treeId: tree.id }), true);
  settle(f);
  assert.deepEqual(
    f
      .starts()
      .map((e) => e.kind)
      .sort(),
    ['treeSeed', 'wood'],
  );
  const after = game.exportSave(f.session.state),
    bytes = [...f.values];
  assert.equal(f.session.run({ type: 'useTool', tool: 'axe', treeId: tree.id }), false);
  settle(f);
  assert.equal(f.starts().length, 2);
  assert.equal(game.exportSave(f.session.state), after);
  assert.deepEqual([...f.values], bytes);
  const resource = f.session.state.naturalResources.find((r) => r.kind === 'stone');
  assert.equal(f.session.run({ type: 'gatherNatural', resourceId: resource.id }), true);
  settle(f);
  assert.equal(f.starts().length, 2);
  assert.equal(f.session.state.inventory.stone, 0);
  const drop = f.session.state.looseDrops.find(
    (d) => d.source.type === 'natural' && d.source.resourceId === resource.id,
  );
  assert.ok(drop);
  assert.equal(f.session.run({ type: 'pickupDrop', dropId: drop.id }), true);
  settle(f);
  assert.equal(f.starts().at(-1).kind, 'stone');
  assert.equal(f.starts().length, 3);
  saved(f);
});
test('full-storage recovery rejects atomically and never queues a flight', () => {
  const f = fixture();
  f.open('vegetable');
  f.session.state.inventory.stone = game.getCapacity(f.session.state);
  f.session.save();
  const before = game.exportSave(f.session.state),
    bytes = [...f.values];
  f.recoverPile();
  f.hud.closeDetails();
  settle(f);
  assert.equal(f.events.length, 0);
  assert.equal(f.starts().length, 0);
  assert.equal(game.exportSave(f.session.state), before);
  assert.deepEqual([...f.values], bytes);
});
test('mature cell harvest stays on ground and explicit pickup alone animates once', () => {
  const f = fixture(390, 844);
  const farm = f.session.state.buildings.find((b) => b.id === 'b2');
  const crop = farm.cropJobs[0].crop;
  const command = { type: 'harvestCell', buildingId: farm.id, cell: 0 };
  assert.equal(f.session.run(command), true);
  settle(f);
  assert.equal(f.events.length, 0);
  assert.equal(f.starts().length, 0);
  assert.equal(f.session.state.inventory[crop], 0);
  const drop = f.session.state.looseDrops.find(
    (d) => d.source.type === 'crop' && d.source.buildingId === farm.id && d.source.cell === 0,
  );
  assert.equal(drop.amount, 2);
  assert.equal(f.session.run({ type: 'pickupDrop', dropId: drop.id }), true);
  const committed = game.exportSave(f.session.state),
    bytes = [...f.values];
  settle(f);
  assert.deepEqual(
    f.starts().map((e) => e.kind),
    [crop],
  );
  assert.equal(f.session.state.inventory[crop], 2);
  assert.equal(f.session.run(command), false);
  settle(f);
  assert.equal(f.events.length, 1);
  assert.equal(f.starts().length, 1);
  assert.equal(game.exportSave(f.session.state), committed);
  assert.deepEqual([...f.values], bytes);
  saved(f);
});
test('disabled durable-tool replenishment cannot invent a left-tray collection', () => {
  const f = fixture();
  f.session.save();
  const committed = game.exportSave(f.session.state),
    bytes = [...f.values];
  assert.equal(f.session.run({ type: 'buyTool', tool: 'axe' }), false);
  assert.equal(f.session.run({ type: 'recoverTool', tool: 'axe' }), false);
  settle(f);
  assert.equal(f.events.length, 0);
  assert.equal(f.starts().length, 0);
  assert.equal(game.exportSave(f.session.state), committed);
  assert.deepEqual([...f.values], bytes);
});

function legacyDock(f) {
  const id = f.session.state.buildings.find((b) => b.kind === 'dock').id;
  f.session.state.commerce.dockCargo[id].chilledVegetable = 1;
  // Validate an actual old-product save through the production importer, then persist it.
  f.session.state = game.importSave(game.exportSave(f.session.state), 60000);
  assert.equal(f.session.save(), true);
  return id;
}
function dockTransfer(f, id, direction) {
  assert.equal(
    f.session.run({
      type: 'dockTransfer',
      buildingId: id,
      item: 'chilledVegetable',
      quantity: 1,
      direction,
    }),
    true,
    f.session.message,
  );
  f.controller.refresh();
}
test('legacy dock return then immediate stage cannot starve later visible wood feedback', () => {
  const f = fixture(1200, 800),
    dock = legacyDock(f);
  const cargo = structuredClone(f.session.state.commerce.dockCargo[dock]);
  for (let i = 0; i < 24; i++) {
    dockTransfer(f, dock, 'return');
    dockTransfer(f, dock, 'stage');
    f.step(1 / 60);
  }
  assert.equal(f.session.state.inventory.chilledVegetable, 0);
  assert.deepEqual(f.session.state.commerce.dockCargo[dock], cargo);
  assert.equal(f.hud.tools.destination('chilledVegetable'), null);
  const pile = f.session.state.groundStacks.find((p) => p.item === 'wood');
  assert.equal(f.session.run({ type: 'pickupStack', x: pile.x, z: pile.z }), true);
  f.controller.refresh();
  assert.ok(f.hud.tools.destination('wood')?.activeInHierarchy);
  const committed = game.exportSave(f.session.state),
    bytes = [...f.values];
  settle(f);
  assert.equal(
    f.starts().filter((e) => e.kind === 'wood').length,
    1,
    'Unreachable legacy-product flights must release slots for actual visible rewards',
  );
  assert.equal(f.session.state.inventory.wood, pile.amount);
  assert.equal(game.exportSave(f.session.state), committed);
  assert.deepEqual([...f.values], bytes);
  saved(f);
});

function advanceSeconds(f, seconds) {
  for (let i = 0; i < Math.ceil(seconds * 10); i++) f.step(0.1);
}
test('legacy dock return pressure keeps at most 96 pending batches and expires impossible targets', () => {
  const f = fixture(390, 667),
    dock = legacyDock(f);
  f.open('vegetable');
  const originalCargo = structuredClone(f.session.state.commerce.dockCargo[dock]);
  for (let i = 0; i < 100; i++) {
    dockTransfer(f, dock, 'return');
    dockTransfer(f, dock, 'stage');
  }
  assert.equal(f.events.length, 100, 'All domain returns commit even if visual pressure coalesces');
  assert.deepEqual(f.session.state.commerce.dockCargo[dock], originalCargo);
  assert.equal(f.session.state.inventory.chilledVegetable, 0);
  assert.equal(f.hud.tools.destination('chilledVegetable'), null);
  const committed = game.exportSave(f.session.state),
    bytes = [...f.values];
  assert.ok(
    f.hud.flights.pending.length <= 96,
    'Waiting visual batches have a fixed 96-entry bound',
  );
  f.hud.closeDetails();
  advanceSeconds(f, 31);
  assert.equal(
    f.hud.flights.pending.length,
    0,
    'An item excluded from the tray expires after 30 seconds',
  );
  assert.equal(f.hud.flights.pool.filter((p) => p.running).length, 0);
  assert.equal(f.starts().length, 0, 'No invented fallback target is used');
  assert.equal(game.exportSave(f.session.state), committed);
  assert.deepEqual([...f.values], bytes);
  saved(f);
});
test('an already started legacy-product flight pauses invisibly and expires after final staging', () => {
  const f = fixture(1200, 800),
    dock = legacyDock(f);
  dockTransfer(f, dock, 'return');
  assert.equal(f.starts().filter((e) => e.kind === 'chilledVegetable').length, 1);
  f.step(0.1);
  const flight = f.hud.flights.pool.find((p) => p.running);
  const elapsed = flight.elapsed;
  dockTransfer(f, dock, 'stage');
  const committed = game.exportSave(f.session.state),
    bytes = [...f.values];
  f.step(0.1);
  assert.equal(flight.node.active, false, 'No flight is visible without a real target');
  assert.equal(flight.elapsed, elapsed, 'An unavailable target cannot consume flight progress');
  advanceSeconds(f, 31);
  assert.equal(f.hud.flights.pending.length, 0);
  assert.equal(f.hud.flights.pool.filter((p) => p.running).length, 0);
  assert.equal(f.starts().filter((e) => e.kind === 'chilledVegetable').length, 1);
  assert.equal(game.exportSave(f.session.state), committed);
  assert.deepEqual([...f.values], bytes);
  saved(f);
});
test('a normal crop hidden by an open panel for over 30 seconds still animates once on close', () => {
  const f = fixture(390, 667);
  f.open('vegetable');
  f.tap(f.buy('vegetable'));
  const committed = game.exportSave(f.session.state),
    bytes = [...f.values];
  advanceSeconds(f, 31);
  assert.equal(f.starts().length, 0);
  assert.equal(f.hud.flights.pending.length, 1, 'Temporary concealment is not an impossible item');
  f.hud.closeDetails();
  settle(f);
  assert.equal(f.starts().length, 1);
  assert.equal(f.hud.flights.pending.length, 0);
  assert.equal(game.exportSave(f.session.state), committed);
  assert.deepEqual([...f.values], bytes);
  saved(f);
});
