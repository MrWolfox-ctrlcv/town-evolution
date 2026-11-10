/** Exact mesh semantics and deterministic UV work counts, not a frame-time benchmark. */
const test = require('node:test');
const assert = require('node:assert/strict');
const current = require('../.domain-build/art/MeshCompiler');
const baseline = require('./helpers/mesh-compiler-baseline.cjs');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');
const { PLANT_SHAPES } = require('../.domain-build/art/PlantShapes');
const box = {
  name: 'probe',
  shape: 'box',
  size: [1, 1, 1],
  position: [0, 0, 0],
  color: '#B77E43',
  texture: 'warm-wood',
};
const recipe = (part, id = 'probe') => ({ id, footprint: [1, 1], parts: [part] });

function same(input) {
  const before = structuredClone(input);
  const actual = current.compileAsset(input);
  assert.deepStrictEqual(actual, baseline.compileAsset(input), input.id);
  assert.deepStrictEqual(current.assetBounds(input), baseline.assetBounds(input), input.id);
  assert.deepStrictEqual(current.assetBounds(input, true), baseline.assetBounds(input, true));
  assert.deepStrictEqual(input, before, 'compilation does not mutate recipes');
  return actual;
}

function work(compile, input) {
  const originalSort = Array.prototype.sort;
  const originalAbs = Math.abs;
  const counts = { axisSorts: 0, patches: 0 };
  Array.prototype.sort = function (...args) {
    counts.axisSorts++;
    return originalSort.apply(this, args);
  };
  Math.abs = function (...args) {
    counts.patches++;
    return originalAbs(...args);
  };
  try {
    compile(input);
  } finally {
    Array.prototype.sort = originalSort;
    Math.abs = originalAbs;
  }
  return counts;
}

test('UV preparation runs once per flat face, not once per emitted vertex', () => {
  const input = recipe(box);
  assert.deepStrictEqual(work(baseline.compileAsset, input), { axisSorts: 24, patches: 24 });
  assert.deepStrictEqual(work(current.compileAsset, input), { axisSorts: 6, patches: 6 });
});

test('all 224 catalog meshes and 128 renderer material batches stay exactly equal', () => {
  let meshes = 0,
    batches = 0;
  for (const input of Object.values(ASSETS)) {
    same(input);
    meshes++;
    // AssetRenderer.createRecipe uses this exact texture partition.
    if (input.parts.some((p) => p.texture === 'warm-wood')) {
      for (const textured of [false, true]) {
        const mesh = same({
          ...input,
          parts: input.parts.filter((p) => Boolean(p.texture) === textured),
        });
        if (textured) assert.deepStrictEqual(mesh.texturedIndices, mesh.indices);
        else assert.equal(mesh.texturedIndices.length, 0);
        batches++;
      }
    }
  }
  assert.equal(meshes, 224);
  assert.equal(batches, 128);
});

test('every catalog shape retains signed scaling, tied axes and three-axis rotation', () => {
  const samples = new Map();
  for (const input of Object.values(ASSETS))
    for (const p of input.parts) if (!samples.has(p.shape)) samples.set(p.shape, p);
  let cases = 0;
  for (const sample of samples.values())
    for (const size of [
      [1, 1, 1],
      [0.02, 1.5, 3],
      [4, 0.005, 2],
      [-1, 2, 3],
      [2, -3, 4],
      [2, 4, -3],
      [-2, -3, -4],
    ])
      for (const rotation of [undefined, [0, 0, 0], [90, 180, 270], [17.25, -43.5, 359.99]]) {
        same(recipe({ ...sample, size, rotation, position: [-13.5, 2.25, 9.125] }));
        cases++;
      }
  assert.equal(cases, 420);
});

function synthetic(vertices, callback) {
  // Test-only local geometry exercises otherwise unreachable span boundaries.
  // Production geometry and materials are never changed.
  const key = 'face-uv-test-only';
  assert.equal(PLANT_SHAPES[key], undefined);
  PLANT_SHAPES[key] = { vertices, faces: [[0, 1, 2]], smooth: false };
  try {
    callback({ ...box, shape: key });
  } finally {
    delete PLANT_SHAPES[key];
  }
}

function neighbor(value, offset) {
  const data = new DataView(new ArrayBuffer(8));
  data.setFloat64(0, value);
  data.setBigUint64(0, data.getBigUint64(0) + BigInt(offset));
  return data.getFloat64(0);
}

test('local span threshold uses strict > 0.001, stable ties and original axis fallbacks', () => {
  for (const span of [neighbor(0.001, -1), 0.001, neighbor(0.001, 1)])
    for (const axis of [0, 1, 2]) {
      const vertices = [
        [0, 0, 0],
        [span, 1, 0],
        [0, 0, 1],
      ].map((v) => v.map((_, a) => v[(a + 3 - axis) % 3]));
      const size = [4, 3, 2].map((_, a) => [4, 3, 2][(a + 3 - axis) % 3]);
      synthetic(vertices, (part) => {
        const mesh = same(recipe({ ...part, size }));
        const u = span > 0.001 ? axis : (axis + 1) % 3;
        const v = span > 0.001 ? (axis + 1) % 3 : (axis + 2) % 3;
        assert.deepStrictEqual(
          mesh.uvs,
          vertices.flatMap((local) => [
            (local[u] + 0.5) * 0.8,
            (local[v] + 0.5) * Math.min(0.8, size[v] / size[u]),
          ]),
        );
      });
    }
  synthetic(
    [
      [0, 0, 0],
      [1, 1, 0],
      [0, 0, 1],
    ],
    (part) => {
      const mesh = same(recipe(part));
      assert.deepStrictEqual(
        mesh.uvs,
        [0.4, 0.4, 1.2000000000000002, 1.2000000000000002, 0.4, 0.4],
      );
    },
  );
  for (const vertices of [
    [
      [0, 0, 0],
      [0.0005, 0, 0],
      [0, 0.0005, 0],
    ],
    [
      [0, 0, 0],
      [1, 0, 0],
      [0, 0.0005, 0],
    ],
  ])
    synthetic(vertices, (part) => same(recipe({ ...part, size: [100, 100, 100] })));
});

test('texture projection uses local coordinates and preserves patch and signed ratios', () => {
  const input = recipe({ ...box, position: [-13.5, 2.25, 9.125], size: [-2, -3, -4] });
  const mesh = same(input);
  const rotated = same({ ...input, parts: [{ ...input.parts[0], rotation: [17, -43, 359] }] });
  assert.deepStrictEqual(mesh.uvs, rotated.uvs, 'rotation changes positions, not local UVs');
  assert.deepStrictEqual(mesh.texturedIndices, mesh.indices);
  assert.ok(mesh.uvs.some((n) => n !== 0));
  const palette = same(recipe({ ...input.parts[0], texture: undefined }));
  assert.deepStrictEqual(palette.uvs, mesh.uvs, 'palette still emits the same UV projection');
  assert.deepStrictEqual(palette.texturedIndices, []);
});

test('degenerate rejection and exact 1e-10 face-length boundary stay unchanged', () => {
  for (const size of [
    [0, 0, 0],
    [0, 1, 1],
    [1, 0, 1],
    [1, 1, 0],
    [1, neighbor(1e-10, -1), 1],
  ]) {
    const input = recipe({ ...box, size }, 'degenerate');
    for (const api of [baseline, current]) {
      assert.throws(() => api.compileAsset(input), { message: 'Degenerate degenerate/probe' });
      assert.throws(() => api.assetBounds(input), { message: 'Degenerate degenerate/probe' });
    }
    assert.deepStrictEqual(work(current.compileAsset, { ...input, parts: [] }), {
      axisSorts: 0,
      patches: 0,
    });
  }
  for (const y of [1e-10, neighbor(1e-10, 1)]) same(recipe({ ...box, size: [1, y, 1] }));
  for (const n of [-0, NaN, Infinity, -Infinity]) {
    // The existing non-finite input behavior is preserved, not silently normalized.
    const input = recipe({ ...box, position: [n, 0, 0] });
    same(input);
  }
});

test('smooth faces skip UV preparation and preserve their existing texture semantics', () => {
  const shape = Object.keys(PLANT_SHAPES).find((name) => PLANT_SHAPES[name].smooth);
  assert.ok(shape);
  const input = recipe({ ...box, shape });
  const mesh = same(input);
  assert.deepStrictEqual(work(current.compileAsset, input), { axisSorts: 0, patches: 0 });
  assert.ok(mesh.uvs.every((n) => n === 0));
  assert.deepStrictEqual(mesh.texturedIndices, []);
});

test('procedural outputs own fresh arrays and observe recipe changes between calls', () => {
  const input = recipe(structuredClone(box));
  const first = same(input);
  const second = same(input);
  for (const key of Object.keys(first)) assert.notEqual(first[key], second[key], key);
  first.uvs[0] = 99;
  first.positions[0] = 99;
  same(input);
  input.parts[0].size = [3, -2, 4];
  input.parts[0].position = [9, -8, 7];
  input.parts[0].rotation = [11, 22, 33];
  input.parts[0].texture = undefined;
  same(input);
  same({ id: 'empty', footprint: [1, 1], parts: [] });
});

test('stored mesh fast path preserves required clones and existing optional-array identity', () => {
  const stored = baseline.compileAsset(recipe(box));
  const input = { id: 'stored', footprint: [1, 1], parts: [], mesh: stored };
  const first = same(input);
  const second = same(input);
  for (const key of ['positions', 'normals', 'colors', 'indices', 'min', 'max']) {
    assert.notEqual(first[key], stored[key]);
    assert.notEqual(first[key], second[key]);
  }
  for (const key of ['uvs', 'texturedIndices']) {
    assert.equal(first[key], stored[key]);
    assert.equal(second[key], stored[key]);
  }
  assert.deepStrictEqual(work(current.compileAsset, input), { axisSorts: 0, patches: 0 });
});
