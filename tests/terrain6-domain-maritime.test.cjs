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

test('v6 refuses sloped real river endpoints instead of silently flattening protected shores', () => {
  const state = clone(initial),
    span = { x: 133, z: 135, rotation: 1, length: 15 };
  assert.throws(() => validateBridgeTerrain(state, span), /木桥桩基与桥面高度尚未完成/);
  const plan = validateBridgeTerrain({ ...state, terrainVersion: 5 }, span);
  assert.equal(plan.endpointCells.length, 8);
  const ranges = plan.endpointCells.map((p) => world.at(p.x, p.z).groundRange);
  assert.ok(ranges.some(([lo, hi]) => hi > lo));
  const keys = new Set(plan.occupiedCells.map((p) => `${p.x},${p.z}`));
  state.trees = state.trees.filter((p) => !keys.has(`${p.x},${p.z}`));
  state.naturalResources = state.naturalResources.filter((p) => !keys.has(`${p.x},${p.z}`));
  const pier = { id: 'b3', kind: 'woodenPier', x: 133, z: 135, rotation: 0 };
  assert.throws(() => validatePlacement(state, pier), /同一平面/);
  const forged = clone(initial);
  forged.nextId = 5;
  forged.buildings.push({
    id: 'b3',
    kind: 'woodenBridge',
    x: 133,
    z: 135,
    rotation: 1,
    baseElevation: 0.015,
    bridge: {
      length: 15,
      piers: [
        { id: 'b3', kind: 'woodenPier', x: 133, z: 135, rotation: 0 },
        { id: 'b4', kind: 'woodenPier', x: 146, z: 135, rotation: 0 },
      ],
    },
  });
  assert.throws(() => g.importSave(JSON.stringify(forged), 1000), /木桥桩基与桥面高度尚未完成/);
  reject(state, {
    type: 'editTerrain6',
    kind: 'dig',
    x: 133,
    z: 135,
    level: 0,
    expectedOperation: 1,
  });
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
