/** Actual ModelFactory + canonical indexed geometry/picker, CPU only. */
const test = require('node:test'),
  assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');
const { buildingAssetId } = require('../.domain-build/art/BuildingAssets');
const {
  bridgeSupports,
  BRIDGE_ROOT_HEIGHT,
  BRIDGE_DECK_TOP,
} = require('../.domain-build/art/WoodenBridgeKit');
const { bridgeFootings, bridgeBedLower } = require('../.domain-build/art/BridgeFootings');
const { getV5Hydrology } = require('../.domain-build/domain/v5-hydrology');
const { V5_COAST_STEP } = require('../.domain-build/art/V5CoastMesh');
const { factory, ModelPicking, worldSurface } = require('./helpers/model-factory-ui.cjs');
const state = g.createBridgeDemo(100000),
  piers = state.buildings.filter((b) => b.kind === 'woodenPier');
const plan = g.buildingMergePlan(state, piers[0].id, piers[1].id),
  bridge = plan.building;
function point(b, p) {
  const f = g.footprint(b),
    a = (b.rotation * Math.PI) / 2;
  return {
    x: b.x + f.width / 2 + p.x * Math.cos(a) + p.z * Math.sin(a),
    z: b.z + f.depth / 2 - p.x * Math.sin(a) + p.z * Math.cos(a),
  };
}
test('runtime real deck meets both banks, has actual full span picking and appended lower posts use one stable mesh', () => {
  const f = factory(),
    root = f.building(bridge, 100000, state.mapSeed, 5, []),
    size = g.footprint(bridge);
  assert.equal(root.position[1] + BRIDGE_DECK_TOP, 0.015000000000000013);
  const visual = root.getChildByName('BuildingMesh'),
    surface = worldSurface(visual);
  assert.ok(Math.abs(surface.bounds.min[0] - bridge.x) < 1e-10);
  assert.ok(Math.abs(surface.bounds.max[0] - (bridge.x + size.width)) < 1e-10);
  const picker = new ModelPicking(root);
  for (const t of [0.05, 1, 4, 7.45, 11, 14, 14.95]) {
    const hit = picker.distance({
      o: { x: bridge.x + t, y: 10, z: bridge.z + 1 },
      d: { x: 0, y: -1, z: 0 },
    });
    assert.ok(hit > 0 && hit < 10.1, `Full deck pick ${t}`);
  }
  const supports = root.getChildByName('BridgeSupports').children,
    feet = bridgeFootings(bridge, state.mapSeed);
  assert.equal(supports.length, feet.length);
  assert.ok(feet.length > 0);
  assert.ok(
    feet.length < bridgeSupports(15).length,
    'Dry endpoint original posts are already embedded',
  );
  supports.forEach((n, i) => {
    const s = worldSurface(n),
      p = point(bridge, feet[i]);
    assert.ok(Math.abs(s.bounds.max[1] - (BRIDGE_ROOT_HEIGHT - 0.155)) < 1e-10);
    const ray = {
      o: { x: p.x - 1, y: (s.bounds.min[1] + s.bounds.max[1]) / 2, z: p.z },
      d: { x: 1, y: 0, z: 0 },
    };
    assert.ok(s.distance(ray) > 0);
    assert.equal(
      new ModelPicking(n).distance(ray),
      null,
      'Hidden riverbed footing cannot be selected through water',
    );
  });
  const keys = [...f.assets.meshes.keys()].sort();
  for (let i = 0; i < 20; i++)
    f.building({ ...bridge, id: 'move' + i, x: bridge.x + (i % 2) }, 100000, state.mapSeed, 5, []);
  assert.deepEqual([...f.assets.meshes.keys()].sort(), keys);
  assert.deepEqual(keys, ['v5-pier-foot-unit', 'wooden-bridge-15']);
  f.dispose();
});
test('every bridge length has bounded canonical IDs; malformed sizes cannot create unlimited cache keys', () => {
  const ids = Object.keys(ASSETS).filter((id) => id.startsWith('wooden-bridge-'));
  assert.equal(ids.length, 10);
  for (let length = 7; length <= 16; length++)
    assert.equal(
      buildingAssetId({ ...bridge, bridge: { ...bridge.bridge, length } }, 0),
      `wooden-bridge-${length}`,
    );
  for (const length of [0, 6, 17, 8.5, NaN, Infinity])
    assert.throws(() => buildingAssetId({ ...bridge, bridge: { ...bridge.bridge, length } }, 0));
  assert.throws(() => buildingAssetId({ ...bridge, bridge: undefined }, 0));
});
test('lower posts use all covering real lattice corners for every rotation, with exact embed and cliff fallback', () => {
  const h = getV5Hydrology(state.mapSeed),
    step = V5_COAST_STEP;
  assert.equal(step, 0.25);
  const minima = new Set();
  for (const rotation of [0, 1, 2, 3])
    for (const foot of bridgeFootings({ ...bridge, rotation }, state.mapSeed)) {
      const b = { ...bridge, rotation },
        p = point(b, foot),
        half = foot.width / 2,
        bottom = foot.y - foot.height / 2 + BRIDGE_ROOT_HEIGHT;
      minima.add(bottom.toFixed(4));
      for (
        let x = Math.floor((p.x - half) / step) * step;
        x <= Math.ceil((p.x + half) / step) * step;
        x += step
      )
        for (
          let z = Math.floor((p.z - half) / step) * step;
          z <= Math.ceil((p.z + half) / step) * step;
          z += step
        )
          assert.ok(
            bottom <= h.sample(x, z).height - 0.01 + 1e-12,
            'All triangles convexly bounded over full cross-section',
          );
      assert.ok(foot.height > 0);
    }
  assert.ok(
    minima.size > 1,
    'Foot lengths actually follow sampled river/bank, not one fixed seabed height',
  );
  const bounds = h.featureBounds;
  assert.equal(
    bridgeBedLower(state.mapSeed, (bounds.x0 + bounds.x1) / 2, (bounds.z0 + bounds.z1) / 2, 0.115),
    -1.7,
  );
});
