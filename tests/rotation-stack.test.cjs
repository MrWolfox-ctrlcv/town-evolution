const { test } = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game.js');
const geometry = require('../.domain-build/domain/geometry.js');
function run(s, c) {
  const r = g.dispatch(s, c, s.lastSeenAt);
  assert.equal(r.ok, true, r.error);
  return r.state;
}
function fail(s, c) {
  const before = g.exportSave(s),
    r = g.dispatch(s, c, s.lastSeenAt);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(g.exportSave(s), before);
}
function free(s) {
  const cells = [];
  for (let z = 0; z < 24; z++)
    for (let x = 0; x < 24; x++) {
      try {
        geometry.validatePlacement(s, { id: 'candidate', kind: 'orderBoard', rotation: 0, x, z });
        cells.push({ x, z });
      } catch {}
    }
  return cells;
}
test('four rotations retain crop jobs, identity, economy and save roundtrip', () => {
  let s = g.createDemoGame(30000);
  const before = structuredClone(s);
  for (const rotation of [1, 2, 3, 0]) {
    s = run(s, { type: 'rotateBuilding', buildingId: 'b2' });
    assert.equal(s.buildings.find((b) => b.id === 'b2').rotation, rotation);
    assert.deepEqual(
      s.buildings.find((b) => b.id === 'b2').cropJobs,
      before.buildings.find((b) => b.id === 'b2').cropJobs,
    );
    assert.deepEqual(g.importSave(g.exportSave(s), s.lastSeenAt), s);
  }
  assert.deepEqual(s, before);
  fail(s, { type: 'rotateBuilding', buildingId: 'missing' });
});
test('shore rules inspect the actual facing on all four dock orientations', () => {
  for (let rotation = 0; rotation < 4; rotation++) {
    let s = g.createGame(0, 42173);
    s.trees = [];
    s.coins = 1000;
    let candidate;
    for (let z = 0; z < 24 && !candidate; z++)
      for (let x = 0; x < 24 && !candidate; x++) {
        const b = { id: 'new', kind: 'dock', x, z, rotation };
        try {
          geometry.validatePlacement(s, b);
          if (g.isDockShore(b, s.mapSeed)) candidate = b;
        } catch {}
      }
    assert.ok(candidate, `shore for ${rotation}`);
    s = run(s, { type: 'place', kind: 'dock', x: candidate.x, z: candidate.z, rotation });
    const dock = s.buildings.at(-1);
    s = run(s, {
      type: 'dockTransfer',
      buildingId: dock.id,
      item: 'vegetable',
      quantity: 1,
      direction: 'stage',
    });
    s = run(s, { type: 'dockShip', buildingId: dock.id, shipmentId: 1 });
    const next = { ...dock, rotation: (rotation + 1) % 4 };
    if (g.isDockShore(next, s.mapSeed)) {
      const changed = run(s, { type: 'rotateBuilding', buildingId: dock.id });
      assert.deepEqual(changed.commerce, s.commerce);
      assert.deepEqual(g.importSave(g.exportSave(changed), 0), changed);
    } else fail(s, { type: 'rotateBuilding', buildingId: dock.id });
    assert.deepEqual(g.importSave(g.exportSave(s), 0), s);
  }
});
test('whole piles move and merge without warehouse transfer or resource loss', () => {
  let s = g.createDemoGame(30000);
  const [a, b, c] = free(s);
  s.groundStacks.push({ ...a, item: 'wood', amount: 3 }, { ...b, item: 'wood', amount: 2 });
  const inventory = structuredClone(s.inventory),
    tools = structuredClone(s.tools);
  s = run(s, { type: 'moveStack', fromX: a.x, fromZ: a.z, ...c });
  assert.equal(s.groundStacks.find((p) => p.x === c.x && p.z === c.z).amount, 3);
  s = run(s, { type: 'moveStack', fromX: c.x, fromZ: c.z, ...b });
  assert.equal(s.groundStacks.find((p) => p.x === b.x && p.z === b.z).amount, 5);
  assert.equal(
    s.groundStacks.some((p) => p.x === a.x && p.z === a.z),
    false,
  );
  assert.deepEqual(s.inventory, inventory);
  assert.deepEqual(s.tools, tools);
  assert.deepEqual(g.importSave(g.exportSave(s), s.lastSeenAt), s);
  assert.deepEqual(run(s, { type: 'moveStack', fromX: b.x, fromZ: b.z, ...b }), s);
});
test('full pile, mixed goods, water, tree, building and missing source are atomic failures', () => {
  const s = g.createDemoGame(30000),
    [a, b, c] = free(s);
  s.groundStacks.push(
    { ...a, item: 'wood', amount: 3 },
    { ...b, item: 'wood', amount: 5 },
    { ...c, item: 'stone', amount: 1 },
  );
  for (const destination of [
    b,
    c,
    { x: 0, z: 0 },
    s.trees[0],
    s.buildings[0],
    { x: NaN, z: 2 },
    { x: -1, z: 2 },
  ])
    fail(s, { type: 'moveStack', fromX: a.x, fromZ: a.z, x: destination.x, z: destination.z });
  fail(s, { type: 'moveStack', fromX: 23, fromZ: 23, ...a });
});
test('footprint parity is stable through four orientations', () => {
  let s = g.createGame(0);
  s.trees = [];
  const warehouse = s.buildings[0];
  warehouse.kind = 'expandedWarehouse';
  const before = geometry.footprint(warehouse);
  assert.deepEqual(geometry.footprint({ ...warehouse, rotation: 2 }), before);
  assert.deepEqual(
    geometry.footprint({ ...warehouse, rotation: 3 }),
    geometry.footprint({ ...warehouse, rotation: 1 }),
  );
  // All current footprints are square; a shore-facing dock supplies real rejection coverage above.
  for (const rotation of [1, 2, 3, 0]) {
    s = run(s, { type: 'rotateBuilding', buildingId: warehouse.id });
    assert.equal(s.buildings[0].rotation, rotation);
  }
});

test('stack overflow fills destination and preserves remainder at origin', () => {
  let s = g.createDemoGame(30000),
    [a, b] = free(s);
  s.groundStacks.push({ ...a, item: 'wood', amount: 4 }, { ...b, item: 'wood', amount: 3 });
  const before = structuredClone(s.inventory);
  s = run(s, { type: 'moveStack', fromX: a.x, fromZ: a.z, ...b });
  assert.equal(s.groundStacks.find((p) => p.x === a.x && p.z === a.z).amount, 2);
  assert.equal(s.groundStacks.find((p) => p.x === b.x && p.z === b.z).amount, 5);
  assert.deepEqual(s.inventory, before);
  fail(s, { type: 'moveStack', fromX: a.x, fromZ: a.z, ...b });
  assert.deepEqual(g.importSave(g.exportSave(s), s.lastSeenAt), s);
});
test('whole pile returns via warehouse or sidebar using shared inventory capacity', () => {
  for (const warehouseId of [undefined, 'b1']) {
    let s = g.createDemoGame(30000),
      [a] = free(s);
    s.groundStacks.push({ ...a, item: 'stone', amount: 5 });
    const before = s.inventory.stone;
    s = run(s, { type: 'pickupStack', ...a, warehouseId });
    assert.equal(s.inventory.stone, before + 5);
    assert.equal(
      s.groundStacks.some((p) => p.x === a.x && p.z === a.z),
      false,
    );
    fail(s, { type: 'pickupStack', ...a, warehouseId });
    assert.deepEqual(g.importSave(g.exportSave(s), s.lastSeenAt), s);
  }
});
test('whole pile pickup rejects wrong building and insufficient capacity without partial loss', () => {
  const s = g.createDemoGame(30000),
    [a] = free(s);
  s.groundStacks.push({ ...a, item: 'stone', amount: 5 });
  for (const warehouseId of ['b2', 'missing', s.buildings.find((b) => b.kind === 'dock').id])
    fail(s, { type: 'pickupStack', ...a, warehouseId });
  s.inventory.stone += g.getCapacity(s) - g.getUsedStorage(s) - 4;
  fail(s, { type: 'pickupStack', ...a, warehouseId: 'b1' });
  fail(s, { type: 'pickupStack', ...a });
});
