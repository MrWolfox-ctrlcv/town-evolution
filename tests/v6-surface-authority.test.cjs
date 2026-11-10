const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.env.V6_SURFACE_BUILD || path.join(__dirname, '..', '.domain-build');
const { buildV6SurfaceMesh } = require(path.join(root, 'art/V6SurfaceMesh'));
const { finishV6Chunk } = require(path.join(root, 'art/V6SurfaceMerge'));
const { v6Plane, v6OwnsSurfaceCell } = require(path.join(root, 'art/V6SurfaceContracts'));
const { V6SurfaceChunks } = require(path.join(root, 'art/V6SurfaceChunks'));
const { V6TerrainPicking } = require(path.join(root, 'application/V6TerrainPicking'));
const { SurfaceSupport } = require(path.join(root, 'application/SurfaceSupport'));
const { iterateV6UploadParts, v6MeshBytes } = require(path.join(root, 'art/V6MeshUploadParts'));
const key = (x, z) => `${x},${z}`;
function source(edits = new Map(), options = {}) {
  const ground = options.ground || (() => v6Plane(2));
  const top = options.top || (() => v6Plane(5));
  const world = {
    seed: 1,
    size: 192,
    at: (x, z) => (x >= 0 && z >= 0 && x < 192 && z < 192 ? { reserved: false } : null),
    groundHeight: ground,
    naturalHeight: top,
    normal: () => [0, 1, 0],
    resourceAt: (x, z) => ({ id: `n${x}_${z}`, x, z, kind: 'stone', amount: 3 }),
  };
  const capAt = () => (options.depleted ? -Infinity : Infinity);
  const retainedHeightInCell = (x, z, cx, cz) =>
    Math.min(
      Math.max(ground(x, z), Math.min(top(x, z), capAt())),
      edits.get(key(cx, cz))?.cut ?? Infinity,
    );
  return {
    world,
    revision: 'test',
    capAt,
    editAt: (x, z) => edits.get(key(x, z)) ?? null,
    resourceAt: (x, z) => (options.depleted ? null : world.resourceAt(x, z)),
    retainedHeightInCell,
    heightInCell: (x, z, cx, cz) =>
      edits.has(key(cx, cz))
        ? v6Plane(edits.get(key(cx, cz)).level)
        : retainedHeightInCell(x, z, cx, cz),
  };
}
const empty = () => ({
  positions: [],
  normals: [],
  colors: [],
  indices: [],
  min: [0, 0, 0],
  max: [0, 0, 0],
});
const coast = {
  keys: ['0,0', '1,0'],
  water: {},
  begin: () => ({ advance: () => true, result: empty }),
};
function ready(chunks) {
  for (let i = 0; i < 100; i++) {
    const tx = chunks.advance(100000, 100000);
    if (tx) return tx;
  }
  throw Error('never ready');
}
function centroid(mesh, t) {
  const ids = mesh.indices.slice(t * 3, t * 3 + 3);
  return [0, 1, 2].map((a) => ids.reduce((s, i) => s + mesh.positions[i * 3 + a], 0) / 3);
}
test('terrain6 dry ownership survives full depletion; natural tops and support use identical Float32 vertices', () => {
  const s = source(new Map(), {
    depleted: true,
    ground: (x, z) => Math.fround(2 + x * 0.125 + z * 0.0625),
  });
  assert.equal(v6OwnsSurfaceCell(s.world, 10, 10), true);
  const mesh = buildV6SurfaceMesh(s, 10, 10, 1, 1);
  assert.equal(mesh.triangles.length, 32);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    assert.equal(
      mesh.positions[i + 1],
      Math.fround(s.world.groundHeight(mesh.positions[i], mesh.positions[i + 2])),
    );
    assert.equal(Math.fround(mesh.positions[i + 1]), mesh.positions[i + 1]);
  }
  assert.ok(mesh.triangles.every((t) => t.resourceId === null));
  const support = new SurfaceSupport(mesh.positions, mesh.indices);
  const picker = new V6TerrainPicking();
  picker.sync([finishV6Chunk('0,0', mesh)]);
  const hit = picker.pick({ o: { x: 10.3, y: 30, z: 10.4 }, d: { x: 0, y: -1, z: 0 } });
  assert.ok(hit);
  assert.ok(
    Math.abs(hit.point.y - support.height({ minX: 10.3, maxX: 10.3, minZ: 10.4, maxZ: 10.4 })) <
      1e-7,
  );
});
test('terrain6 natural resource IDs occur only on original positive-thickness faces', () => {
  const mesh = buildV6SurfaceMesh(source(), 10, 10, 1, 1);
  assert.ok(mesh.triangles.every((t) => t.resourceId === 'n10_10'));
  const s = source(new Map([[key(10, 10), { cut: v6Plane(3), level: 3, fills: [] }]]));
  const cut = buildV6SurfaceMesh(s, 10, 10, 1, 1);
  assert.ok(cut.triangles.every((t) => t.resourceId === null));
  for (let t = 0; t < cut.triangles.length; t++)
    if (cut.triangles[t].surface === 'cut') assert.equal(centroid(cut, t)[1], v6Plane(3));
});
test('terrain6 direct slope fill preserves original stone below retained surface and colours only actual fill', () => {
  const s = source(
    new Map([
      [
        key(10, 10),
        {
          cut: Infinity,
          level: 6,
          fills: [
            { level: 5, material: 'soil' },
            { level: 6, material: 'soil' },
          ],
        },
      ],
    ]),
    { top: (x) => v6Plane(4) + (x - 10) * 0.75 },
  );
  const mesh = buildV6SurfaceMesh(s, 10, 10, 1, 1);
  let soil = 0,
    stone = 0;
  for (let t = 0; t < mesh.triangles.length; t++) {
    const m = mesh.triangles[t];
    if (m.surface !== 'wall') continue;
    const [x, y, z] = centroid(mesh, t),
      retained = s.retainedHeightInCell(x, z, 10, 10);
    if (y > retained + 1e-6) {
      assert.equal(m.material, 'soil');
      soil++;
    }
    if (y < retained - 1e-6 && y > s.world.groundHeight(x, z)) {
      assert.equal(m.material, 'stone');
      stone++;
    }
  }
  assert.ok(soil > 0);
  assert.equal(stone, 0, 'same unedited neighbor surface means no buried stone wall is emitted');
  assert.ok(mesh.triangles.every((t) => t.resourceId === null));
});
test('terrain6 filled strata remain separate on high platform walls above a cut neighbor', () => {
  const edits = new Map([
    [
      key(10, 10),
      {
        cut: v6Plane(3),
        level: 6,
        fills: [
          { level: 4, material: 'stone' },
          { level: 5, material: 'soil' },
          { level: 6, material: 'stone' },
        ],
      },
    ],
    [key(11, 10), { cut: v6Plane(1), level: 1, fills: [] }],
  ]);
  const s = source(edits),
    mesh = buildV6SurfaceMesh(s, 10, 10, 1, 1),
    found = new Set();
  for (let t = 0; t < mesh.triangles.length; t++) {
    if (mesh.triangles[t].surface !== 'wall') continue;
    const [x, y] = centroid(mesh, t);
    if (Math.abs(x - 11) > 1e-6) continue;
    const layer = Math.ceil(y - v6Plane(0));
    if (layer === 5) {
      assert.equal(mesh.triangles[t].material, 'soil');
      found.add(5);
    }
    if (layer === 4 || layer === 6) {
      assert.equal(mesh.triangles[t].material, 'stone');
      found.add(layer);
    }
    if (layer === 3) assert.equal(mesh.triangles[t].material, 'stone');
    if (layer === 2) assert.equal(mesh.triangles[t].material, 'soil');
  }
  assert.deepEqual([...found].sort(), [4, 5, 6]);
});
test('terrain6 vertical-face picking targets the owning cell rather than floor(hit point)', () => {
  const s = source(new Map([[key(10, 10), { cut: v6Plane(1), level: 1, fills: [] }]]));
  const mesh = buildV6SurfaceMesh(s, 11, 10, 1, 1),
    picker = new V6TerrainPicking();
  picker.sync([finishV6Chunk('0,0', mesh)]);
  const hit = picker.pick({ o: { x: 10.5, y: 3.5, z: 10.5 }, d: { x: 1, y: 0, z: 0 } });
  assert.ok(hit);
  assert.equal(hit.surface, 'wall');
  assert.equal(hit.x, 11);
  assert.equal(hit.z, 10);
  assert.equal(hit.resourceId, null);
});
test('terrain6 adjacent chunks stage together, block stale picking, cancel stale transactions and remain local', () => {
  const s = source(),
    chunks = new V6SurfaceChunks(s, coast);
  chunks.request(['0,0', '1,0']);
  ready(chunks).commit();
  ready(chunks).commit();
  assert.equal(chunks.resident().size, 2);
  const changed = source(new Map([[key(15, 8), { cut: v6Plane(2), level: 2, fills: [] }]]));
  chunks.update(changed, [{ x: 15, z: 8 }]);
  assert.equal(chunks.ready(15, 8), false);
  assert.equal(chunks.ready(16, 8), false);
  const tx = ready(chunks);
  assert.deepEqual(tx.chunks.map((c) => c.key).sort(), ['0,0', '1,0']);
  assert.equal(tx.rebuiltCells, 5);
  const old = chunks.resident().get('0,0');
  assert.notEqual(
    old,
    tx.chunks.find((c) => c.key === '0,0'),
  );
  chunks.update(source(new Map([[key(15, 8), { cut: v6Plane(1), level: 1, fills: [] }]])), [
    { x: 15, z: 8 },
  ]);
  assert.equal(chunks.isCurrent(tx), false);
  assert.throws(() => tx.commit(), /Stale/);
  const current = ready(chunks);
  current.commit();
  assert.equal(chunks.ready(15, 8), true);
  assert.equal(chunks.ready(16, 8), true);
  for (const c of chunks.resident().values())
    for (const part of iterateV6UploadParts(c.mesh)) assert.ok(v6MeshBytes(part) <= 65536);
});

test('terrain6 coast fans resolve the touched cell while sea-fill vertical faces retain their solid owner', () => {
  const picker = new V6TerrainPicking();
  const mesh = {
    positions: [0, 0, 0, 0, 0, 16, 16, 0, 16],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0],
    colors: Array(12).fill(1),
    indices: [0, 1, 2],
    min: [0, 0, 0],
    max: [16, 0, 16],
    triangles: [{ x: 0, z: 0, surface: 'coast', resourceId: null, material: 'grass' }],
  };
  picker.sync([finishV6Chunk('0,0', mesh)]);
  const flat = picker.pick({ o: { x: 5.3, y: 10, z: 8.7 }, d: { x: 0, y: -1, z: 0 } });
  assert.equal(flat.x, 5);
  assert.equal(flat.z, 8);
  const wall = {
    positions: [10, 0, 0, 10, 1, 0, 10, 1, 1],
    normals: [1, 0, 0, 1, 0, 0, 1, 0, 0],
    colors: Array(12).fill(1),
    indices: [0, 1, 2],
    min: [10, 0, 0],
    max: [10, 1, 1],
    triangles: [{ x: 10, z: 0, surface: 'coast', resourceId: null, material: 'soil' }],
  };
  picker.sync([finishV6Chunk('0,0', wall)]);
  const side = picker.pick({ o: { x: 11, y: 0.75, z: 0.25 }, d: { x: -1, y: 0, z: 0 } });
  assert.equal(side.x, 9);
  assert.equal(side.z, 0);
});

test('terrain6 pre-indexed support is ready before chunk commit and uses the identical Float32 snapshot', () => {
  const s = source(),
    chunks = new V6SurfaceChunks(s, coast);
  chunks.request(['0,0']);
  const tx = ready(chunks),
    part = tx.chunks[0],
    rect = { minX: 5.25, maxX: 5.7, minZ: 6.1, maxZ: 6.8 };
  assert.equal(chunks.resident().size, 0);
  assert.ok(part.support);
  assert.equal(
    part.support.height(rect),
    new SurfaceSupport(part.mesh.positions, part.mesh.indices).height(rect),
  );
  tx.commit();
  assert.equal(chunks.resident().get('0,0').support, part.support);
});

test('terrain6 a fill layer touching a flat original triangle retains one complete top, never a gap', () => {
  const s = source(
    new Map([[key(10, 10), { cut: Infinity, level: 7, fills: [{ level: 7, material: 'soil' }] }]]),
    { top: (x) => v6Plane(7) - Math.max(0, x - 10.5) },
  );
  const mesh = buildV6SurfaceMesh(s, 10, 10, 1, 1);
  let area = 0;
  for (let t = 0; t < mesh.triangles.length; t++) {
    const m = mesh.triangles[t];
    if (m.surface !== 'cut') continue;
    const ids = mesh.indices.slice(t * 3, t * 3 + 3),
      v = ids.map((i) => [mesh.positions[i * 3], mesh.positions[i * 3 + 2]]);
    area +=
      Math.abs(
        (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[1][1] - v[0][1]) * (v[2][0] - v[0][0]),
      ) / 2;
    if (centroid(mesh, t)[0] < 10.5) assert.equal(m.material, 'stone');
    assert.equal(m.resourceId, null);
  }
  assert.equal(area, 1);
});
test('terrain6 exact attribute dedup preserves the pre-optimization expanded triangles and metadata', () => {
  const crypto = require('node:crypto');
  const cases = [
    [source(), '4e196a2022ee23cb79faedf8a684574d8d7bb73ee624f3c52dddf4047e0671c8'],
    [
      source(
        new Map([
          [
            '10,10',
            {
              cut: Infinity,
              level: 6,
              fills: [
                { level: 5, material: 'soil' },
                { level: 6, material: 'soil' },
              ],
            },
          ],
        ]),
        { top: (x) => v6Plane(4) + (x - 10) * 0.75 },
      ),
      'bb57b967be9984975f10552ef5ae06e9b43b2619006e79c1ba5e4bd954ab22ac',
    ],
  ];
  for (const [s, expected] of cases) {
    const m = buildV6SurfaceMesh(s, 10, 10, 1, 1);
    const attributes = m.indices.map((i) => [
      ...m.positions.slice(i * 3, i * 3 + 3),
      ...m.normals.slice(i * 3, i * 3 + 3),
      ...m.colors.slice(i * 4, i * 4 + 4),
    ]);
    assert.equal(
      crypto
        .createHash('sha256')
        .update(JSON.stringify([attributes, m.triangles]))
        .digest('hex'),
      expected,
    );
    assert.ok(m.positions.length / 3 < m.indices.length);
  }
  assert.equal(buildV6SurfaceMesh(source(), 10, 10, 1, 1).positions.length / 3, 25);
});
test('terrain6 published cell spans retain only their canonical chunk, including repeated local replacement', () => {
  const chunks = new V6SurfaceChunks(source(), coast);
  chunks.request(['0,0']);
  ready(chunks).commit();
  const old = chunks.resident().get('0,0').mesh;
  const validate = () => {
    for (const [key, patches] of chunks.patches)
      for (const span of patches.values()) {
        assert.equal(span.mesh, chunks.resident().get(key).mesh);
        assert.ok(!('positions' in span));
        assert.equal(span.vertexEnd - span.vertexStart, 25);
      }
  };
  validate();
  chunks.update(source(), [{ x: 8, z: 8 }]);
  const tx = ready(chunks);
  assert.equal(tx.rebuiltCells, 5);
  tx.commit();
  validate();
  assert.notEqual(chunks.resident().get('0,0').mesh, old);
  assert.deepEqual(chunks.resident().get('0,0').mesh, old);
});
test('terrain6 resource and terrain-picker indexing yields bounded work before publication', () => {
  const { finishV6ChunkSteps } = require(path.join(root, 'art/V6SurfaceMerge'));
  const { prepareV6TerrainPickingSteps } = require(path.join(root, 'application/V6TerrainPicking'));
  const mesh = buildV6SurfaceMesh(source(), 8, 8, 2, 2);
  const work = finishV6ChunkSteps('0,0', mesh, 16);
  let yields = 0,
    next;
  do {
    next = work.next();
    if (!next.done) yields++;
  } while (!next.done);
  assert.ok(yields >= 7);
  assert.equal(next.value.surface.resources.length, 4);
  const picking = prepareV6TerrainPickingSteps(mesh, 16);
  yields = 0;
  do {
    next = picking.next();
    if (!next.done) yields++;
  } while (!next.done);
  assert.equal(yields, 7);
});
test('terrain6 interns only immutable equal metadata without merging distinct resource or material ownership', () => {
  const m = buildV6SurfaceMesh(source(), 8, 8, 2, 1);
  assert.equal(new Set(m.triangles).size, 2);
  assert.ok(m.triangles.every(Object.isFrozen));
  assert.equal(m.triangles[0], m.triangles[31]);
  assert.notEqual(m.triangles[0], m.triangles[32]);
  assert.equal(m.triangles[0].resourceId, 'n8_8');
  assert.equal(m.triangles[32].resourceId, 'n9_8');
  const original = JSON.stringify(m);
  const { appendV6Mesh, emptyV6SurfaceMesh } = require(path.join(root, 'art/V6SurfaceMerge'));
  appendV6Mesh(emptyV6SurfaceMesh(), m);
  assert.equal(JSON.stringify(m), original);
});
test('terrain6 flat-cell reduction requires the exact full height and normal field and no resource or edit', () => {
  const { v6ExactFlatCell } = require(path.join(root, 'art/V6ExactFlatCell'));
  const flat = source(new Map(), { ground: () => v6Plane(2), top: () => v6Plane(2) });
  flat.world.resourceAt = () => null;
  flat.resourceAt = () => null;
  const reduced = buildV6SurfaceMesh(flat, 8, 8, 1, 1);
  assert.equal(reduced.triangles.length, 2);
  assert.equal(reduced.positions.length / 3, 4);
  assert.ok(reduced.triangles.every((t) => t.x === 8 && t.z === 8 && t.resourceId === null));
  const picker = new V6TerrainPicking();
  picker.sync([finishV6Chunk('0,0', reduced)]);
  for (let z = 8; z <= 9; z += 0.125)
    for (let x = 8; x <= 9; x += 0.125)
      assert.equal(
        picker.pick({ o: { x, y: 10, z }, d: { x: 0, y: -1, z: 0 } }).point.y,
        v6Plane(2),
      );
  flat.world.normal = (x) => (x === 8.5 ? [0.1, 1, 0] : [0, 1, 0]);
  assert.equal(v6ExactFlatCell(flat, 8, 8), null);
  assert.equal(buildV6SurfaceMesh(flat, 8, 8, 1, 1).triangles.length, 32);
  flat.world.normal = () => [0, 1, 0];
  flat.heightInCell = (x, z) => (x === 8.5 && z === 8.5 ? v6Plane(2) + 0.01 : v6Plane(2));
  assert.equal(v6ExactFlatCell(flat, 8, 8), null);
  assert.equal(v6ExactFlatCell(source(), 8, 8), null);
});
test('terrain6 resident gate stops overview staging and a smaller requested set evicts and recovers', () => {
  const { V6SurfaceBudget, V6SurfaceBudgetError } = require(path.join(root, 'art/V6SurfaceBudget'));
  const budget = new V6SurfaceBudget(10 * 1024 * 1024);
  const chunks = new V6SurfaceChunks(source(), coast, budget);
  chunks.request(['0,0', '1,0', '2,0']);
  let failed = false;
  for (let i = 0; i < 10; i++) {
    try {
      ready(chunks).commit();
    } catch (e) {
      assert.ok(e instanceof V6SurfaceBudgetError);
      failed = true;
      chunks.abort();
      break;
    }
  }
  assert.equal(failed, true);
  assert.ok(chunks.memoryUsage().resident <= budget.limit);
  assert.equal(chunks.memoryUsage().staging, 0);
  chunks.request(['0,0']);
  while (!chunks.isSettled()) ready(chunks).commit();
  assert.deepEqual([...chunks.resident().keys()], ['0,0']);
  assert.equal(chunks.ready(8, 8), true);
  chunks.dispose();
  assert.equal(chunks.memoryUsage().resident, 0);
});
test('terrain6 simplified and detailed neighbors retain identical quarter-grid edge segments across chunk boundaries', () => {
  const flat = source(new Map(), { ground: () => v6Plane(2), top: () => v6Plane(2) });
  flat.world.resourceAt = (x, z) =>
    x === 16 ? { id: `n${x}_${z}`, x, z, kind: 'stone', amount: 1 } : null;
  flat.resourceAt = flat.world.resourceAt;
  const left = buildV6SurfaceMesh(flat, 15, 8, 1, 1);
  const right = buildV6SurfaceMesh(flat, 16, 8, 1, 1);
  const edges = (mesh, axis, value) => {
    const result = [];
    for (let t = 0; t < mesh.indices.length; t += 3)
      for (let i = 0; i < 3; i++) {
        const a = mesh.indices[t + i] * 3,
          b = mesh.indices[t + ((i + 1) % 3)] * 3;
        if (mesh.positions[a + axis] !== value || mesh.positions[b + axis] !== value) continue;
        const other = axis === 0 ? 2 : 0;
        const lo = Math.min(mesh.positions[a + other], mesh.positions[b + other]);
        const hi = Math.max(mesh.positions[a + other], mesh.positions[b + other]);
        if (lo !== hi) result.push([lo, hi]);
      }
    return result.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  };
  assert.equal(right.triangles.length, 32);
  assert.ok(left.triangles.length < 32);
  assert.deepEqual(edges(left, 0, 16), [
    [8, 8.25],
    [8.25, 8.5],
    [8.5, 8.75],
    [8.75, 9],
  ]);
  assert.deepEqual(edges(left, 0, 16), edges(right, 0, 16));
  const neighbor = buildV6SurfaceMesh(flat, 14, 8, 1, 1);
  assert.deepEqual(edges(neighbor, 0, 15), edges(left, 0, 15));
  // The same quarter perimeter applies to a neighboring edited cell and coast absence.
  flat.world.resourceAt = () => null;
  flat.resourceAt = () => null;
  flat.editAt = (x, z) => (x === 16 && z === 8 ? { cut: v6Plane(2), level: 2, fills: [] } : null);
  assert.deepEqual(
    edges(buildV6SurfaceMesh(flat, 15, 8, 1, 1), 0, 16),
    edges(buildV6SurfaceMesh(flat, 16, 8, 1, 1), 0, 16),
  );
});
test('terrain6 normal memoization is exact, bounded, and separates original coordinates and ground normals', () => {
  const { v6SurfaceNormal } = require(path.join(root, 'art/V6SurfaceNormals'));
  const world = source().world;
  let calls = 0;
  world.normal = (x, z, ground) => {
    calls++;
    return [x, z, ground ? 1 : -1];
  };
  assert.deepEqual(v6SurfaceNormal(world, -0, 2, true), [-0, 2, 1]);
  assert.deepEqual(v6SurfaceNormal(world, -0, 2, true), [-0, 2, 1]);
  assert.equal(calls, 1);
  v6SurfaceNormal(world, 0, 2, true);
  v6SurfaceNormal(world, 0, 2, false);
  assert.equal(calls, 3);
  for (let i = 1; i <= 8192; i++) v6SurfaceNormal(world, i, 2, true);
  const before = calls;
  v6SurfaceNormal(world, -0, 2, true);
  assert.equal(calls, before + 1);
  const n = v6SurfaceNormal(world, 0.123456789, 3, true);
  assert.equal(n[0], 0.123456789);
  assert.ok(Object.isFrozen(n));
});

test('v6 coarse/detail switching is atomic, blocks interactions and cannot revive edited branches on revisit', () => {
  const keys = ['0,0', '1,0', '0,1', '1,1'];
  const initial = source();
  const chunks = new V6SurfaceChunks(initial, { ...coast, keys });
  const settle = () => {
    while (!chunks.isSettled()) ready(chunks).commit();
  };
  chunks.request(keys, []);
  settle();
  assert.ok(
    [...chunks.resident().values()].every(
      (c) =>
        c.detail === false &&
        !c.support &&
        !c.surface.resources.length &&
        c.mesh.triangles.every((t) => t.resourceId === null),
    ),
  );
  assert.equal(chunks.visible(15, 15), true);
  assert.equal(chunks.ready(15, 15), false);
  const old = chunks.resident().get('0,0');
  chunks.request(keys, ['0,0']);
  const pending = ready(chunks);
  assert.equal(chunks.resident().get('0,0'), old);
  assert.equal(chunks.ready(15, 15), false);
  pending.commit();
  settle();
  assert.equal(chunks.ready(15, 15), true);
  const edits = new Map([['15,15', { cut: v6Plane(2), level: 2, fills: [] }]]);
  const branch = source(edits); // Same revision token, distinct immutable snapshot.
  chunks.update(branch, [{ x: 15, z: 15 }]);
  assert.equal(chunks.ready(15, 15), false);
  const changed = ready(chunks);
  assert.deepEqual(new Set(changed.chunks.map((c) => c.key)), new Set(keys));
  changed.commit();
  settle();
  const ray = { o: { x: 15.5, y: 20, z: 15.5 }, d: { x: 0, y: -1, z: 0 } };
  const picker = new V6TerrainPicking();
  const height = () => {
    picker.sync(chunks.resident().values());
    return picker.pick(ray).point.y;
  };
  assert.equal(height(), v6Plane(2));
  chunks.request(keys, []);
  settle();
  assert.equal(height(), v6Plane(2));
  chunks.request([], []);
  settle();
  assert.equal(chunks.resident().size, 0);
  chunks.request(keys, ['0,0']);
  settle();
  assert.equal(height(), v6Plane(2));
  // A new legal branch with the same revision must invalidate the old cell geometry.
  chunks.update(
    source(
      new Map([['15,15', { cut: v6Plane(2), level: 3, fills: [{ level: 3, material: 'soil' }] }]]),
    ),
    [{ x: 15, z: 15 }],
  );
  settle();
  assert.equal(height(), v6Plane(3));
});

test('v6 far edit invalidates the second-ring transition edge across chunks and on revisit', () => {
  const keys = ['0,0', '1,0'],
    chunks = new V6SurfaceChunks(source(), { ...coast, keys });
  const settle = () => {
    while (!chunks.isSettled()) ready(chunks).commit();
  };
  const edge = () => {
    const m = chunks.resident().get('1,0').mesh,
      out = [];
    for (let t = 0; t < m.triangles.length; t++) {
      const meta = m.triangles[t];
      if (meta.x !== 17 || meta.z !== 8 || meta.surface === 'wall') continue;
      for (let j = 0; j < 3; j++) {
        const a = m.indices[t * 3 + j] * 3,
          b = m.indices[t * 3 + ((j + 1) % 3)] * 3;
        if (m.positions[a] === 17 && m.positions[b] === 17)
          out.push([
            Math.min(m.positions[a + 2], m.positions[b + 2]),
            Math.max(m.positions[a + 2], m.positions[b + 2]),
          ]);
      }
    }
    return out.sort((a, b) => a[0] - b[0]);
  };
  chunks.request(keys, []);
  settle();
  assert.deepEqual(edge(), [[8, 9]]);
  chunks.update(source(new Map([['15,8', { cut: v6Plane(2), level: 2, fills: [] }]])), [
    { x: 15, z: 8 },
  ]);
  const tx = ready(chunks);
  assert.deepEqual(new Set(tx.chunks.map((c) => c.key)), new Set(keys));
  assert.deepEqual(edge(), [[8, 9]]);
  tx.commit();
  settle();
  const quarter = [
    [8, 8.25],
    [8.25, 8.5],
    [8.5, 8.75],
    [8.75, 9],
  ];
  assert.deepEqual(edge(), quarter);
  chunks.request([], []);
  settle();
  chunks.request(keys, []);
  settle();
  assert.deepEqual(edge(), quarter);
});

test('v6 sample fast paths never assume optional vertex capability proves a real unmodified world', () => {
  const { v6WorldHeight, v6WorldNormal } = require(path.join(root, 'art/V6SurfaceSamples'));
  const fake = source().world;
  let calls = 0;
  fake.vertex = () => {
    throw Error('Untrusted vertex capability was used');
  };
  fake.normal = () => {
    calls++;
    return [-0, 1, 0];
  };
  assert.equal(v6WorldHeight(fake, 8.25, 8.5, true), v6Plane(2));
  assert.deepEqual(v6WorldNormal(fake, 8.25, 8.5, false), [-0, 1, 0]);
  assert.equal(calls, 1);
  const { V6Terrain } = require(path.join(root, 'domain/v6-terrain'));
  const overridden = Object.create(V6Terrain.prototype);
  Object.defineProperty(overridden, 'normal', { value: () => [1, 0, 0] });
  Object.defineProperty(overridden, 'groundHeight', { value: () => 7 });
  assert.equal(v6WorldHeight(overridden, 8, 8, true), 7);
  assert.deepEqual(v6WorldNormal(overridden, 8, 8, false), [1, 0, 0]);
});

test('v6 same-membership requests reprioritize future chunks without cancelling staged geometry', () => {
  const chunks = new V6SurfaceChunks(source(), coast);
  const first = ['0,0', '1,0', '2,0'];
  chunks.request(first, []);
  chunks.advance(100, 0);
  assert.equal(chunks.lastAdvanceSteps, 0, 'zero time spends no steps');
  const pending = ready(chunks);
  assert.equal(pending.chunks[0].key, '0,0');
  chunks.request(['2,0', '1,0', '0,0'], []);
  assert.equal(chunks.isCurrent(pending), true);
  pending.commit();
  const next = ready(chunks);
  assert.equal(next.chunks[0].key, '2,0');
  next.commit();
  ready(chunks).commit();
  assert.equal(chunks.isSettled(), true);
  chunks.advance(0, 0);
  assert.equal(chunks.lastAdvanceSteps, 0);
});
