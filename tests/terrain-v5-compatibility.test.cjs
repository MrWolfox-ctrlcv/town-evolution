/** Independent old-world evidence captured before v5 entry points changed. Do not regenerate to fit v5. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const g = require('../.domain-build/domain/game');
const { expectedSchema10 } = require('./helpers/expected-schema10.cjs');
const manifest = require('./fixtures/terrain-v1-v4-pre-v5.json');
const compressed = fs.readFileSync(path.join(__dirname, 'fixtures/terrain-v1-v4-pre-v5.json.gz'));
const hash = (value) =>
  crypto
    .createHash('sha256')
    .update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value))
    .digest('hex');
assert.equal(hash(compressed), manifest.fixtureSha256, 'Pre-v5 evidence must not drift');
const fixtures = JSON.parse(zlib.gunzipSync(compressed).toString('utf8'));
assert.equal(fixtures.length, 20);

// Compare captured schema9 bytes after removing only the approved additive migration.
// All original values, property order, terrain identities and fixture hashes remain exact.
function schema9Projection(state) {
  const raw = JSON.parse(g.exportSave(state));
  assert.equal(raw.schemaVersion, 10);
  raw.schemaVersion = 9;
  const stocks = [
    raw.inventory,
    ...Object.values(raw.fusion.attachments),
    ...Object.values(raw.commerce.shopStock),
    ...Object.values(raw.commerce.dockCargo),
  ];
  for (const shipment of Object.values(raw.commerce.shipments)) {
    stocks.push(shipment.cargo);
    if (shipment.unitPrices) stocks.push(shipment.unitPrices);
  }
  for (const building of raw.buildings)
    if (building.collectionBox) stocks.push(building.collectionBox.stock);
  for (const stock of stocks) {
    assert.equal(stock.roastedCarrot, 0, 'Migration cannot invent new goods or promised prices');
    delete stock.roastedCarrot;
  }
  return JSON.stringify(raw);
}

for (const record of manifest.records)
  test(`pre-v5 world ${record.version}, seed ${record.seed}: exact map, entities and old saves survive without resurrection`, () => {
    const { version, seed, now, size } = record;
    const old = fixtures.find((f) => f.version === version && f.seed === seed);
    assert.ok(old);
    assert.equal(hash(old.initial), record.saveHash);
    assert.equal(hash(old.depleted), record.depletedSaveHash);
    const state = g.createGame(now, seed, version);
    assert.equal(state.terrainVersion, version);
    assert.equal(g.worldSize(version), size);
    const land = [],
      terrain = [];
    for (let z = 0; z < size; z++)
      for (let x = 0; x < size; x++) {
        land.push(g.isLandCell(x, z, seed, version) ? 1 : 0);
        terrain.push(g.terrainAt(x, z, seed, version));
      }
    assert.equal(
      land.reduce((total, value) => total + value, 0),
      record.landCount,
    );
    assert.equal(hash(land), record.landHash, 'Every old land/water cell stays identical');
    assert.equal(hash(terrain), record.terrainHash, 'Every old biome and height stays identical');
    assert.equal(state.trees.length, record.treeCount);
    assert.equal(
      hash(state.trees),
      record.treesHash,
      'Old tree order, positions and IDs are unchanged',
    );
    assert.equal(state.naturalResources.length, record.resourceCount);
    assert.equal(
      hash(state.naturalResources),
      record.resourcesHash,
      'Old resource IDs and amounts are unchanged',
    );
    assert.equal(hash(schema9Projection(state)), record.saveHash);
    assert.deepEqual(state, expectedSchema10(JSON.parse(old.initial)));
    for (const text of [old.initial, old.depleted]) {
      const expected = expectedSchema10(JSON.parse(text));
      assert.equal(
        schema9Projection(g.importSave(text, now)),
        text,
        'Import preserves every original serialized value and order except additive migration',
      );
      assert.deepEqual(g.importSave(text, now), expected);
      let restored = g.importSave(text, now + 3600000);
      assert.deepEqual(restored, { ...expected, lastSeenAt: now + 3600000 });
      for (let round = 0; round < 3; round++)
        restored = g.importSave(g.exportSave(restored), restored.lastSeenAt);
      assert.deepEqual(restored, { ...expected, lastSeenAt: now + 3600000 });
      assert.equal(restored.nextId, expected.nextId);
      assert.equal(restored.nextTreeId, expected.nextTreeId);
      assert.equal(restored.terrainVersion, version);
    }
    const depleted = g.importSave(old.depleted, now);
    for (const id of record.removed.trees)
      assert.equal(
        depleted.trees.some((tree) => tree.id === id),
        false,
      );
    for (const id of record.removed.resources)
      assert.equal(
        depleted.naturalResources.some((resource) => resource.id === id),
        false,
      );
    assert.deepEqual(
      depleted.looseDrops,
      JSON.parse(old.depleted).looseDrops,
      'Unpicked output keeps its identities and quantities',
    );
  });

function accepted(state, command) {
  const before = g.exportSave(state);
  const result = g.dispatch(state, command, state.lastSeenAt);
  assert.equal(result.ok, true, result.error);
  assert.equal(g.exportSave(state), before, 'Commands cannot mutate the previous snapshot');
  assert.deepEqual(g.importSave(g.exportSave(result.state), state.lastSeenAt), result.state);
  return result.state;
}
function rejected(state, command) {
  const before = g.exportSave(state);
  const result = g.dispatch(state, command, state.lastSeenAt);
  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  assert.equal(g.exportSave(state), before);
}
function hydrologyDigest(field) {
  const digest = crypto.createHash('sha256');
  for (let z = 0; z < field.size; z++)
    for (let x = 0; x < field.size; x++)
      digest.update(JSON.stringify([field.at(x, z), field.fields(x + 0.5, z + 0.5)]));
  return digest.digest('hex');
}
function itemAmount(state, item) {
  return (
    state.inventory[item] +
    state.groundStacks.reduce((n, pile) => n + (pile.item === item ? pile.amount : 0), 0) +
    state.looseDrops.reduce((n, drop) => n + (drop.item === item ? drop.amount : 0), 0)
  );
}
// Nine soil make one mud; nine mud make one reclaimed tile. No stock is injected in this route.
function soilLedger(state) {
  return (
    itemAmount(state, 'soil') + 9 * itemAmount(state, 'mud') + 81 * state.landExtensions.length
  );
}

for (const seed of [1, 42, 42173, 1000000000])
  test(`explicit v5 seed ${seed} is deterministic, uses real saved identities and does not replace default v4`, () => {
    const { getV5World } = require('../.domain-build/domain/v5-world');
    const state = g.createGame(123000, seed, 5),
      world = getV5World(seed);
    assert.equal(state.schemaVersion, 10);
    assert.equal(state.terrainVersion, 5);
    assert.equal(g.worldSize(5), 192);
    const defaultWorld = g.createGame(123000, seed);
    assert.equal(defaultWorld.terrainVersion, 4);
    for (const version of [1, 2, 3, 4]) {
      const old = manifest.records.find(
        (record) => record.version === version && record.seed === seed,
      );
      assert.equal(
        hash(schema9Projection(g.createGame(123000, seed, version))),
        old.saveHash,
        'Generating v5 cannot poison a same-seed legacy world cache',
      );
    }
    assert.deepEqual(g.createGame(123000, seed, 5), state);
    assert.deepEqual(g.importSave(g.exportSave(state), 123000), state);
    assert.ok(state.trees.length > 0);
    assert.ok(state.naturalResources.some((resource) => resource.kind === 'soil'));
    assert.ok(
      state.naturalResources.some((resource) => resource.kind === 'stone' && resource.amount > 16),
    );
    const cells = new Set(),
      ids = new Set();
    for (const entity of [...state.trees, ...state.naturalResources]) {
      assert.equal(ids.has(entity.id), false);
      ids.add(entity.id);
      const key = `${entity.x},${entity.z}`;
      assert.equal(cells.has(key), false);
      cells.add(key);
      assert.equal(world.hydrology.at(entity.x, entity.z).state, 'dryBuildable');
      assert.equal(g.isLandCell(entity.x, entity.z, seed, 5), true);
      if ('kind' in entity) {
        assert.equal(entity.id, `n${entity.x}_${entity.z}`);
        assert.equal(entity.amount, world.recipe.initialStock(entity.x, entity.z));
        assert.ok(entity.amount > 0 && entity.amount <= 64);
      } else assert.match(entity.id, /^t[1-9][0-9]*$/);
    }
    for (const mutate of [
      (raw) => {
        raw.terrainVersion = 6;
      },
      (raw) => {
        raw.schemaVersion = 12;
      },
      (raw) => {
        delete raw.naturalResources;
      },
      (raw) => {
        delete raw.looseDrops;
      },
      (raw) => {
        raw.naturalResources[0].amount = 65;
      },
      (raw) => {
        raw.naturalResources[0].amount++;
      },
      (raw) => {
        raw.trees[0].id = raw.trees[1].id;
      },
    ]) {
      const raw = JSON.parse(g.exportSave(state));
      mutate(raw);
      const text = JSON.stringify(raw);
      assert.throws(() => g.importSave(text, state.lastSeenAt));
      assert.equal(JSON.stringify(raw), text, 'Malformed saves are rejected without repair');
    }
  });

for (const seed of [1, 42173])
  test(`v5 seed ${seed}: real mining, pickup, mud conversion and coastal expansion conserve goods and protected water`, () => {
    const { getV5World } = require('../.domain-build/domain/v5-world');
    const { assertGroundCell } = require('../.domain-build/domain/ground-placement');
    let state = g.createGame(123000, seed, 5);
    const original = structuredClone(state),
      world = getV5World(seed),
      field = world.hydrology;
    const waterBefore = hydrologyDigest(field);
    const work = [];
    for (let z = 1; z < 35 && work.length < 3; z++)
      for (let x = 1; x < 35 && work.length < 3; x++) {
        try {
          assertGroundCell(state, x, z);
          work.push({ x, z });
        } catch {}
      }
    assert.equal(work.length, 3, 'The actual starter region has three usable processing tiles');
    const [left, right, mudSite] = work;
    const soilSources = state.naturalResources
      .filter((resource) => resource.kind === 'soil')
      .slice(0, 9);
    assert.equal(soilSources.length, 9);
    const stone = state.naturalResources.find(
      (resource) => resource.kind === 'stone' && resource.amount > 16,
    );
    state = accepted(state, { type: 'gatherNatural', resourceId: stone.id });
    assert.equal(state.inventory.stone, 0);
    assert.equal(itemAmount(state, 'stone'), 1);
    assert.equal(
      state.naturalResources.find((resource) => resource.id === stone.id).amount,
      stone.amount - 1,
    );
    assert.equal(soilLedger(state), 0);
    for (const [index, source] of soilSources.entries()) {
      const inventory = { ...state.inventory };
      state = accepted(state, { type: 'gatherNatural', resourceId: source.id });
      assert.deepEqual(state.inventory, inventory);
      assert.equal(
        state.naturalResources.some((resource) => resource.id === source.id),
        false,
      );
      const drops = state.looseDrops.filter(
        (drop) => drop.source.type === 'natural' && drop.source.resourceId === source.id,
      );
      assert.deepEqual(
        drops.map((drop) => drop.amount),
        [5, 4],
      );
      assert.ok(drops.every((drop) => drop.item === 'soil'));
      assert.equal(soilLedger(state), (index + 1) * 9);
      rejected(state, { type: 'gatherNatural', resourceId: source.id });
      for (const drop of drops) {
        state = accepted(state, { type: 'pickupDrop', dropId: drop.id });
        rejected(state, { type: 'pickupDrop', dropId: drop.id });
        assert.equal(soilLedger(state), (index + 1) * 9);
      }
      assert.equal(state.inventory.soil, 9);
      state = accepted(state, { type: 'dropProduct', item: 'soil', quantity: 5, ...left });
      state = accepted(state, { type: 'dropProduct', item: 'soil', quantity: 4, ...right });
      const water = { type: 'useTool', tool: 'wateringCan', ...left, sources: [left, right] };
      state = accepted(state, water);
      rejected(state, water);
      assert.equal(state.inventory.soil, 0);
      assert.equal(itemAmount(state, 'soil'), 0);
      assert.equal(itemAmount(state, 'mud'), index + 1);
      state = accepted(state, { type: 'moveStack', fromX: left.x, fromZ: left.z, ...mudSite });
      assert.equal(
        state.groundStacks.find((pile) => pile.x === mudSite.x && pile.z === mudSite.z).amount,
        index + 1,
      );
      assert.equal(soilLedger(state), (index + 1) * 9);
    }
    const touches = (x, z) =>
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dz]) => g.isLandCell(x + dx, z + dz, seed, 5));
    const protectedByKind = new Map();
    let coastal;
    for (let z = 1; z < 191; z++)
      for (let x = 1; x < 191; x++) {
        if (g.isLandCell(x, z, seed, 5) || !touches(x, z)) continue;
        const f = field.fields(x + 0.5, z + 0.5),
          cell = field.at(x, z);
        if (
          (cell.waterKind === 'lake' || cell.waterKind === 'river') &&
          f.freshwater + Math.SQRT1_2 > -4 &&
          !protectedByKind.has(cell.waterKind)
        )
          protectedByKind.set(cell.waterKind, { x, z });
        if (!coastal && f.freshwater + Math.SQRT1_2 <= -4 && f.ocean + Math.SQRT1_2 >= 0) {
          const trial = g.dispatch(
            state,
            { type: 'expandLand', fromX: mudSite.x, fromZ: mudSite.z, x, z },
            state.lastSeenAt,
          );
          if (trial.ok) coastal = { x, z };
        }
      }
    assert.equal(protectedByKind.size, 2, 'Real lake and river banks are both exercised');
    for (const point of protectedByKind.values()) {
      rejected(state, { type: 'expandLand', fromX: mudSite.x, fromZ: mudSite.z, ...point });
      const forged = JSON.parse(g.exportSave(state));
      forged.landExtensions = [point];
      assert.throws(() => g.importSave(JSON.stringify(forged), state.lastSeenAt));
      assert.equal(soilLedger(state), 81);
    }
    assert.ok(coastal, 'A real, safe sea edge permits reclamation');
    const count = g.landCellCount(seed, 5),
      buildings = structuredClone(state.buildings),
      trees = structuredClone(state.trees),
      resources = structuredClone(state.naturalResources);
    const expand = { type: 'expandLand', fromX: mudSite.x, fromZ: mudSite.z, ...coastal };
    state = accepted(state, expand);
    rejected(state, expand);
    assert.equal(itemAmount(state, 'mud'), 0);
    assert.equal(soilLedger(state), 81);
    assert.deepEqual(state.landExtensions, [coastal]);
    assert.equal(g.landCellCount(seed, 5, state.landExtensions), count + 1);
    assert.equal(g.isLandCell(coastal.x, coastal.z, seed, 5), false);
    assert.equal(g.isLandCell(coastal.x, coastal.z, seed, 5, state.landExtensions), true);
    assert.deepEqual(g.terrainAt(coastal.x, coastal.z, seed, 5, state.landExtensions), {
      biome: 'plain',
      elevation: 0,
    });
    assert.deepEqual(state.buildings, buildings);
    assert.deepEqual(state.trees, trees);
    assert.deepEqual(state.naturalResources, resources);
    assert.deepEqual(state.tools, original.tools);
    assert.equal(state.coins, original.coins);
    assert.equal(
      hydrologyDigest(field),
      waterBefore,
      'Neither mining nor reclaimed overlays can rewrite seeded rivers, lakes or coastline',
    );
    for (const resource of soilSources)
      assert.equal(world.recipe.initialStock(resource.x, resource.z), resource.amount);
    const restored = g.importSave(g.exportSave(state), state.lastSeenAt + 3600000);
    assert.deepEqual(restored, { ...state, lastSeenAt: state.lastSeenAt + 3600000 });
    assert.equal(
      itemAmount(restored, 'stone'),
      1,
      'Unpicked stone also survives the complete workflow',
    );
  });
