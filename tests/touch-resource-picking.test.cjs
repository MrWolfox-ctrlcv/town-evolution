/** Analytic camera + canonical CPU meshes; no GPU or physical-device claims. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  fixture,
  touch,
  Node,
  Factory,
  ModelPicking,
} = require('./helpers/resource-picking-ui.cjs');
const { camera } = require('./helpers/touch-camera.cjs');
for (const item of ['lettuce', 'treeSeed'])
  for (const dpr of [1, 2, 3])
    test(`nearby ${item} is reachable only with touch tolerance at DPR ${dpr}`, () => {
      const f = fixture({
          mapSeed: 1,
          trees: [],
          naturalResources: [],
          groundStacks: [{ item, amount: 1, x: 0, z: 0 }],
        }),
        c = camera(18, dpr),
        center = c.project({ x: 0.5, y: 0.1, z: 0.5 }),
        point = { x: center.x + 5 * dpr, y: center.y };
      assert.equal(f.town.pickStack(c.ray(point)), null, 'mouse keeps the exact mesh miss');
      assert.equal(f.town.pickStack(c.contact(point))?.id, 'pile:0:0');
    });

function pileFixture(item = 'lettuce') {
  return fixture({
    mapSeed: 1,
    trees: [],
    naturalResources: [],
    groundStacks: [{ item, amount: 1, x: 0, z: 0 }],
  });
}
function screenMesh(c, points, distance = 50) {
  const node = new Node('triangle'),
    positions = points.flatMap((p) => {
      const r = c.ray(p);
      return ['x', 'y', 'z'].map((axis) => r.o[axis] + r.d[axis] * distance);
    }),
    indices = [0, 1, 2];
  node.renderers.push({
    node,
    enabled: true,
    mesh: {
      struct: { primitives: [{ primitiveMode: 4 }] },
      readAttribute: () => positions,
      readIndices: () => indices,
      data: { positions, indices },
    },
  });
  return node;
}
function triangle(c, x, y, distance = 50, half = 0.8) {
  return screenMesh(
    c,
    [
      { x: x - half, y: y - half },
      { x: x + half, y: y - half },
      { x, y: y + half },
    ],
    distance,
  );
}
function addBuilding(f, id, node) {
  f.town.buildings.set(id, { kind: 'crate', node, surface: new ModelPicking(node) });
}
test('an exact foreground building wins over nearby usable piles and never runs neighbor rays', () => {
  const f = pileFixture(),
    c = camera(),
    center = c.project({ x: 0.5, y: 0.1, z: 0.5 }),
    point = { x: center.x + 5, y: center.y };
  addBuilding(f, 'front', triangle(c, point.x, point.y, 40, 1));
  let samples = 0;
  const ray = touch.markTouchRay(c.ray(point), {
    point,
    radius: 6,
    project: c.project,
    contains: c.contains,
    ray: (p) => {
      samples++;
      return c.ray(p);
    },
  });
  assert.equal(f.town.pickBuilding(ray), 'front');
  assert.equal(f.town.pickStack(ray), null);
  assert.equal(samples, 0);
});

test('nearby samples still choose the foreground triangles instead of a hidden pile', () => {
  const f = pileFixture(),
    c = camera(),
    center = c.project({ x: 0.5, y: 0.1, z: 0.5 }),
    point = { x: center.x + 6, y: center.y };
  const cover = new Factory().asset('crate');
  cover.setScale(0.45, 0.45, 0.45);
  cover.setPosition(0.5 - c.direction.x * 2, 0.024 - c.direction.y * 2, 0.5 - c.direction.z * 2);
  addBuilding(f, 'cover', cover);
  assert.equal(f.town.pickBuilding(c.ray(point)), null);
  assert.equal(f.town.pickStack(c.ray(point)), null);
  const ray = c.contact(point);
  assert.equal(f.town.pickBuilding(ray), 'cover');
  assert.equal(f.town.pickStack(ray), null);
  f.town.setLifted('cover');
  assert.equal(
    f.town.pickStack(ray)?.id,
    'pile:0:0',
    'lifting invalidates the shared query result',
  );
});

test('natural triangles remain blockers inside the tolerance area', () => {
  const f = pileFixture(),
    c = camera(),
    center = c.project({ x: 0.5, y: 0.1, z: 0.5 }),
    point = { x: center.x + 6, y: center.y },
    cover = triangle(c, center.x, center.y, 40, 4),
    positions = cover.renderers[0].mesh.data.positions,
    axis = (index) => positions.filter((_, i) => i % 3 === index);
  f.resources.sync(
    {
      mapSeed: 1,
      trees: [],
      naturalResources: [{ id: 'stone', amount: 1 }],
      groundStacks: [{ item: 'lettuce', amount: 1, x: 0, z: 0 }],
    },
    {
      positions,
      resources: [
        {
          id: 'stone',
          indices: [0, 1, 2],
          min: [0, 1, 2].map((i) => Math.min(...axis(i))),
          max: [0, 1, 2].map((i) => Math.max(...axis(i))),
          center: [0, 0, 0],
        },
      ],
    },
  );
  const ray = c.contact(point);
  assert.equal(f.town.pickNatural(ray), 'stone');
  assert.equal(f.town.pickStack(ray), null);
});

test('HUD and viewport boundaries cannot be crossed by neighboring touch samples', () => {
  const f = pileFixture(),
    c = camera(),
    center = c.project({ x: 0.5, y: 0.1, z: 0.5 }),
    point = { x: center.x + 5, y: center.y };
  assert.equal(f.town.pickStack(c.contact(point))?.id, 'pile:0:0');
  assert.equal(f.town.pickStack(c.contact(point, (p) => p.x >= point.x - 0.5)), null);
  assert.equal(f.town.pickStack(c.contact(point, () => false)), null);
  assert.equal(f.town.pickStack(c.contact({ x: center.x + 12, y: center.y })), null);
});

test('screen distance wins before world depth; equal screen/depth ties are stable', () => {
  const point = { x: 195, y: 400 },
    c = camera();
  for (const reversed of [false, true]) {
    const f = fixture({ mapSeed: 1, trees: [], naturalResources: [], groundStacks: [] });
    const entries = [
      ['a', triangle(c, point.x + 4, point.y)],
      ['b', triangle(c, point.x - 4, point.y)],
    ];
    for (const [id, node] of reversed ? entries.reverse() : entries) addBuilding(f, id, node);
    assert.equal(f.town.pickBuilding(c.contact(point)), 'a');
    const centered = fixture({ mapSeed: 1, trees: [], naturalResources: [], groundStacks: [] });
    for (const id of reversed ? ['b', 'a'] : ['a', 'b'])
      addBuilding(centered, id, triangle(c, point.x, point.y));
    assert.equal(
      centered.town.pickBuilding(c.contact(point)),
      'a',
      'exact-center depth ties are stable too',
    );
  }
  const f = fixture({ mapSeed: 1, trees: [], naturalResources: [], groundStacks: [] });
  addBuilding(f, 'farther-screen', triangle(c, point.x + 4, point.y, 40));
  addBuilding(f, 'nearer-screen', triangle(c, point.x - 2, point.y, 60));
  assert.equal(f.town.pickBuilding(c.contact(point)), 'nearer-screen');
});

test('projected bounding-box air stays empty and samples remain capped at 28', () => {
  const f = fixture({ mapSeed: 1, trees: [], naturalResources: [], groundStacks: [] }),
    c = camera(),
    point = { x: 204, y: 409 };
  addBuilding(
    f,
    'triangle',
    screenMesh(c, [
      { x: 185, y: 390 },
      { x: 205, y: 390 },
      { x: 185, y: 410 },
    ]),
  );
  let samples = 0;
  const context = {
    point,
    radius: 6,
    project: c.project,
    contains: c.contains,
    ray: (p) => {
      samples++;
      return c.ray(p);
    },
  };
  assert.equal(f.town.buildings.get('triangle').surface.nearScreen(context), true);
  assert.equal(f.town.pickBuilding(touch.markTouchRay(c.ray(point), context)), null);
  assert.equal(samples, 28);
});

for (const direction of [
  [15, -20, -18],
  [-15, -20, 18],
  [0, -20, -18],
])
  test(`nearby real surfaces work from camera direction ${direction}`, () => {
    const f = pileFixture('treeSeed'),
      c = camera(18, 2, direction),
      center = c.project({ x: 0.5, y: 0.1, z: 0.5 }),
      point = { x: center.x + 10, y: center.y };
    assert.equal(f.town.pickStack(c.ray(point)), null);
    assert.equal(f.town.pickStack(c.contact(point))?.id, 'pile:0:0');
  });

test('large-world touch query limits mesh work to nearby candidates and shares one result', (t) => {
  const { performance } = require('node:perf_hooks'),
    game = require('../.domain-build/domain/game'),
    { ContinuousResources } = require('../.domain-build/art/ContinuousResources'),
    { terrainAt } = require('../.domain-build/domain/terrain'),
    { NaturalPicking } = require('../.domain-build/application/NaturalPicking');
  const state = game.createGame(100, 1, 4);
  state.groundStacks = [{ item: 'lettuce', amount: 1, x: 0, z: 0 }];
  const surface = new ContinuousResources(192, state.mapSeed, (x, z) =>
      terrainAt(x, z, state.mapSeed, state.terrainVersion),
    ).sync(state.naturalResources).naturalSurface,
    f = fixture(state, surface),
    c = camera(),
    center = c.project({ x: 0.5, y: 0.1, z: 0.5 }),
    point = { x: center.x + 5, y: center.y };
  let modelQueries = 0,
    nearModels = 0,
    naturalScans = 0,
    wholeNaturalScans = 0,
    largestSubset = 0;
  const modelDistance = ModelPicking.prototype.distance,
    nearScreen = ModelPicking.prototype.nearScreen,
    naturalPick = NaturalPicking.prototype.pick;
  ModelPicking.prototype.distance = function (...args) {
    modelQueries++;
    return modelDistance.apply(this, args);
  };
  ModelPicking.prototype.nearScreen = function (...args) {
    const near = nearScreen.apply(this, args);
    if (near) nearModels++;
    return near;
  };
  NaturalPicking.prototype.pick = function (...args) {
    const count = this.surface.resources.length;
    naturalScans += count;
    if (count === surface.resources.length) wholeNaturalScans++;
    else largestSubset = Math.max(largestSubset, count);
    return naturalPick.apply(this, args);
  };
  try {
    const ray = c.contact(point);
    assert.equal(f.town.pickStack(ray)?.id, 'pile:0:0');
    const queries = [modelQueries, naturalScans];
    assert.equal(f.town.pickTree(ray), null);
    assert.equal(f.town.pickNatural(ray), null);
    assert.equal(f.town.pickBuilding(ray), null);
    assert.deepEqual([modelQueries, naturalScans], queries);
    assert.equal(wholeNaturalScans, 1);
    assert.ok(nearModels <= 3, `candidate models=${nearModels}`);
    assert.ok(largestSubset <= 4, `candidate resource surfaces=${largestSubset}`);
    assert.ok(modelQueries <= state.trees.length + 1 + 28 * nearModels);
    assert.ok(naturalScans <= surface.resources.length + 28 * largestSubset);
    const reads = f.resources.factory.reads;
    const started = performance.now();
    for (let i = 0; i < 50; i++) assert.equal(f.town.pickStack(c.contact(point))?.id, 'pile:0:0');
    assert.equal(f.resources.factory.reads, reads, 'pointer moves reuse CPU mesh data');
    t.diagnostic(
      JSON.stringify({
        trees: state.trees.length,
        naturalSurfaces: surface.resources.length,
        firstModelQueries: queries[0],
        firstNaturalSurfaceVisits: queries[1],
        nearbyModels: nearModels / 51,
        maxNearbyNaturalSurfaces: largestSubset,
        meanCpuMs: (performance.now() - started) / 50,
      }),
    );
  } finally {
    ModelPicking.prototype.distance = modelDistance;
    ModelPicking.prototype.nearScreen = nearScreen;
    NaturalPicking.prototype.pick = naturalPick;
  }
});
