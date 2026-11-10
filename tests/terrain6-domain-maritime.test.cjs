const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { clone } = require('../.domain-build/domain/state');
const { V6WorldPreparation } = require('../.domain-build/domain/v6-preparation');
const { getV6World } = require('../.domain-build/domain/v6-world');
const { validateBridgeTerrain } = require('../.domain-build/domain/bridge-terrain');
const { validatePlacement } = require('../.domain-build/domain/geometry');
const { emptyStock, initializeFacility } = require('../.domain-build/domain/commerce');
const { validateV6Extensions } = require('../.domain-build/domain/v6-maritime');
const { v5DockBerthCells } = require('../.domain-build/domain/v5-marine');
const { find } = require('./helpers/v5-coastal-dock.cjs');
const { hammerAssemblyCommand } = require('./helpers/hammer-assembly.cjs');
const prep = new V6WorldPreparation(1);
while (prep.step(50000).status !== 'ready') {}
prep.takeResult();
const initial = g.createGame(1000, 1, 6),
  world = getV6World(1);
const apply = (s, c) => {
  const r = g.dispatch(s, c, s.lastSeenAt + 1);
  assert.ok(r.ok, r.error);
  return r.state;
};
const reject = (s, c) => {
  const before = JSON.stringify(s),
    r = g.dispatch(s, c, 2000);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), before);
};
const roundtrip = (s) => {
  const bytes = g.exportSave(s);
  assert.equal(g.exportSave(g.importSave(bytes, s.lastSeenAt)), bytes);
};
function addFree(state, kind, id) {
  for (let z = 2; z < 35; z++)
    for (let x = 2; x < 35; x++) {
      const b = { id, kind, x, z, rotation: 0 };
      try {
        validatePlacement(state, b);
      } catch {
        continue;
      }
      state.buildings.push(b);
      return b;
    }
  assert.fail('No free fixture foundation');
}

function bridgeTown() {
  const state = clone(initial),
    span = { x: 133, z: 135, rotation: 1, length: 15 };
  const plan = validateBridgeTerrain(state, span),
    keys = new Set(plan.occupiedCells.map((p) => `${p.x},${p.z}`));
  state.trees = state.trees.filter((p) => !keys.has(`${p.x},${p.z}`));
  state.naturalResources = state.naturalResources.filter((p) => !keys.has(`${p.x},${p.z}`));
  for (const [id, x] of [
    ['b3', 133],
    ['b4', 146],
  ]) {
    const pier = { id, kind: 'woodenPier', x, z: 135, rotation: 0 };
    validatePlacement(state, pier);
    state.buildings.push(pier);
  }
  state.nextId = 5;
  return state;
}
const snap = (b) => ({ id: b.id, kind: b.kind, x: b.x, z: b.z, rotation: b.rotation });
function mergeBridge(state) {
  return apply(state, {
    type: 'dragMerge',
    sourceId: 'b3',
    targetId: 'b4',
    sources: state.buildings.filter((b) => ['b3', 'b4'].includes(b.id)).map(snap),
  });
}
test('v6 merges two real sloped river-bank piers without flattening the banks or changing resources', () => {
  const state = bridgeTown(),
    before = clone(state),
    piers = state.buildings.filter((b) => b.kind === 'woodenPier');
  assert.notEqual(piers[0].baseElevation, piers[1].baseElevation);
  roundtrip(state);
  const result = mergeBridge(state),
    bridge = result.buildings.find((b) => b.kind === 'woodenBridge');
  assert.equal(bridge.bridge.length, 15);
  assert.deepEqual(bridge.bridge.piers, piers.map(snap));
  assert.deepEqual(result.terrain6, before.terrain6);
  assert.deepEqual(result.inventory, before.inventory);
  assert.deepEqual(result.naturalResources, before.naturalResources);
  assert.deepEqual(result.trees, before.trees);
  assert.equal(result.coins, before.coins);
  assert.ok(bridge.baseElevation > 0.4);
  roundtrip(result);
  const forged = clone(result);
  forged.buildings.find((b) => b.id === bridge.id).baseElevation = 0.015;
  assert.throws(() => g.importSave(JSON.stringify(forged), result.lastSeenAt), /高度/);
});
test('v6 bridge full span rejects blockers, edited terrain, stale sources, moves and invalid quarter turns atomically', () => {
  const state = bridgeTown(),
    command = {
      type: 'dragMerge',
      sourceId: 'b3',
      targetId: 'b4',
      sources: state.buildings.filter((b) => ['b3', 'b4'].includes(b.id)).map(snap),
    };
  for (const obstruct of [
    (s) => s.trees.push({ id: 't999', x: 139, z: 135 }),
    (s) => s.naturalResources.push({ id: 'n139_135', kind: 'soil', amount: 1, x: 139, z: 135 }),
    (s) => s.groundStacks.push({ item: 'wood', amount: 1, x: 139, z: 135 }),
    (s) =>
      s.looseDrops.push({ id: 'd999', item: 'wood', amount: 1, x6: 139 * 6 + 3, z6: 135 * 6 + 3 }),
    (s) => s.buildings.push({ id: 'b999', kind: 'crate', x: 139, z: 135, rotation: 0 }),
    (s) => s.landExtensions.push({ x: 139, z: 135 }),
    (s) => s.terrain6.cells.push({ x: 133, z: 135 }),
  ]) {
    const blocked = clone(state);
    obstruct(blocked);
    reject(blocked, command);
  }
  const merged = mergeBridge(state),
    b = merged.buildings.find((q) => q.kind === 'woodenBridge');
  for (const cell of g.bridgeSpanCells({ ...b, length: b.bridge.length })) {
    assert.ok(
      require('../.domain-build/domain/building-cells').buildingOccupiesCell(b, cell.x, cell.z),
    );
    reject(merged, { type: 'editTerrain6', kind: 'dig', ...cell, level: 0, expectedOperation: 1 });
    reject(merged, {
      type: 'editTerrain6',
      kind: 'fill',
      ...cell,
      level: 1,
      expectedOperation: 1,
      material: 'soil',
      source: { type: 'inventory', item: 'soil', amount: merged.inventory.soil },
    });
  }
  reject(merged, { type: 'moveBuilding', buildingId: b.id, x: 1, z: 1, source: snap(b) });
  reject(merged, {
    type: 'moveBuilding',
    buildingId: b.id,
    x: b.x,
    z: b.z,
    source: { ...snap(b), x: 0 },
  });
  const moved = apply(merged, {
    type: 'moveBuilding',
    buildingId: b.id,
    x: b.x,
    z: b.z,
    source: snap(b),
  });
  assert.deepEqual(moved.buildings.find((q) => q.id === b.id).bridge, b.bridge);
  roundtrip(moved);
  assert.throws(() => validatePlacement(merged, { ...b, rotation: 0 }));
  const reversed = { ...b, rotation: 3 };
  validatePlacement(merged, reversed);
  assert.equal(reversed.baseElevation, b.baseElevation);
  const rotated = apply(merged, { type: 'rotateBuilding', buildingId: b.id });
  assert.equal(rotated.buildings.find((q) => q.id === b.id).rotation, 3);
  assert.deepEqual(rotated.buildings.find((q) => q.id === b.id).bridge, b.bridge);
  roundtrip(rotated);
  const relocation = clone(merged);
  let target;
  for (const dz of [-2, -1, 1, 2]) {
    try {
      const p = validateBridgeTerrain(relocation, { ...b, z: b.z + dz, length: b.bridge.length });
      target = { z: b.z + dz, plan: p };
      break;
    } catch {}
  }
  assert.ok(target, 'A second supported crossing for actual relocation');
  const keys = new Set(target.plan.occupiedCells.map((p) => `${p.x},${p.z}`));
  relocation.trees = relocation.trees.filter((p) => !keys.has(`${p.x},${p.z}`));
  relocation.naturalResources = relocation.naturalResources.filter(
    (p) => !keys.has(`${p.x},${p.z}`),
  );
  const changed = apply(relocation, {
    type: 'moveBuilding',
    buildingId: b.id,
    x: b.x,
    z: target.z,
    source: snap(b),
  });
  const relocated = changed.buildings.find((q) => q.id === b.id);
  assert.equal(relocated.z, target.z);
  assert.deepEqual(relocated.bridge, b.bridge);
  assert.equal(relocated.baseElevation, target.plan.baseElevation);
  roundtrip(changed);
});
test('v6 ramp mesh meets actual quarter-grid banks, deck clears terrain and supports embed in the real ground', () => {
  const state = mergeBridge(bridgeTown()),
    b = state.buildings.find((q) => q.kind === 'woodenBridge');
  const {
    v6BridgeProfile,
    v6BridgeWorldPoint,
  } = require('../.domain-build/domain/v6-bridge-profile');
  const { v6BridgeMesh } = require('../.domain-build/art/V6BridgeKit');
  const { v6BridgeFootings, v6BridgeBedLower } = require('../.domain-build/art/V6BridgeFootings');
  for (const rotation of [1, 3]) {
    const building = { ...b, rotation },
      placement = { ...building, length: b.bridge.length },
      p = v6BridgeProfile(1, placement),
      mesh = v6BridgeMesh(building, 1);
    assert.ok(mesh.positions.every(Number.isFinite));
    assert.ok(mesh.normals.every(Number.isFinite));
    for (let i = 0; i <= 8; i++)
      for (const side of [-1, 1]) {
        const x = i / 4 - 1,
          z = (side * b.bridge.length) / 2,
          q = v6BridgeWorldPoint(placement, x, z);
        assert.equal(p.height(x, z), world.groundHeight(q.x, q.z));
        assert.ok(
          mesh.positions.some(
            (v, index) =>
              index % 3 === 0 &&
              v === x &&
              Math.abs(mesh.positions[index + 1] + p.root - p.height(x, z)) < 1e-9 &&
              mesh.positions[index + 2] === z,
          ),
        );
      }
    for (let i = 0; i <= 8; i++)
      for (let j = 0; j <= 60; j++)
        assert.ok(p.height(i / 4 - 1, j / 4 - 7.5) >= p.ground(i / 4 - 1, j / 4 - 7.5));
    for (const foot of v6BridgeFootings(building, 1)) {
      const q = v6BridgeWorldPoint(placement, foot.x, foot.z);
      assert.ok(foot.height > 0);
      assert.ok(
        foot.y - foot.height / 2 + p.root <=
          v6BridgeBedLower(1, q.x, q.z, foot.width / 2) - 0.009999,
      );
    }
  }
});

test('v6 slope rope segment endpoints stay joined after height deformation and timber keeps a texture batch', () => {
  const { v6BridgeParts, v6BridgeMesh } = require('../.domain-build/art/V6BridgeKit');
  const state = mergeBridge(bridgeTown()),
    b = state.buildings.find((q) => q.kind === 'woodenBridge');
  const parts = v6BridgeParts(b, 1),
    mesh = v6BridgeMesh(b, 1);
  assert.ok(mesh.texturedIndices.length > 0 && mesh.texturedIndices.length < mesh.indices.length);
  for (const side of [-0.76, 0.76])
    for (const bank of [-1, 1]) {
      const ropes = parts
        .filter(
          (p) =>
            p.name === 'pier-rope-rail' &&
            p.position[0] === side &&
            Math.sign(p.position[2]) === bank,
        )
        .sort((a, b) => a.position[2] - b.position[2]);
      assert.equal(ropes.length, 6);
      const end = (p, sign) => {
        const angle = (p.rotation[0] * Math.PI) / 180,
          half = (p.size[1] - 0.006) / 2;
        return [
          p.position[1] + sign * Math.cos(angle) * half,
          p.position[2] + sign * Math.sin(angle) * half,
        ];
      };
      for (let i = 1; i < ropes.length; i++) {
        const a = end(ropes[i - 1], 1),
          b = end(ropes[i], -1);
        assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-12);
      }
    }
});

test('v6 runtime model and picking use the raised deck and both complete ramps without coordinate cache keys', () => {
  const { factory, ModelPicking } = require('./helpers/model-factory-ui.cjs');
  const state = mergeBridge(bridgeTown()),
    b = state.buildings.find((q) => q.kind === 'woodenBridge'),
    f = factory();
  const root = f.building(b, state.lastSeenAt, 1, 6, [], b.baseElevation),
    picker = new ModelPicking(root);
  assert.equal(root.position[1], b.baseElevation);
  for (const t of [0.01, 0.5, 1, 1.75, 2.4, 7, 12.4, 13.25, 14, 14.99]) {
    const hit = picker.distance({ o: { x: b.x + t, y: 10, z: b.z + 1 }, d: { x: 0, y: -1, z: 0 } });
    assert.ok(hit > 0 && hit < 10, `Raised deck and ramp pick ${t}`);
  }
  assert.ok(root.getChildByName('BridgeSupports').children.length > 0);
  assert.deepEqual([...f.assets.meshes.keys()], ['v5-pier-foot-unit']);
  f.dispose();
});

test('v6 reclamation spends the original nine mud, protects beds, freshwater, occupied cells and dock berths', () => {
  let state = clone(initial);
  const plan = find(1),
    hydro = world.hydrology;
  const beds = plan.fill.map((p) => hydro.sample(p.x + 0.5, p.z + 0.5).height);
  for (const p of plan.fill) {
    state.groundStacks.push({ x: 5, z: 8, item: 'mud', amount: 9 });
    state = apply(state, { type: 'expandLand', fromX: 5, fromZ: 8, ...p });
    assert.equal(state.groundStacks.length, 0);
  }
  assert.deepEqual(
    plan.fill.map((p) => hydro.sample(p.x + 0.5, p.z + 0.5).height),
    beds,
  );
  const pier = { id: 'b3', kind: 'woodenPier', x: plan.x, z: plan.z, rotation: plan.rotation };
  validatePlacement(state, pier);
  state.buildings.push(pier);
  addFree(state, 'crate', 'b4');
  addFree(state, 'orderBoard', 'b5');
  state.nextId = 6;
  state = apply(state, hammerAssemblyCommand(state, ['b3', 'b4', 'b5']));
  const dock = state.buildings.find((b) => b.id === 'b3');
  assert.equal(dock.kind, 'dock');
  assert.ok(g.hasDockExit(state, dock));
  roundtrip(state);
  state.groundStacks.push({ x: 5, z: 8, item: 'mud', amount: 9 });
  for (const p of [{ x: plan.x, z: plan.z + 2 }, v5DockBerthCells(dock)[0], plan.fill[0]])
    reject(state, { type: 'expandLand', fromX: 5, fromZ: 8, ...p });
  for (const kind of ['river', 'lake']) {
    let water;
    for (let z = 1; z < 191 && !water; z++)
      for (let x = 1; x < 191; x++)
        if (hydro.at(x, z).waterKind === kind) {
          water = { x, z };
          break;
        }
    assert.ok(water);
    reject(state, { type: 'expandLand', fromX: 5, fromZ: 8, ...water });
    assert.throws(() => validateV6Extensions(1, [...state.landExtensions, water]));
  }
  const occupied = clone(initial),
    p = plan.fill[0];
  occupied.groundStacks = [{ x: 5, z: 8, item: 'mud', amount: 9 }];
  occupied.buildings.push({
    id: 'b3',
    kind: 'woodenBridge',
    ...p,
    rotation: 0,
    bridge: { length: 7, piers: [] },
  });
  reject(occupied, { type: 'expandLand', fromX: 5, fromZ: 8, ...p });
});

test('v6 natural port reservation permits its real pier/dock purpose, not ordinary houses or edits', () => {
  const state = clone(initial),
    f = world.hydrology.feature;
  const pier = { id: 'b3', kind: 'woodenPier', x: f.anchor.x, z: f.anchor.z, rotation: f.rotation };
  validatePlacement(state, pier);
  assert.throws(() => validatePlacement(state, { ...pier, kind: 'house' }), /保留地/);
  reject(state, {
    type: 'editTerrain6',
    kind: 'dig',
    x: f.anchor.x,
    z: f.anchor.z,
    level: 0,
    expectedOperation: 1,
  });
  const dock = { ...pier, kind: 'dock', dockStyle: 'simple' };
  validatePlacement(state, dock);
  assert.ok(g.hasDockExit(state, dock));
  state.buildings.push(dock);
  state.nextId = 4;
  initializeFacility(state.commerce, dock);
  roundtrip(state);
});

test('v6 integer recipes, attachments, trade and storage leave fractional real material intact', () => {
  let state = clone(initial);
  state.inventory.stone = 1.5;
  state.inventory.soil = 0.25;
  const shop = addFree(state, 'shop', 'b3');
  state.nextId = 4;
  initializeFacility(state.commerce, shop);
  state = apply(state, {
    type: 'shopTrade',
    buildingId: shop.id,
    item: 'stone',
    quantity: 1,
    side: 'sell',
  });
  assert.equal(state.inventory.stone, 0.5);
  reject(state, {
    type: 'shopTrade',
    buildingId: shop.id,
    item: 'stone',
    quantity: 0.5,
    side: 'sell',
  });
  state.inventory.stone += 1;
  state = apply(state, { type: 'attachMaterial', buildingId: 'b1', item: 'stone', quantity: 1 });
  assert.equal(state.inventory.stone, 0.5);
  state = apply(state, { type: 'detachMaterial', buildingId: 'b1', item: 'stone', quantity: 1 });
  assert.equal(state.inventory.stone, 1.5);
  const stock = { ...emptyStock(), soil: 16 - 1 / 4096 };
  state.inventory = stock;
  state.looseDrops = [
    {
      id: `d${state.nextId++}`,
      item: 'soil',
      amount: 1 / 4096,
      x6: 5 * 6 + 3,
      z6: 8 * 6 + 3,
      source: { type: 'terrain6', x: 77, z: 43, operation: 1, kind: 'soil' },
    },
  ];
  const drop = state.looseDrops[0];
  state = apply(state, { type: 'pickupDrop', dropId: drop.id });
  assert.equal(g.getUsedStorage(state), 16);
  state.looseDrops = [{ ...drop, id: `d${state.nextId++}` }];
  reject(state, { type: 'pickupDrop', dropId: state.looseDrops[0].id });
});

if (process.env.V6_DOMAIN_METRICS)
  test('record exact undeformed v6 bridge endpoint evidence', () => {
    const fs = require('node:fs'),
      path = require('node:path');
    const positions = [
      ...Array.from({ length: 4 }, (_, i) => ({ x: 133 + (i % 2), z: 135 + Math.floor(i / 2) })),
      ...Array.from({ length: 4 }, (_, i) => ({ x: 146 + (i % 2), z: 135 + Math.floor(i / 2) })),
    ];
    const cells = positions.map((p) => {
      const c = world.at(p.x, p.z),
        h = world.hydrology.at(p.x, p.z);
      return {
        ...p,
        groundRange: c.groundRange,
        baseElevation: c.baseElevation,
        naturalHeight: c.naturalHeight,
        hydrology: { state: h.state, waterKind: h.waterKind, dryLower: h.dryLower },
        reserve: c.reserved,
      };
    });
    const result = {
      seed: 1,
      span: { x: 133, z: 135, rotation: 1, length: 15 },
      cells,
      min: Math.min(...cells.map((c) => c.groundRange[0])),
      max: Math.max(...cells.map((c) => c.groundRange[1])),
      existingRenderer: {
        bridgeRoot: -0.365,
        bridgeDeckTop: 0.015,
        pierDeckOffset: 0.38,
        pierFootOffset: -0.16,
      },
      claim:
        'Actual sloped bank bounds, not rounded visual estimates. No water or shore geometry changed.',
    };
    const file = path.resolve(
      __dirname,
      '../../terrain-v5-lab/terrain6-integration-domain/bridge-endpoints.json',
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
    console.log('V6_BRIDGE_ENDPOINTS', JSON.stringify(result));
  });
