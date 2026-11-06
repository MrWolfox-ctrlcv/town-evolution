const test = require('node:test'),
  assert = require('node:assert/strict');
const { islandTerrain } = require('../.domain-build/art/IslandTerrain');
const {
  naturalBlock,
  appendBlockFace,
  emptyNaturalMesh,
} = require('../.domain-build/art/NaturalBlockKit');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');
const { ASSET_CATEGORIES } = require('../.domain-build/art/AssetCategories');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');
const g = require('../.domain-build/domain/game');
const build = (s) =>
  islandTerrain(
    g.worldSize(s.terrainVersion),
    s.mapSeed,
    (x, z) => g.isLandCell(x, z, s.mapSeed, s.terrainVersion),
    {
      surface: (x, z) => g.terrainAt(x, z, s.mapSeed, s.terrainVersion),
      resources: s.naturalResources,
    },
  );
function triangles(mesh) {
  return Array.from({ length: mesh.indices.length / 3 }, (_, i) =>
    mesh.indices.slice(i * 3, i * 3 + 3).map((n) => mesh.positions.slice(n * 3, n * 3 + 3)),
  );
}
test('curved coast retains legal land cell centers and never fills neighboring water centers', () => {
  const inside = (x, z, [a, b, c]) => {
    const cross = (p, q) => (q[0] - p[0]) * (z - p[2]) - (q[2] - p[2]) * (x - p[0]);
    const values = [cross(a, b), cross(b, c), cross(c, a)];
    return values.every((v) => v >= -1e-8) || values.every((v) => v <= 1e-8);
  };
  for (const seed of [1, 17, 73129, 42173, 999999999]) {
    const state = g.createGame(0, seed, 3),
      mesh = build(state);
    assert.deepEqual(mesh, build(state));
    const base = triangles(mesh).filter((points) =>
      points.every((p) => Math.abs(p[1] - 0.015) < 1e-9),
    );
    for (let x = 0; x < 40; x++)
      for (let z = 0; z < 40; z++) {
        const covered = base.some((tri) => inside(x + 0.5, z + 0.5, tri));
        assert.equal(covered, g.isLandCell(x, z, seed, 3), `${seed} cell ${x},${z}`);
      }
    assert.equal(mesh.triangleOwners.length, mesh.indices.length / 3);
    assert.ok(mesh.naturalSurface.resources.length === state.naturalResources.length);
  }
});
test('visible natural terrain faces remain finite and nondegenerate within a fixed mesh budget', () => {
  for (const seed of [42173, ...Array.from({ length: 30 }, (_, i) => i * 193 + 1)]) {
    const mesh = build(g.createGame(0, seed, 3)),
      count = mesh.positions.length / 3;
    assert.ok(count < 60000, `vertex budget ${seed}: ${count}`);
    assert.ok(mesh.indices.length / 3 < 65000, `triangle budget ${seed}`);
    assert.equal(mesh.normals.length, count * 3);
    assert.equal(mesh.colors.length, count * 4);
    assert.ok([...mesh.positions, ...mesh.normals, ...mesh.colors].every(Number.isFinite));
    assert.ok(mesh.colors.every((n) => n >= 0 && n <= 1));
    assert.ok(mesh.indices.every((n) => Number.isInteger(n) && n >= 0 && n < count));
    for (let i = 0; i < mesh.normals.length; i += 3)
      assert.ok(Math.abs(Math.hypot(...mesh.normals.slice(i, i + 3)) - 1) < 1e-6);
    for (const [a, b, c] of triangles(mesh)) {
      const u = b.map((n, j) => n - a[j]),
        v = c.map((n, j) => n - a[j]);
      assert.ok(
        Math.hypot(
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ) > 1e-8,
      );
    }
  }
});
test('continuous relief follows remaining units without restoring depleted seed resources', () => {
  const surface = () => ({ biome: 'mountain', elevation: 4 }),
    land = (x, z) => x === 2 && z === 2;
  const make = (amount) =>
    islandTerrain(5, 17, land, {
      surface,
      resources: amount ? [{ kind: 'stone', x: 2, z: 2, amount }] : [],
    });
  const full = make(4),
    mined = make(3),
    empty = make(0);
  assert.ok(full.max[1] > mined.max[1] && mined.max[1] > 0.015);
  assert.ok(
    full.naturalSurface.resources[0].center[1] > mined.naturalSurface.resources[0].center[1],
  );
  assert.equal(empty.naturalSurface.resources.length, 0);
  assert.ok(Math.abs(empty.max[1] - 0.015) < 1e-8, 'depleted columns must not regrow from biome');
});
test('unit block surface variants retain stable cube corners and seeded dents and outsets', () => {
  const a = naturalBlock('stone', 17),
    b = naturalBlock('stone', 91);
  assert.deepEqual(compileAsset(a), compileAsset(naturalBlock('stone', 17)));
  assert.notDeepEqual(compileAsset(a).positions, compileAsset(b).positions);
  const mesh = compileAsset(a);
  assert.deepEqual(a.footprint, [1, 1]);
  assert.ok(mesh.indices.length / 3 <= 162);
  assert.ok(mesh.min[0] >= -0.58 && mesh.max[0] <= 0.58);
  assert.ok(mesh.min[1] >= 0 && mesh.max[1] <= 1.08);
});
test('the exported model catalog has exactly the four requested classifications', () => {
  assert.deepEqual(
    ASSET_CATEGORIES.map((c) => c.label),
    ['自然植物', '自然无机物', '建筑', '作物'],
  );
  const categories = new Set(ASSET_CATEGORIES.map((c) => c.id));
  for (const asset of Object.values(ASSETS)) assert.ok(categories.has(asset.category), asset.id);
  assert.equal(ASSETS.tree.category, 'natural-plants');
  assert.equal(ASSETS['tree-pine'].category, 'natural-plants');
  assert.equal(ASSETS['natural-block-soil'].category, 'natural-inorganic');
  assert.equal(ASSETS['pile-soil-5'].category, 'natural-inorganic');
  assert.equal(ASSETS['warehouse-base'].category, 'buildings');
  assert.equal(ASSETS['crop-cell-wheat-ready'].category, 'crops');
});

test('each exposed face has sixteen small relief patches and normals follow its real geometry', () => {
  const mesh = emptyNaturalMesh();
  appendBlockFace(mesh, [2, 1.015, 3], 'top', 'stone', 17, true);
  assert.equal(mesh.positions.length / 3, 25, 'shared grid vertices keep phone memory bounded');
  assert.equal(mesh.indices.length / 3, 32);
  const heights = new Set(),
    normals = new Set();
  for (let i = 0; i < mesh.positions.length; i += 3) {
    heights.add(mesh.positions[i + 1].toFixed(6));
    normals.add(
      mesh.normals
        .slice(i, i + 3)
        .map((n) => n.toFixed(5))
        .join(','),
    );
  }
  assert.ok(heights.size >= 10, 'not a single flat inset or color-only detail');
  assert.ok(normals.size >= 10, 'geometry-derived lighting, not one normal for a bent quad');
  assert.ok([...heights].some((y) => Number(y) < 2.015));
  assert.ok([...heights].some((y) => Number(y) > 2.015));
});
test('shared worn cube edges match across top, side and vertically adjoining layers', () => {
  const face = (origin, direction) => {
    const m = emptyNaturalMesh();
    appendBlockFace(m, origin, direction, 'stone', 73129, true);
    return Array.from({ length: 25 }, (_, i) => m.positions.slice(i * 3, i * 3 + 3));
  };
  const top = face([2, 1.015, 3], 'top');
  const east = face([2, 1.015, 3], 'east');
  const adjacent = face([3, 1.015, 3], 'top');
  const upper = face([2, 2.015, 3], 'east');
  const same = (a, b) => a.every((n, i) => Math.abs(n - b[i]) < 1e-9);
  for (const point of top.slice(20)) {
    assert.ok(
      east.some((p) => same(p, point)),
      'exposed top/side edge must close',
    );
    assert.ok(
      adjacent.some((p) => same(p, point)),
      'adjacent columns must share the worn boundary',
    );
  }
  for (const point of east.slice(20))
    assert.ok(
      upper.some((p) => same(p, point)),
      'resource levels must use the same world-coordinate wear',
    );
});

test('fine surface grain cannot buckle a unit cube or produce high-contrast vertex speckles', () => {
  for (const seed of Array.from({ length: 100 }, (_, i) => i * 193 + 1))
    for (const material of ['stone', 'soil']) {
      const mesh = emptyNaturalMesh();
      appendBlockFace(mesh, [2, 1.015, 3], 'top', material, seed, true);
      for (let row = 0; row < 5; row++)
        for (let column = 0; column < 5; column++) {
          const i = row * 5 + column,
            p = mesh.positions.slice(i * 3, i * 3 + 3);
          assert.equal(p[0], 2 + row / 4, 'no sideways vertex jitter');
          assert.equal(p[2], 3 + column / 4, 'no sideways vertex jitter');
          assert.ok(Math.abs(p[1] - 2.015) <= 0.018, 'surface wear stays below 2% of a unit');
          if (row === 0 || column === 0 || row === 4 || column === 4)
            assert.equal(p[1], 1.015 + 1, 'unit boundaries are rigid and exact');
          assert.ok(mesh.normals[i * 3 + 1] > 0.995, 'fine grain is not crumpled foil');
          for (const adjacent of [column < 4 ? i + 1 : -1, row < 4 ? i + 5 : -1]) {
            if (adjacent < 0) continue;
            for (let color = 0; color < 3; color++)
              assert.ok(
                Math.abs(mesh.colors[i * 4 + color] - mesh.colors[adjacent * 4 + color]) < 0.03,
                'neighboring samples cannot switch grass/soil palettes or flash bright/dark',
              );
          }
        }
    }
});
test('terrain surface detail is static spatial data, never frame-time noise', () => {
  const source = require('node:fs').readFileSync('assets/scripts/art/NaturalBlockKit.ts', 'utf8');
  assert.doesNotMatch(source, /Date\.now|Math\.random|performance\.now/);
  const first = compileAsset(naturalBlock('stone', 42173));
  for (let i = 0; i < 5; i++) assert.deepEqual(compileAsset(naturalBlock('stone', 42173)), first);
});
