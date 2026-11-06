const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { clone } = require('../.domain-build/domain/state');
const { emptyStock } = require('../.domain-build/domain/commerce');
const copy = (v) => JSON.parse(JSON.stringify(v));
const snap = ({ id, kind, x, z, rotation }) => ({ id, kind, x, z, rotation });
function built() {
  const s = g.createBridgeDemo(1000),
    piers = s.buildings.filter((b) => b.kind === 'woodenPier');
  const r = g.dispatch(
    s,
    { type: 'dragMerge', sourceId: piers[0].id, targetId: piers[1].id, sources: piers.map(snap) },
    1000,
  );
  assert.equal(r.ok, true, r.error);
  return r.state;
}
const b = (s) => s.buildings.find((p) => p.kind === 'woodenBridge');
function bad(original, mutate) {
  const s = copy(original);
  mutate(s, b(s));
  const bytes = JSON.stringify(s);
  assert.throws(() => g.importSave(bytes, 1000));
  assert.equal(JSON.stringify(s), bytes);
}
test('bridge state deep-clones and roundtrips its full original component identity and dynamic length', () => {
  const s = built(),
    text = g.exportSave(s),
    imported = g.importSave(text, 1000),
    cloned = clone(s);
  assert.equal(imported.schemaVersion, 10);
  assert.deepEqual(imported, s);
  assert.equal(g.exportSave(imported), text);
  b(cloned).bridge.piers[1].x++;
  b(cloned).bridge.length--;
  assert.equal(g.exportSave(s), text);
  b(imported).bridge.piers[0].rotation = 3;
  assert.equal(g.exportSave(s), text);
});
test('missing, extra or malformed bridge fields are rejected rather than stripped', () => {
  const s = built();
  for (const mutate of [
    (_s, p) => delete p.bridge,
    (_s, p) => (p.bridge = null),
    (_s, p) => (p.bridge = []),
    (_s, p) => (p.bridge.unknown = true),
    (_s, p) => delete p.bridge.length,
    (_s, p) => (p.bridge.length = 6),
    (_s, p) => (p.bridge.length = 17),
    (_s, p) => (p.bridge.length = 14.5),
    (_s, p) => (p.bridge.length = 14),
    (_s, p) => (p.bridge.piers = []),
    (_s, p) => p.bridge.piers.pop(),
    (_s, p) => p.bridge.piers.push(copy(p.bridge.piers[0])),
    (_s, p) => (p.bridge.piers[1] = null),
    (_s, p) => (p.bridge.piers[0].job = {}),
    (_s, p) => delete p.bridge.piers[1].rotation,
    (_s, p) => (p.bridge.piers[1].rotation = 4),
    (_s, p) => (p.bridge.piers[0].x = 133.5),
    (_s, p) => (p.bridge.piers[1].z = -1),
    (_s, p) => (p.bridge.piers[1].kind = 'crate'),
    (_s, p) => (p.bridge.piers[0].id = 'b77'),
    (_s, p) => (p.bridge.piers[1].id = p.id),
    (_s, p) => (p.bridge.piers[1].id = 'b0'),
    (_s, p) => p.bridge.piers.reverse(),
    (_s, p) => p.bridge.piers[1].z++,
    (_s, p) => (p.job = {}),
    (_s, p) => (p.processingJob = {}),
    (_s, p) => (p.cropJobs = []),
    (_s, p) => (p.collectionBox = {}),
    (_s, p) => (p.compost = {}),
    (_s, p) => (p.nurserySeeded = true),
    (_s, p) => (p.boatAttached = true),
    (_s, p) => (p.dockStyle = 'simple'),
  ])
    bad(s, mutate);
  bad(s, (state, p) => {
    state.buildings[0].bridge = copy(p.bridge);
  });
});
test('consumed component IDs remain reserved globally, including nextId and any future object', () => {
  const s = built(),
    consumed = b(s).bridge.piers[1].id;
  bad(s, (state) => (state.nextId = Number(consumed.slice(1))));
  bad(s, (_state, p) => (p.bridge.piers[1].id = 'b999999'));
  bad(s, (_state, p) => (p.bridge.piers[1].id = 'b1'));
  bad(s, (state) =>
    state.buildings.push({ id: consumed, kind: 'crate', x: 20, z: 20, rotation: 0 }),
  );
  bad(s, (state) => {
    state.buildings[1].collectionBox = { crateId: consumed, capacity: 16, stock: emptyStock() };
  });
  const movedConsumedId = copy(s);
  b(movedConsumedId).bridge.piers[1].id = 'b888';
  movedConsumedId.nextId = 889;
  assert.equal(b(g.importSave(JSON.stringify(movedConsumedId), 1000)).bridge.piers[1].id, 'b888');
});
test('current placement and historical original endpoints both need real river certificates', () => {
  const s = built();
  for (const mutate of [
    (state) => (state.terrainVersion = 4),
    (state) => (state.schemaVersion = 9),
    (state) => (state.schemaVersion = 8),
    (state) => (state.terrainRevision = 'old'),
    (_s, p) => (p.x = 3),
    (_s, p) => (p.z = 3),
    (_s, p) => (p.rotation = 0),
    (_s, p) => (p.x = 191),
    (_s, p) => {
      p.bridge.piers[0].z = 3;
      p.bridge.piers[1].z = 3;
    },
    (_s, p) => {
      p.bridge.piers[0].x = 3;
      p.bridge.piers[1].x = 16;
    },
  ])
    bad(s, mutate);
  const clear = copy(s);
  clear.trees = [];
  clear.naturalResources = [];
  const r = g.dispatch(
    clear,
    { type: 'moveBuilding', buildingId: b(clear).id, source: snap(b(clear)), x: 133, z: 136 },
    1000,
  );
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(b(g.importSave(g.exportSave(r.state), 1000)).bridge, b(s).bridge);
  const occupiedOriginal = copy(r.state);
  occupiedOriginal.buildings.push({
    id: `b${occupiedOriginal.nextId++}`,
    kind: 'crate',
    x: 133,
    z: 135,
    rotation: 0,
  });
  // History proves where the materials came from, and does not reserve an abandoned landing.
  assert.deepEqual(g.importSave(g.exportSave(occupiedOriginal), 1000), occupiedOriginal);
});
test('saved bridges reject overlapping content across both landings and every span tile', () => {
  const s = built();
  for (const x of [133, 147]) {
    bad(s, (state) =>
      state.buildings.push({ id: `b${state.nextId++}`, kind: 'crate', x, z: 135, rotation: 0 }),
    );
    bad(s, (state) => state.groundStacks.push({ item: 'wood', amount: 1, x, z: 135 }));
    bad(s, (state) => state.trees.push({ id: `t${state.nextTreeId++}`, x, z: 135 }));
  }
  bad(s, (state) => state.landExtensions.push({ x: 140, z: 135 }));
});
test('existing schema10 worlds retain every field without bridge backfill; unknown future bridges fail closed', () => {
  for (const version of [1, 2, 3, 4, 5]) {
    const s = g.createGame(1000, 1, version),
      text = g.exportSave(s);
    assert.deepEqual(g.importSave(text, 1000), s);
    assert.equal(
      s.buildings.some((p) => p.bridge !== undefined),
      false,
    );
    assert.equal(g.exportSave(g.importSave(text, 1000)), text);
  }
  bad(built(), (_state, p) => (p.kind = 'woodenBridgeFuture'));
});
