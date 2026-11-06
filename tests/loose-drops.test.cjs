const test = require('node:test'),
  assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { emptyStock } = require('../.domain-build/domain/commerce');
const { clone } = require('../.domain-build/domain/state');
function town() {
  const s = g.createGame(1000, 1, 1);
  s.trees = [];
  s.naturalResources = [];
  s.inventory = { ...emptyStock(), vegetable: 1 };
  return s;
}
function accept(s, c, now = s.lastSeenAt) {
  const text = JSON.stringify(s),
    r = g.dispatch(s, c, now);
  assert.equal(r.ok, true, r.error);
  assert.equal(JSON.stringify(s), text);
  assert.deepEqual(g.importSave(g.exportSave(r.state), r.state.lastSeenAt), r.state);
  return r.state;
}
function reject(s, c, now = s.lastSeenAt) {
  const text = JSON.stringify(s),
    r = g.dispatch(s, c, now);
  assert.equal(r.ok, false);
  assert.equal(r.state, s);
  assert.equal(JSON.stringify(s), text);
}
function ripe() {
  let s = accept(town(), { type: 'plantCell', buildingId: 'b2', cell: 4 });
  return { ...s, lastSeenAt: 16000 };
}
test('harvest drops at exact rotated cell center; inventory only rises on explicit pickup', () => {
  for (let rotation = 0; rotation < 4; rotation++) {
    let s = ripe();
    s.buildings[1].rotation = rotation;
    const anchor = g.cropDropAnchor(s.buildings[1], 4);
    s.inventory.wood = g.getCapacity(s);
    const before = { ...s.inventory };
    s = accept(s, { type: 'harvestCell', buildingId: 'b2', cell: 4 });
    assert.deepEqual(s.inventory, before);
    assert.equal(s.buildings[1].cropJobs[4], null);
    assert.deepEqual({ x6: s.looseDrops[0].x6, z6: s.looseDrops[0].z6 }, anchor);
    assert.equal(
      s.looseDrops.reduce((n, d) => n + d.amount, 0),
      2,
    );
    reject(s, { type: 'pickupDrop', dropId: s.looseDrops[0].id });
    s.inventory.wood -= 2;
    const id = s.looseDrops[0].id;
    s = accept(s, { type: 'pickupDrop', dropId: id });
    assert.equal(s.inventory.vegetable, 2);
    assert.equal(s.looseDrops.length, 0);
    reject(s, { type: 'pickupDrop', dropId: id });
  }
});
test('soil nine splits five plus four and rock survives until its last layer; no global storage required', () => {
  for (const kind of ['soil', 'stone']) {
    let s = g.createGame(1000, 1, 3);
    const source = s.naturalResources.find((p) => p.kind === kind);
    assert.ok(source);
    s.trees = [];
    s.naturalResources = [source];
    s.inventory = emptyStock();
    s.inventory.wood = g.getCapacity(s);
    const old = source.amount;
    s = accept(s, { type: 'gatherNatural', resourceId: source.id });
    assert.equal(s.inventory[kind], 0);
    assert.deepEqual(
      s.looseDrops.map((d) => d.amount),
      kind === 'soil' ? [5, 4] : [1],
    );
    assert.equal(s.naturalResources[0]?.amount ?? 0, kind === 'soil' ? 0 : old - 1);
    if (kind === 'soil') reject(s, { type: 'gatherNatural', resourceId: source.id });
  }
});
test('large crop snapshots split into bounded stacks without changing promised yield', () => {
  let s = ripe();
  s.buildings[1].cropJobs[4].yield = 27;
  s = accept(s, { type: 'harvestCell', buildingId: 'b2', cell: 4 });
  assert.deepEqual(
    s.looseDrops.map((d) => d.amount),
    [10, 10, 7],
  );
  assert.equal(s.inventory.vegetable, 0);
});
test('insufficient local space and ID exhaustion retain mature job, inventory, tools and discovery', () => {
  for (const block of ['space', 'id']) {
    const s = ripe();
    if (block === 'space') {
      const a = g.cropDropAnchor(s.buildings[1], 4);
      for (let dz = -12; dz <= 12; dz += 2)
        for (let dx = -12; dx <= 12; dx += 2)
          s.looseDrops.push({
            id: `d${s.nextId++}`,
            item: 'vegetable',
            amount: 10,
            x6: a.x6 + dx,
            z6: a.z6 + dz,
            source: { type: 'crop', buildingId: 'b2', cell: 0, jobId: 'j3' },
          });
    } else s.nextId = 1000000000;
    reject(s, { type: 'harvestCell', buildingId: 'b2', cell: 4 });
  }
});
test('loose drops stay fixed after farm movement; deep cloning and layout guards prevent burial', () => {
  let s = accept(ripe(), { type: 'harvestCell', buildingId: 'b2', cell: 4 });
  const drops = JSON.stringify(s.looseDrops),
    copy = clone(s);
  assert.notEqual(copy.looseDrops[0].source, s.looseDrops[0].source);
  s = accept(s, { type: 'moveBuilding', buildingId: 'b2', x: 10, z: 7 });
  assert.equal(JSON.stringify(s.looseDrops), drops);
  const d = s.looseDrops[0],
    x = Math.floor(d.x6 / 6),
    z = Math.floor(d.z6 / 6);
  reject(s, { type: 'placeTree', x, z });
  s.inventory.wood = 1;
  reject(s, { type: 'dropProduct', item: 'wood', quantity: 1, x, z });
  reject(s, { type: 'moveBuilding', buildingId: 'b1', x, z });
});

test('drops and box goods are planting sources, never a reason to mint emergency crops', () => {
  let s = accept(ripe(), { type: 'harvestCell', buildingId: 'b2', cell: 4 });
  s.coins = 0;
  assert.equal(g.hasPlantingSource(s), true);
  reject(s, { type: 'recoverCrop' });
  s.looseDrops = [];
  s.buildings[1].collectionBox = {
    crateId: `b${s.nextId++}`,
    capacity: 16,
    stock: { ...emptyStock(), rice: 1 },
  };
  assert.equal(g.hasPlantingSource(s), true);
  reject(s, { type: 'recoverCrop' });
});
test('integer crop coordinates agree with actual farm cell rotation for every small and large cell', () => {
  const { farmCellCenter } = require('../.domain-build/application/FarmCells');
  for (const farmSize of [undefined, 6])
    for (let rotation = 0; rotation < 4; rotation++) {
      const farm = {
        id: 'b2',
        kind: 'farm',
        x: 6,
        z: 3,
        rotation,
        ...(farmSize ? { farmSize } : {}),
      };
      for (let cell = 0; cell < (farmSize ? 36 : 9); cell++) {
        const a = g.cropDropAnchor(farm, cell),
          b = farmCellCenter(farm, cell);
        assert.ok(Math.abs(a.x6 / 6 - b.x) < 1e-9);
        assert.ok(Math.abs(a.z6 / 6 - b.z) < 1e-9);
        assert.equal(g.farmCellAtSixths(farm, a), cell);
      }
    }
});
test('replanting cannot bury a drop and large harvests never spill into another planted cell', () => {
  let s = ripe();
  const farm = s.buildings[1];
  for (let cell = 0; cell < 9; cell++)
    if (cell !== 4)
      farm.cropJobs[cell] = {
        id: `j${s.nextId++}`,
        startedAt: 1000,
        readyAt: 16000,
        crop: 'wheat',
        durationMs: 15000,
        yield: 2,
      };
  farm.cropJobs[4].yield = 100;
  s = accept(s, { type: 'harvestCell', buildingId: 'b2', cell: 4 });
  for (const d of s.looseDrops) {
    const cell = g.farmCellAtSixths(s.buildings[1], d);
    assert.ok(cell === null || cell === 4);
  }
  s.inventory.vegetable = 1;
  reject(s, { type: 'plantCell', buildingId: 'b2', cell: 4 });
  const malformed = structuredClone(s);
  malformed.buildings[1].cropJobs[4] = {
    id: `j${malformed.nextId++}`,
    startedAt: 16000,
    readyAt: 31000,
    crop: 'vegetable',
    durationMs: 15000,
    yield: 2,
  };
  assert.throws(() => g.importSave(JSON.stringify(malformed), 16000));
});
test('global drop limit is lossless at the exact boundary and manual pickup reopens capacity', () => {
  let s = g.createGame(1000, 1, 4);
  s.trees = [];
  s.naturalResources = [];
  s.inventory = { ...emptyStock(), vegetable: 1 };
  s = accept(s, { type: 'plantCell', buildingId: 'b2', cell: 4 });
  s.lastSeenAt = 16000;
  const source = { type: 'crop', buildingId: 'b2', cell: 0, jobId: 'j3' },
    a = g.cropDropAnchor(s.buildings[1], 4),
    size = g.worldSize(s.terrainVersion);
  outer: for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      if (
        !g.isLandCell(x, z, s.mapSeed, s.terrainVersion, s.landExtensions) ||
        s.buildings.some((b) => g.buildingOccupiesCell(b, x, z))
      )
        continue;
      for (const dz of [1, 3, 5])
        for (const dx of [1, 3, 5]) {
          const x6 = x * 6 + dx,
            z6 = z * 6 + dz;
          if (Math.abs(x6 - a.x6) <= 14 && Math.abs(z6 - a.z6) <= 14) continue;
          s.looseDrops.push({
            id: `d${s.nextId++}`,
            item: 'vegetable',
            amount: 1,
            x6,
            z6,
            source: { ...source },
          });
          if (s.looseDrops.length === g.LOOSE_DROPS.maxCount) break outer;
        }
    }
  assert.equal(s.looseDrops.length, 4096);
  assert.deepEqual(g.importSave(g.exportSave(s), 16000), s);
  reject(s, { type: 'harvestCell', buildingId: 'b2', cell: 4 });
  s = accept(s, { type: 'pickupDrop', dropId: s.looseDrops[0].id });
  s = accept(s, { type: 'harvestCell', buildingId: 'b2', cell: 4 });
  assert.equal(s.looseDrops.length, 4096);
  assert.equal(s.looseDrops.at(-1).amount, 2);
});
