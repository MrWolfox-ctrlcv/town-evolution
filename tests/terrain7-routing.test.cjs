const test = require('node:test');
const assert = require('node:assert/strict');
const D = (name) => require('../.domain-build/domain/' + name);
const G = D('game');
const { getEditableWorld } = D('editable-world');
const { getV6EditSurface } = D('v6-edit-surface');
const { isLandCell, isDockShore } = D('island');
const { validateV6Extensions, isV6MarineCell } = D('v6-maritime');
for (const version of [6, 7]) {
  const Prep = D(`v${version}-preparation`)[`V${version}WorldPreparation`];
  const p = new Prep(1);
  while (p.step(50000).status !== 'ready') {}
  p.takeResult();
}
const old = G.createGame(1000, 1, 6),
  fresh = G.createGame(1000, 1, 7);
const world = getEditableWorld(1, 7);
const apply = (s, c) => {
  const r = G.dispatch(s, c, s.lastSeenAt + 1);
  assert.ok(r.ok, r.error);
  return r.state;
};
test('same seed resolves distinct revision, hydrology, foundation and immutable edit surface', () => {
  assert.notEqual(getEditableWorld(1, 6), world);
  assert.notEqual(getEditableWorld(1, 6).revision, world.revision);
  assert.equal(getV6EditSurface(fresh).world, world);
  assert.equal(getV6EditSurface(old).world, getEditableWorld(1, 6));
  assert.throws(() => getEditableWorld(1, 8));
  let differing = 0;
  for (let z = 1; z < 191; z += 3)
    for (let x = 1; x < 191; x += 3) {
      assert.equal(isLandCell(x, z, 1, 7), world.hydrology.at(x, z).state === 'dryBuildable');
      if (isLandCell(x, z, 1, 6) !== isLandCell(x, z, 1, 7)) differing++;
    }
  assert.ok(differing > 100);
  for (const r of fresh.naturalResources) assert.ok(world.acceptsResource(r));
  assert.notDeepEqual(fresh.trees, old.trees);
});
test('new7 starter actual soil/stone dig, pickup and reload use the same edit authority', () => {
  let s = fresh;
  for (const kind of ['soil', 'stone']) {
    let next, selected;
    for (const r of s.naturalResources.filter(
      (r) => r.kind === kind && Math.hypot(r.x - 5, r.z - 5) < 25,
    )) {
      const result = G.dispatch(s, { type: 'gatherNatural', resourceId: r.id }, s.lastSeenAt + 1);
      if (result.ok) {
        next = result.state;
        selected = r;
        break;
      }
    }
    assert.ok(next, `No actual starter ${kind} dig command succeeded`);
    s = next;
    assert.ok(s.terrain6.cells.some((c) => c.x === selected.x && c.z === selected.z));
    for (const drop of [...s.looseDrops]) s = apply(s, { type: 'pickupDrop', dropId: drop.id });
    assert.ok(s.inventory[kind] > 0);
  }
  // Gather enough actual layers to refill one complete cell, never mint fixture stock.
  for (const resource of [...s.naturalResources].filter((r) => Math.hypot(r.x - 5, r.z - 5) < 25)) {
    if (s.inventory.soil >= 3 || s.inventory.stone >= 3) break;
    const r = G.dispatch(s, { type: 'gatherNatural', resourceId: resource.id }, s.lastSeenAt + 1);
    if (!r.ok) continue;
    s = r.state;
    for (const drop of [...s.looseDrops]) s = apply(s, { type: 'pickupDrop', dropId: drop.id });
  }
  let filled = false;
  for (const cell of [...s.terrain6.cells]) {
    if (cell.level > 0) {
      s = apply(s, {
        type: 'editTerrain6',
        kind: 'dig',
        x: cell.x,
        z: cell.z,
        level: 0,
        expectedOperation: s.terrain6.nextOperation,
      });
      for (const drop of [...s.looseDrops]) s = apply(s, { type: 'pickupDrop', dropId: drop.id });
    }
    for (const material of ['soil', 'stone']) {
      const r = G.dispatch(
        s,
        {
          type: 'editTerrain6',
          kind: 'fill',
          x: cell.x,
          z: cell.z,
          level: 1,
          material,
          source: { type: 'inventory', item: material, amount: s.inventory[material] },
          expectedOperation: s.terrain6.nextOperation,
        },
        s.lastSeenAt + 1,
      );
      if (r.ok) {
        s = r.state;
        filled = true;
        break;
      }
    }
    if (filled) break;
  }
  assert.ok(filled, 'Collected real starter material must support an actual refill');
  const tree = s.trees.find((p) => Math.hypot(p.x - 5, p.z - 5) < 25);
  assert.ok(tree);
  s = apply(s, { type: 'useTool', tool: 'axe', treeId: tree.id });
  for (const drop of [...s.looseDrops]) s = apply(s, { type: 'pickupDrop', dropId: drop.id });
  assert.ok(s.inventory.wood > 0);
  const bytes = G.exportSave(s),
    restored = G.importSave(bytes, s.lastSeenAt);
  assert.equal(G.exportSave(restored), bytes);
  assert.equal(getV6EditSurface(restored).world, world);
  assert.deepEqual(restored.terrain6, s.terrain6);
});
test('new7 marine permissions and freshwater exclusion use its own hydrology', () => {
  let differences = 0;
  for (let z = 1; z < 191; z += 3)
    for (let x = 1; x < 191; x += 3) {
      assert.equal(isV6MarineCell(1, x, z, [], 7), world.hydrology.at(x, z).seaDockWater);
      if (isV6MarineCell(1, x, z, [], 6) !== isV6MarineCell(1, x, z, [], 7)) differences++;
      if (world.hydrology.at(x, z).waterKind === 'lake')
        assert.throws(() => validateV6Extensions(1, [{ x, z }], 7));
    }
  assert.ok(differences > 100);
  const feature = world.hydrology.feature;
  let dock;
  for (
    let z = Math.max(1, Math.floor(feature.anchor.z) - 12);
    z <= Math.min(188, feature.anchor.z + 12) && !dock;
    z++
  )
    for (
      let x = Math.max(1, Math.floor(feature.anchor.x) - 12);
      x <= Math.min(188, feature.anchor.x + 12) && !dock;
      x++
    )
      for (let rotation = 0; rotation < 4; rotation++) {
        const b = { kind: 'dock', x, z, rotation };
        if (isDockShore(b, 1, 7, [])) {
          dock = b;
          break;
        }
      }
  assert.ok(dock, 'Certified coast must provide a same-source navigable dock');
});
test('new7 bridge certificate, deck, mesh and full post footprint share ground authority', () => {
  const { validateBridgeTerrain } = D('bridge-terrain');
  const { v6BridgeProfile } = D('v6-bridge-profile');
  const { v6BridgeMesh } = require('../.domain-build/art/V6BridgeKit');
  const { v6BridgeBedLower } = require('../.domain-build/art/V6BridgeFootings');
  let found, plan;
  outer: for (let z = 2; z < 176; z += 2)
    for (let x = 2; x < 176; x += 2) {
      if (world.hydrology.at(x, z).state !== 'dryBuildable') continue;
      for (const rotation of [0, 1])
        for (let length = 7; length <= 16; length++) {
          const mid =
            rotation === 0
              ? { x, z: z + Math.floor(length / 2) }
              : { x: x + Math.floor(length / 2), z };
          if (world.hydrology.at(mid.x, mid.z).waterKind !== 'river') continue;
          const p = { x, z, rotation, length };
          try {
            plan = validateBridgeTerrain(fresh, p);
            found = p;
            break outer;
          } catch {}
        }
    }
  assert.ok(found, 'Must find a legal crossing on new7 actual river');
  const profile = v6BridgeProfile(1, found, 7);
  assert.equal(profile.root, plan.baseElevation);
  const q = D('v6-bridge-profile').v6BridgeWorldPoint(found, 0, 0);
  assert.equal(profile.ground(0, 0), world.groundHeight(q.x, q.z));
  const mesh = v6BridgeMesh(
    { ...found, id: 'b3', kind: 'woodenBridge', bridge: { length: found.length, piers: [] } },
    1,
    7,
  );
  assert.ok(mesh.indices.length > 0);
  const lower = v6BridgeBedLower(1, q.x, q.z, 0.12, 7);
  assert.ok(lower <= world.groundHeight(q.x, q.z));
  const altered = {
    ...fresh,
    terrain6: { ...fresh.terrain6, cells: [{ x: found.x, z: found.z }] },
  };
  assert.throws(() => validateBridgeTerrain(altered, found));
});
test('new7 reserved natural dock is legal on live placement and canonical save reload', () => {
  const s = D('state').clone(fresh),
    f = world.hydrology.feature;
  const pier = { id: 'b3', kind: 'woodenPier', x: f.anchor.x, z: f.anchor.z, rotation: f.rotation };
  D('geometry').validatePlacement(s, pier);
  assert.throws(() => D('geometry').validatePlacement(s, { ...pier, kind: 'house' }));
  const dock = { ...pier, kind: 'dock', dockStyle: 'simple' };
  D('geometry').validatePlacement(s, dock);
  assert.ok(G.hasDockExit(s, dock));
  s.buildings.push(dock);
  s.nextId = 4;
  D('commerce').initializeFacility(s.commerce, dock);
  const bytes = G.exportSave(s);
  assert.equal(G.exportSave(G.importSave(bytes, s.lastSeenAt)), bytes);
});
