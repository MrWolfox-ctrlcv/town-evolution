/** Actual production assembly and canonical CPU triangles. Not a Cocos/GPU/device pass. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { factory, ModelPicking, worldSurface } = require('./helpers/model-factory-ui.cjs');
const { load } = require('./helpers/selection-ui.cjs');
const { DropSupport } = load('DropSupport');
const { dropShape } = require('../.domain-build/application/DropGeometry');
const { V6TreeBatchBuilder, v5TreeVisual } = require('../.domain-build/art/V6TreeGeometry');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
class Motion {
  configure() {}
}
test('v6 elevated farms move actual nested beds, crops and collection boxes exactly once in every rotation', () => {
  const f = factory({ './CropMotion': { CropMotion: Motion } }),
    height = Math.fround(8.015);
  for (const size of [3, 6])
    for (const rotation of [0, 1, 2, 3]) {
      const b = {
        id: 'farm',
        kind: 'farm',
        x: 40,
        z: 50,
        rotation,
        ...(size === 6 ? { farmSize: 6 } : {}),
        irrigated: true,
        collectionBox: { stock: { rice: 2 } },
        cropJobs: Array(size * size).fill(null),
      };
      b.cropJobs[0] = { id: 'crop', crop: 'rice', startedAt: 0, readyAt: 1000 };
      const low = f.building(b, 2000, 1, 6, [], 0),
        high = f.building(b, 2000, 1, 6, [], height);
      for (const name of ['Soil', 'Cell0', 'FarmCollectionBox']) {
        const a = low.getChildByName('FarmGrid').getChildByName(name),
          c = high.getChildByName('FarmGrid').getChildByName(name),
          aa = worldSurface(a),
          cc = worldSurface(c);
        near(cc.bounds.min[1] - aa.bounds.min[1], height);
        near(cc.bounds.max[1] - aa.bounds.max[1], height);
        for (const axis of [0, 2]) {
          near(cc.bounds.min[axis], aa.bounds.min[axis]);
          near(cc.bounds.max[axis], aa.bounds.max[axis]);
        }
      }
      const surface = worldSurface(high),
        x = (surface.bounds.min[0] + surface.bounds.max[0]) / 2,
        z = (surface.bounds.min[2] + surface.bounds.max[2]) / 2;
      const ray = { o: { x, y: 40, z }, d: { x: 0, y: -1, z: 0 } },
        p0 = new ModelPicking(low).distance(ray),
        p1 = new ModelPicking(high).distance(ray);
      assert.notEqual(p0, null);
      assert.notEqual(p1, null);
      near(p0 - p1, height);
    }
  f.dispose();
});
test('v6 farm drop support adds its validated base elevation once and invalidates on a height change', () => {
  const support = new DropSupport(),
    farm = { id: 'farm', kind: 'farm', x: 40, z: 50, rotation: 0, irrigated: true },
    rect = { minX: 40.85, maxX: 41.15, minZ: 50.85, maxZ: 51.15 };
  support.setFarms([farm]);
  const original = support.height(rect),
    old = support.revision;
  support.setFarms([farm], () => 7.015);
  near(support.height(rect), original + 7.015);
  assert.equal(support.revision, old + 1);
  support.setFarms([farm], () => 7.015);
  assert.equal(support.revision, old + 1);
  support.setFarms([farm], () => 9.015);
  near(support.height(rect), original + 9.015);
});
test('positive v6 material fragments map to nonempty canonical geometry without changing the saved amount', () => {
  for (const item of ['soil', 'stone'])
    for (const amount of [1 / 4096, 7 / 4096, 0.5, 1.25, 4.999755859375]) {
      const drop = { item, amount },
        shape = dropShape(drop);
      assert.equal(shape.asset, `pile-${item}-${Math.ceil(amount)}`);
      assert.ok(shape.width > 0 && shape.depth > 0 && shape.scale > 0);
      assert.equal(drop.amount, amount);
    }
});
test('v6 tree batches sample actual offset trunk anchors and preserve real IDs without per-tree nodes', () => {
  const trees = [{ id: 'saved-tree', x: 40, z: 50, stage: 3 }],
    calls = [],
    height = (x, z) => {
      calls.push([x, z]);
      return 10 + x * 0.1 + z * 0.02;
    };
  const builder = new V6TreeBatchBuilder(1937, trees, false, height);
  builder.append();
  const batch = builder.finish(),
    visual = v5TreeVisual(1937, 40, 50);
  assert.deepEqual(calls, [[40.5 + visual.offset[0], 50.5 + visual.offset[2]]]);
  assert.ok(batch.surfaces.has('saved-tree'));
  assert.equal(batch.surfaces.size, 1);
  const flat = new V6TreeBatchBuilder(1937, trees, false, () => 0);
  flat.append();
  const base = flat.finish().mesh.positions,
    shift = height(...calls[0]);
  for (let i = 1; i < base.length; i += 3)
    assert.ok(Math.abs(batch.mesh.positions[i] - base[i] - shift) < 2e-6);
  assert.deepEqual(
    batch.anchors.map((p) => [p.x, p.z]),
    calls.slice(0, 1),
  );
});

test('terrain6 tree load bounds and camera LOD span stay independent', () => {
  const { V6TreeStreaming } = require('../.domain-build/application/V6TreeStreaming');
  const stream = new V6TreeStreaming(
    () => true,
    () => {},
    () => {},
    () => 9.015,
  );
  stream.sync({ mapSeed: 1937, lastSeenAt: 0, trees: [{ id: 'real-tree', x: 40, z: 50 }] }, 0);
  const bounds = { minX: 0, minZ: 0, maxX: 120, maxZ: 120 };
  assert.equal(
    stream.frame(
      bounds,
      { maxTrees: 50, maxMilliseconds: 100, maxUploadBytes: 8 * 1024 * 1024, lodSpan: 30 },
      () => 0,
    ),
    true,
  );
  assert.equal(
    [...stream.live.values()][0].far,
    false,
    'high-elevation bounds must not force far LOD while zoomed in',
  );
  assert.equal(
    stream.frame(
      bounds,
      { maxTrees: 50, maxMilliseconds: 100, maxUploadBytes: 8 * 1024 * 1024, lodSpan: 90 },
      () => 0,
    ),
    true,
  );
  assert.equal([...stream.live.values()][0].far, true);
  stream.dispose();
});

test('v6 elevated dock footings keep their world embed and their original-post overlap independently', () => {
  const { v6PierFootings } = require('../.domain-build/art/V6PierFootings');
  const {
    v5PierFootings,
    V5_PIER_BED_LOWER,
    V5_PIER_EMBED,
  } = require('../.domain-build/art/V5PierFootings');
  for (const simple of [false, true])
    for (const base of [Math.fround(0.015), 1.015, 7.015, 64.015]) {
      const old = v5PierFootings(simple, 3),
        feet = v6PierFootings(simple, 3, base);
      for (let i = 0; i < feet.length; i++) {
        const f = feet[i];
        near(base + f.y - f.height / 2, V5_PIER_BED_LOWER - V5_PIER_EMBED);
        near(f.y + f.height / 2, old[i].y + old[i].height / 2);
        near(base + f.y + f.height / 2 - (base - 0.42), 0.005);
        assert.equal(f.x, old[i].x);
        assert.equal(f.z, old[i].z);
        assert.equal(f.width, old[i].width);
      }
    }
});

test('v6 crop air-gap assistance follows the same raised farm plane without changing legacy height', () => {
  const { pickFarmCrop } = require('../.domain-build/application/FarmPicking');
  const b = {
    id: 'f',
    kind: 'farm',
    x: 40,
    z: 50,
    rotation: 0,
    cropJobs: [{ id: 'j', crop: 'rice', startedAt: 0, readyAt: 1 }, ...Array(8).fill(null)],
  };
  const ray = { o: { x: 40 + 1 / 3, y: 30, z: 50 + 1 / 3 }, d: { x: 0, y: -1, z: 0 } },
    low = pickFarmCrop([b], ray, 2),
    high = pickFarmCrop([{ ...b, baseElevation: 7.015 }], ray, 2);
  assert.ok(low && high);
  assert.equal(high.cell, low.cell);
  near(low.distance - high.distance, 7.015);
});
