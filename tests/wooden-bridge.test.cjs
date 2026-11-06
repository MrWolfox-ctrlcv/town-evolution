const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createGame,
  createBridgeDemo,
  dispatch,
  exportSave,
  importSave,
  buildingMergePlan,
  validateBridgeTerrain,
  bridgeSpanCells,
} = require('../.domain-build/domain/game');
const { footprint, validatePlacement } = require('../.domain-build/domain/geometry');
const { buildingOccupiedCells } = require('../.domain-build/domain/building-cells');
const { emptyStock } = require('../.domain-build/domain/commerce');
const clone = (v) => JSON.parse(JSON.stringify(v));
const snap = ({ id, kind, x, z, rotation }) => ({ id, kind, x, z, rotation });
function run(s, c) {
  const before = JSON.stringify(s),
    r = dispatch(s, c, s.lastSeenAt);
  assert.equal(r.ok, true, r.error);
  assert.equal(JSON.stringify(s), before, 'dispatch never mutates its caller');
  return r.state;
}
function fail(s, c) {
  const before = JSON.stringify(s),
    r = dispatch(s, c, s.lastSeenAt);
  assert.equal(r.ok, false, JSON.stringify(c));
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), before);
  return r.error;
}
function command(s, reverse = false) {
  const piers = s.buildings.filter((b) => b.kind === 'woodenPier');
  if (reverse) piers.reverse();
  return {
    type: 'dragMerge',
    sourceId: piers[0].id,
    targetId: piers[1].id,
    sources: piers.map(snap),
  };
}
function bridge(s) {
  return s.buildings.find((b) => b.kind === 'woodenBridge');
}
test('ordinary v5 gameplay makes a real bridge using only axe, wood piles, hammer and direct building merge', () => {
  let s = createGame(1000, 1, 5);
  const start = clone(s);
  for (const treeId of ['t1652', 't1653', 't2'])
    s = run(s, { type: 'useTool', tool: 'axe', treeId });
  assert.equal(s.inventory.wood, 6);
  assert.equal(s.inventory.treeSeed, 6);
  for (const x of [133, 146]) {
    s = run(s, { type: 'dropProduct', item: 'wood', quantity: 3, x, z: 135 });
    s = run(s, { type: 'useTool', tool: 'hammer', x, z: 135 });
  }
  const before = clone(s),
    c = command(s, true),
    preview = buildingMergePlan(s, c.sourceId, c.targetId, c.sources);
  assert.equal(preview.cost, 0);
  assert.equal(preview.building.bridge.length, 15);
  assert.deepEqual(
    preview,
    buildingMergePlan(s, c.targetId, c.sourceId, c.sources.slice().reverse()),
  );
  s = run(s, c);
  const b = bridge(s),
    proof = validateBridgeTerrain(s, { ...b, length: b.bridge.length });
  assert.equal(proof.endpointCells.length, 8);
  assert.ok(proof.riverCells.length >= 4);
  assert.equal(b.id, before.buildings.find((p) => p.kind === 'woodenPier' && p.x === 133).id);
  assert.deepEqual(
    b.bridge.piers,
    before.buildings.filter((p) => p.kind === 'woodenPier').map(snap),
  );
  assert.deepEqual(s.tools, before.tools);
  assert.deepEqual(s.inventory, before.inventory);
  assert.equal(s.inventory.wood, 0);
  assert.equal(s.coins, start.coins);
  assert.equal(s.nextId, before.nextId);
  assert.deepEqual(s.naturalResources, start.naturalResources);
  assert.equal(s.trees.length, start.trees.length - 3);
  assert.equal(s.fusion.discoveries['build-wooden-bridge'].count, 1);
  assert.deepEqual(importSave(exportSave(s), s.lastSeenAt), s);
  fail(s, c);
});
test('both drag directions preserve two components, attachments, economy and immutable preview', () => {
  const s = createBridgeDemo(1000),
    piers = s.buildings.filter((b) => b.kind === 'woodenPier');
  s.fusion.attachments[piers[0].id] = { ...emptyStock(), wood: 2 };
  s.fusion.attachments[piers[1].id] = { ...emptyStock(), stone: 3 };
  const before = JSON.stringify(s),
    a = run(s, command(s)),
    b = run(s, command(s, true));
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(a.fusion.attachments[piers[0].id], { ...emptyStock(), wood: 2, stone: 3 });
  assert.equal(a.fusion.attachments[piers[1].id], undefined);
  assert.equal(bridge(a).bridge.piers[1].id, piers[1].id);
  assert.deepEqual(importSave(exportSave(a), 1000), a);
  s.fusion.attachments[piers[1].id].stone++;
  fail(s, command(s));
});
test('missing, duplicate, changed, mismatched or stale explicit components fail atomically', () => {
  const s = createBridgeDemo(1000),
    c = command(s);
  for (const mutate of [
    (v) => delete v.sources,
    (v) => v.sources.pop(),
    (v) => v.sources.push(clone(v.sources[0])),
    (v) => (v.sources[1] = clone(v.sources[0])),
    (v) => v.sources[0].x++,
    (v) => (v.sources[1].rotation = 2),
    (v) => (v.sources[0].kind = 'house'),
    (v) => (v.sources[1].id = 'b1'),
  ]) {
    const bad = clone(c);
    mutate(bad);
    fail(s, bad);
  }
  const changed = clone(s);
  changed.buildings.find((b) => b.id === c.sourceId).rotation = 3;
  fail(changed, c);
  const unrelated = clone(s);
  unrelated.buildings.find((b) => b.id === c.targetId).z++;
  fail(unrelated, command(unrelated));
});
test('the entire bridge span rejects every physical blocker without partial component loss', () => {
  for (const obstacle of [
    (s) => s.buildings.push({ id: `b${s.nextId++}`, kind: 'crate', x: 135, z: 135, rotation: 0 }),
    (s) => s.trees.push({ id: 't900000', x: 135, z: 135 }),
    (s) => s.naturalResources.push({ id: 'n900000', kind: 'stone', x: 135, z: 135, amount: 1 }),
    (s) => s.groundStacks.push({ item: 'wood', amount: 1, x: 135, z: 135 }),
    (s) =>
      s.looseDrops.push({
        id: `d${s.nextId++}`,
        item: 'soil',
        amount: 1,
        x6: 135 * 6 + 3,
        z6: 135 * 6 + 3,
        source: { type: 'natural', resourceId: 'n900000', kind: 'soil' },
      }),
    (s) => s.landExtensions.push({ x: 135, z: 135 }),
  ]) {
    const s = createBridgeDemo(1000);
    obstacle(s);
    fail(s, command(s));
  }
});
test('bridge movement preserves length and original source identities; stale or invalid moves cannot teleport it', () => {
  let s = run(createBridgeDemo(1000), command(createBridgeDemo(1000)));
  s.trees = [];
  s.naturalResources = [];
  const original = clone(bridge(s)),
    c = { type: 'moveBuilding', buildingId: original.id, source: snap(original), x: 133, z: 136 };
  s = run(s, c);
  assert.deepEqual(bridge(s).bridge, original.bridge);
  assert.deepEqual(footprint(bridge(s)), { width: 15, depth: 2 });
  assert.equal(buildingOccupiedCells(bridge(s)).length, 30);
  assert.deepEqual(importSave(exportSave(s), 1000), s);
  fail(s, c);
  fail(s, { ...c, source: undefined, z: 137 });
  for (const [x, z] of [
    [3, 3],
    [138, 135],
    [191, 191],
    [-1, 1],
    [1.5, 135],
  ])
    fail(s, { ...c, source: snap(bridge(s)), x, z });
  fail(s, { type: 'rotateBuilding', buildingId: original.id });
  const occupied = clone(s);
  occupied.trees.push({ id: 't900000', x: 133, z: 138 });
  fail(occupied, { ...c, source: snap(bridge(s)), z: 137 });
});
test('dynamic footprint prevents new land objects, piles and drops from occupying any bridge landing', () => {
  const s = run(createBridgeDemo(1000), command(createBridgeDemo(1000))),
    b = bridge(s);
  for (const x of [b.x, b.x + b.bridge.length - 1]) {
    assert.throws(
      () => validatePlacement(s, { id: 'b999999', kind: 'crate', x, z: b.z, rotation: 0 }),
      /建筑/,
    );
    fail(s, { type: 'placeTree', x, z: b.z });
    fail(s, { type: 'dropProduct', item: 'vegetable', quantity: 1, x, z: b.z });
  }
  for (const rotation of [0, 1, 2, 3]) {
    const p = { x: 10, z: 10, rotation, length: 15 };
    assert.equal(bridgeSpanCells(p).length, 30);
    const b2 = { ...b, ...p };
    assert.deepEqual(
      footprint(b2),
      rotation % 2 ? { width: 15, depth: 2 } : { width: 2, depth: 15 },
    );
  }
  for (const p of [{ x: 1.5 }, { z: -1 }, { length: 6 }, { length: 17 }, { rotation: 4 }])
    assert.throws(() => bridgeSpanCells({ x: 10, z: 10, rotation: 0, length: 15, ...p }));
});
