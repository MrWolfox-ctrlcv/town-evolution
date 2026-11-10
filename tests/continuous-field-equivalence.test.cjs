/** Strict scalar/mesh equivalence and deterministic work counts, not browser/GPU timing. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { ContinuousField } = require('../.domain-build/art/ContinuousField');
const { ContinuousField: BaselineField } = require('./helpers/continuous-field-baseline.cjs');
const { ContinuousResources } = require('../.domain-build/art/ContinuousResources');
const noise = require('../.domain-build/art/ContinuousNoise');
const g = require('../.domain-build/domain/game');
const { titleIsland } = require('../.domain-build/application/TitleIsland');
const { NaturalPicking } = require('../.domain-build/application/NaturalPicking');
const historical = require('./fixtures/terrain-v2-depleted.json');
const reference = (x, z) =>
  x === 0 || z === 3
    ? null
    : { biome: (x + z) % 2 ? 'hill' : 'mountain', elevation: ((x + z) % 5) + 1 };
const coords = [
  -1,
  -0,
  0,
  0.004,
  0.25,
  0.496,
  0.5,
  0.504,
  0.75,
  1,
  1.25,
  3.5,
  7.996,
  8,
  Infinity,
  -Infinity,
  NaN,
];

function pair(size, seed, ref) {
  const actual = new ContinuousResources(size, seed, ref);
  const expected = new ContinuousResources(size, seed, ref);
  // Swap only this test instance's field for the frozen scalar reference.
  // ResourcePatch and ContinuousResources remain the real production implementations.
  expected.field = new BaselineField(size, seed, ref);
  return [actual, expected];
}
function sameMesh(views, resources, label) {
  const actual = views[0].sync(resources),
    expected = views[1].sync(resources);
  assert.deepStrictEqual(actual, expected, label);
  assert.equal(actual.naturalSurface.positions, actual.mesh.positions);
  return actual;
}

test('numeric lookup preserves 289 exact boundary heights/normals and 12544 color samples', () => {
  const actual = new ContinuousField(8, 73419, reference);
  const expected = new BaselineField(8, 73419, reference);
  for (const x of coords)
    for (const z of coords) {
      assert.deepStrictEqual(actual.naturalHeight(x, z), expected.naturalHeight(x, z));
      assert.deepStrictEqual(actual.normal(x, z), expected.normal(x, z));
    }
  for (const kind of ['soil', 'stone'])
    for (const x of coords.slice(0, 14))
      for (const z of coords.slice(0, 14))
        for (const h of [-2, 0, 0.015, 0.259999, 0.26, 1.5, 4, 20])
          for (const normal of [
            [0, 1, 0],
            [1, 0, 0],
            [0, -1, 0],
            [0.2, 0.7, -0.3],
          ]) {
            const resource = { id: 'test', x: 0, z: 0, kind, amount: 2 };
            assert.deepStrictEqual(
              actual.color(resource, x, z, h, normal),
              expected.color(resource, x, z, h, normal),
            );
          }
});

test('grass threshold adjacent floating-point values preserve exact color arithmetic', () => {
  const actual = new ContinuousField(8, 73419, reference);
  const expected = new BaselineField(8, 73419, reference);
  for (const kind of ['soil', 'stone'])
    for (const h of [0.26 - Number.EPSILON / 4, 0.26, 0.26 + Number.EPSILON / 4]) {
      const resource = { id: 'threshold', x: 1, z: 2, kind, amount: 2 };
      assert.deepStrictEqual(
        actual.color(resource, 1.25, 2.75, h, [0.2, 0.7, -0.3]),
        expected.color(resource, 1.25, 2.75, h, [0.2, 0.7, -0.3]),
      );
    }
});

test('title, v1-v4 and historical depleted saves retain every mesh value and ownership field', () => {
  const cases = [
    ['title', titleIsland()],
    ...[1, 2, 3, 4].map((v) => [`v${v}`, g.createGame(0, v % 2 ? 17 : 1000000000, v)]),
    ['historical depleted', g.importSave(JSON.stringify(historical), 0)],
  ];
  for (const [name, state] of cases) {
    const size = g.worldSize(state.terrainVersion),
      cells = new Map();
    for (let z = 0; z < size; z++)
      for (let x = 0; x < size; x++)
        cells.set(
          `${x},${z}`,
          g.terrainAt(x, z, state.mapSeed, state.terrainVersion, state.landExtensions),
        );
    const saved = g.exportSave(state);
    const views = pair(size, state.mapSeed, (x, z) => cells.get(`${x},${z}`));
    const initial = sameMesh(views, state.naturalResources, `${name}/initial`);
    const unchanged = sameMesh(views, state.naturalResources, `${name}/unchanged`);
    assert.equal(unchanged.rebuiltCells, 0);
    assert.equal(unchanged.mesh, initial.mesh);
    assert.equal(g.exportSave(state), saved, 'geometry never mutates the save');
  }
});

test('duplicate and signed-zero coordinates preserve overwrite order, copies and cut lookup', () => {
  const actual = new ContinuousField(8, 17, reference),
    expected = new BaselineField(8, 17, reference);
  const original = [
    { id: 'first', x: 2, z: 2, kind: 'stone', amount: 3 },
    { id: 'zero', x: -0, z: 1, kind: 'soil', amount: 2 },
    { id: 'last', x: 2, z: 2, kind: 'soil', amount: 1 },
    { id: 'positive-zero', x: 0, z: 1, kind: 'stone', amount: 1 },
    { id: 'negative', x: -1, z: 2, kind: 'stone', amount: 2 },
    { id: 'ignored', x: 4, z: 4, kind: 'soil', amount: 0 },
  ];
  for (const resources of [original, [...original].reverse(), original.slice(1, 4), [], original]) {
    assert.deepStrictEqual(actual.sync(resources), expected.sync(resources));
    assert.deepStrictEqual([...actual.resources], [...expected.resources]);
    for (const r of resources) {
      assert.notEqual(actual.resources.get(`${r.x},${r.z}`), r);
      assert.deepStrictEqual(actual.cutHeight(r), expected.cutHeight(r));
      assert.deepStrictEqual(
        actual.heightInCell(r.x + 0.5, r.z + 0.5, r.x, r.z),
        expected.heightInCell(r.x + 0.5, r.z + 0.5, r.x, r.z),
      );
    }
  }
});

test('cut, depletion, restore and kind/id changes retain exact neighbors, picking and DropSupport', () => {
  const { DropSupport } = require('./helpers/selection-ui.cjs').load('DropSupport');
  const ref = () => ({ biome: 'mountain', elevation: 4 });
  const views = pair(8, 73419, ref);
  const start = [
    { id: 'center', x: 3, z: 3, kind: 'stone', amount: 4 },
    { id: 'left', x: 2, z: 3, kind: 'stone', amount: 4 },
    { id: 'right', x: 4, z: 3, kind: 'soil', amount: 4 },
    { id: 'back', x: 3, z: 2, kind: 'stone', amount: 4 },
    { id: 'front', x: 3, z: 4, kind: 'soil', amount: 4 },
  ];
  const pickers = [new NaturalPicking(), new NaturalPicking()];
  const supports = [new DropSupport(), new DropSupport()];
  const cut = start.map((r) => (r.id === 'center' ? { ...r, amount: 2 } : r));
  const depleted = start.filter((r) => r.id !== 'center');
  const restored = [...depleted, { ...start[0], kind: 'soil', id: 'restored' }];
  let originalNaturalHeight;
  for (const [label, resources] of [
    ['initial', start],
    ['cut', cut],
    ['depleted', depleted],
    ['restored', restored],
    ['unchanged', restored],
  ]) {
    const actual = sameMesh(views, resources, label);
    assert.deepStrictEqual(
      actual.mesh,
      pair(8, 73419, ref)[0].sync(resources).mesh,
      `${label}/fresh`,
    );
    const height = views[0].field.naturalHeight(3.5, 3.5);
    originalNaturalHeight ??= height;
    assert.equal(height, originalNaturalHeight, 'cuts do not replace the immutable seed surface');
    for (let i = 0; i < 2; i++) {
      const result = views[i].sync(resources);
      pickers[i].sync(result.naturalSurface, resources);
      supports[i].set('natural', result.mesh);
    }
    for (const x of [2.25, 3.25, 3.5, 3.75, 4.25])
      for (const z of [2.25, 3.25, 3.5, 3.75, 4.25]) {
        const rect = { minX: x - 0.14, maxX: x + 0.14, minZ: z - 0.14, maxZ: z + 0.14 };
        assert.deepStrictEqual(supports[0].height(rect), supports[1].height(rect));
        const ray = { o: { x, y: 30, z }, d: { x: 0, y: -1, z: 0 } };
        assert.deepStrictEqual(pickers[0].pick(ray), pickers[1].pick(ray));
      }
    const centerRay = { o: { x: 3.5, y: 30, z: 3.5 }, d: { x: 0, y: -1, z: 0 } };
    assert.equal(
      pickers[0].pick(centerRay)?.id,
      label === 'depleted'
        ? undefined
        : label === 'restored' || label === 'unchanged'
          ? 'restored'
          : 'center',
    );
    if (label === 'cut')
      assert.equal(supports[0].height({ minX: 3.4, maxX: 3.6, minZ: 3.4, maxZ: 3.6 }), 2.015);
    if (label === 'depleted')
      assert.equal(supports[0].height({ minX: 3.4, maxX: 3.6, minZ: 3.4, maxZ: 3.6 }), null);
  }
});

test('numeric sample storage avoids coordinate strings without quantizing or caching empty cells', () => {
  const ref = () => ({ biome: 'mountain', elevation: 4 });
  const field = new ContinuousField(8, 17, ref);
  assert.equal(
    [...field.initial.keys()].every((k) => typeof k === 'number'),
    true,
  );
  assert.ok([...field.initial.values()].every((row) => row instanceof Map));
  const x = 3.5,
    near = x + Number.EPSILON * 2;
  assert.notEqual(x, near);
  field.naturalHeight(x, 3.5);
  field.naturalHeight(near, 3.5);
  assert.equal(field.heights.size, 2, 'adjacent floating-point coordinates remain distinct');
  assert.equal(
    [...field.heights.keys()].every((k) => typeof k === 'number'),
    true,
  );
  assert.ok([...field.heights.values()].every((row) => row instanceof Map));
  const before = [...field.heights].map(([key, row]) => [key, [...row]]);
  for (const [sx, sz] of [
    [-0, 0.5],
    [0, 0.5],
    [-1, 3],
    [8, 3],
    [Infinity, 3],
    [-Infinity, 3],
    [NaN, 3],
  ])
    assert.equal(field.naturalHeight(sx, sz), 0.015);
  assert.deepStrictEqual(
    [...field.heights].map(([key, row]) => [key, [...row]]),
    before,
  );
  field.sync([{ id: 'cut', x: 3, z: 3, kind: 'stone', amount: 1 }]);
  field.sync([]);
  assert.deepStrictEqual(
    [...field.heights].map(([key, row]) => [key, [...row]]),
    before,
  );
  const other = new ContinuousField(8, 18, ref);
  assert.equal(other.heights.size, 0, 'no cache crosses field/save lifetimes');
  assert.notEqual(other.naturalHeight(x, 3.5), field.naturalHeight(x, 3.5));
});

test('color reuses pure noise across RGB and skips grass noise above its threshold', () => {
  const field = new ContinuousField(8, 17, reference);
  const original = { terrainNoise: noise.terrainNoise, perlin: noise.perlin };
  let calls;
  for (const key of Object.keys(original))
    noise[key] = (...args) => {
      calls[key]++;
      return original[key](...args);
    };
  try {
    for (const [kind, h, expected] of [
      ['stone', 0.26, { terrainNoise: 1, perlin: 2 }],
      ['stone', 0.259999, { terrainNoise: 2, perlin: 2 }],
      ['soil', 2, { terrainNoise: 0, perlin: 1 }],
      ['soil', 0.015, { terrainNoise: 1, perlin: 1 }],
    ]) {
      calls = { terrainNoise: 0, perlin: 0 };
      field.color({ id: 'test', x: 0, z: 0, kind, amount: 2 }, 1.25, 2.75, h, [0, 1, 0]);
      assert.deepStrictEqual(calls, expected, `${kind}/${h}`);
    }
  } finally {
    Object.assign(noise, original);
  }
});
