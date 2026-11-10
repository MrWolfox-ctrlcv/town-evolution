const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.env.V7_SURFACE_BUILD || path.join(__dirname, '..', '.domain-build');
const mod = (name) => require(path.join(root, name));
const { V7WorldPreparation } = mod('domain/v7-preparation');
const { V6WorldPreparation } = mod('domain/v6-preparation');
const { createGame } = mod('domain/state');
const { getV6EditSurface } = mod('domain/v6-edit-surface');
const { buildV6SurfaceMesh } = mod('art/V6SurfaceMesh');
const { buildV6FarSurfaceSteps } = mod('art/V6FarSurfaceMesh');
const { finishV6Chunk } = mod('art/V6SurfaceMerge');
const { V6TerrainPicking } = mod('application/V6TerrainPicking');
const { SurfaceSupport } = mod('application/SurfaceSupport');
const { createV6CoastSource } = mod('art/V6Coast');
const { V6SurfaceChunks } = mod('art/V6SurfaceChunks');
const { V7_HYDROLOGY_REVISION, V7_FIELD_EPSILON } = mod('domain/v7-contracts');
function prepare(Preparation) {
  const p = new Preparation(1);
  while (p.step(1000000).status !== 'ready') {}
  return p.takeResult();
}
const next = prepare(V7WorldPreparation),
  old = prepare(V6WorldPreparation);
const state7 = createGame(1000, 1, 7),
  state6 = createGame(1000, 1, 6);
function finish(work) {
  let r;
  do {
    r = work.next();
  } while (!r.done);
  return r.value;
}
function hit(mesh, x, z) {
  const picker = new V6TerrainPicking();
  picker.sync([finishV6Chunk('0,0', mesh)]);
  return picker.pick({ o: { x, y: 50, z }, d: { x: 0, y: -1, z: 0 } });
}
test('same-seed 6/7 keep distinct authoritative near/far geometry and CPU picks', () => {
  const a = getV6EditSurface(state7),
    b = getV6EditSurface(state6);
  assert.equal(a.world, next.terrain);
  assert.equal(b.world, old.terrain);
  let point;
  for (let z = 20; z < 170 && !point; z++)
    for (let x = 20; x < 170; x++) {
      if (
        !a.world.at(x, z)?.reserved &&
        a.world.at(x, z) &&
        b.world.at(x, z) &&
        !b.world.at(x, z).reserved &&
        Math.abs(a.heightInCell(x + 0.5, z + 0.5, x, z) - b.heightInCell(x + 0.5, z + 0.5, x, z)) >
          0.05
      ) {
        point = { x, z };
        break;
      }
    }
  assert.ok(point, 'actual shared land with different seeded heights');
  const { x, z } = point;
  const near = buildV6SurfaceMesh(a, x, z, 1, 1),
    legacy = buildV6SurfaceMesh(b, x, z, 1, 1);
  assert.notDeepEqual(near.positions, legacy.positions);
  const far = finish(buildV6FarSurfaceSteps(a, x, z, 1, 1, () => false, 0));
  assert.deepEqual(far.positions, near.positions);
  assert.ok(far.triangles.every((t) => t.resourceId === null));
  const picked = hit(near, x + 0.5, z + 0.5);
  assert.ok(picked);
  assert.ok(Math.abs(picked.point.y - a.heightInCell(x + 0.5, z + 0.5, x, z)) < 1e-6);
  const support = new SurfaceSupport(near.positions, near.indices);
  assert.ok(
    Math.abs(
      picked.point.y -
        support.height({ minX: x + 0.5, maxX: x + 0.5, minZ: z + 0.5, maxZ: z + 0.5 }),
    ) < 1e-7,
  );
  assert.deepEqual(
    buildV6SurfaceMesh(b, x, z, 1, 1),
    legacy,
    'new7 queries never poison old6 geometry',
  );
});
test('new7 edited cut top uses the same Float32 plane for near/far/support/picking', () => {
  const source = getV6EditSurface(state7),
    x = 6,
    z = 6;
  const modified = {
    ...state7,
    terrain6: {
      format: 1,
      nextOperation: 1,
      cells: [
        {
          x,
          z,
          initialResourceAmount: 0,
          cutLevel: -1,
          level: -1,
          fills: [],
        },
      ],
    },
  };
  const edited = getV6EditSurface(modified);
  assert.equal(edited.world, source.world);
  const near = buildV6SurfaceMesh(edited, x, z, 1, 1),
    far = finish(buildV6FarSurfaceSteps(edited, x, z, 1, 1, () => false, 0));
  assert.deepEqual(far.positions, near.positions);
  const picked = hit(near, x + 0.5, z + 0.5);
  assert.ok(picked);
  assert.equal(picked.point.y, Math.fround(0.015 - 1));
  assert.equal(picked.surface, 'cut');
  assert.equal(picked.resourceId, null);
});
test('new7 complete chunk transaction stages near and far using its source world', () => {
  const source = getV6EditSurface(state7),
    coast = createV6CoastSource(source.world);
  const chunks = new V6SurfaceChunks(source, coast);
  for (const fine of [[], ['0,0']]) {
    chunks.request(['0,0'], fine, 0.25);
    for (let i = 0; i < 100 && !chunks.isSettled(); i++) {
      const tx = chunks.advance(100000, 100000);
      if (tx) tx.commit();
    }
    assert.ok(chunks.isSettled());
    const chunk = chunks.resident().get('0,0');
    assert.ok(chunk.mesh.indices.length);
    assert.equal(chunk.detail, fine.length > 0);
    if (fine.length) assert.ok(hit(chunk.mesh, 6.5, 6.5));
  }
  chunks.dispose();
});
test('new7 water colors sample the new coast, never the same-seed old coast', () => {
  const a = createV6CoastSource(next.terrain),
    b = createV6CoastSource(old.terrain);
  assert.notDeepEqual(a.water.colors, b.water.colors);
  for (let i = 0; i < a.water.positions.length / 3; i += 37) {
    const x = a.water.positions[i * 3],
      z = a.water.positions[i * 3 + 2];
    const sample = next.terrain.hydrology.naturalCoast.sample(x, z, 'water');
    const baseT = Math.max(0, Math.min(1, -sample.dry / 9));
    const bedT = Math.max(0, Math.min(1, (-0.62 - sample.height) / 0.6));
    const t = baseT * (1 - sample.influence) + bedT * sample.influence,
      d = t * t * (3 - 2 * t);
    assert.equal(a.water.colors[i * 4], 0.34 * (1 - d) + 0.15 * d);
  }
});
test('new7 epsilon widens retained coast LOD bounds, legacy decision unchanged', () => {
  const radius = 8 * Math.SQRT2 + 0.25 * Math.SQRT2;
  function source(version, dry) {
    const field = {
      base: { version },
      size: 192,
      fields: (x, z) => ({ dry: dry + (x + z - 16) / Math.SQRT2 }),
      naturalCoast: {
        patchBounds: { x0: 500, x1: 501, z0: 500, z1: 501 },
        toWorld: (x, z) => [x, z],
      },
      featureBounds: { x0: 500, x1: 501, z0: 500, z1: 501 },
      sample: () => ({ height: -1.085, color: [0.4, 0.5, 0.6] }),
    };
    return createV6CoastSource(
      { seed: 1, size: 192, hydrology: field, at: () => null },
      [],
      {},
    ).build('0,0', true);
  }
  const boundary = -2.35 - radius - V7_FIELD_EPSILON / 2;
  assert.equal(source('legacy', boundary).indices.length, 0);
  assert.ok(source(V7_HYDROLOGY_REVISION, boundary).indices.length > 0);
  assert.equal(source(V7_HYDROLOGY_REVISION, boundary - 2 * V7_FIELD_EPSILON).indices.length, 0);
});
test('presentation same-seed switch replaces chunk cache, picker and water source', () => {
  const fs = require('node:fs'),
    ts = require('typescript');
  let disposed = 0;
  class Meshes {
    dispose() {
      disposed++;
    }
    cancel() {}
    retain() {}
  }
  const code = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '../assets/scripts/presentation/V6IslandView.ts'), 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    },
  ).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (name) => {
      if (name === './V6ChunkMeshes') return { V6ChunkMeshes: Meshes };
      if (name.startsWith('../')) return mod(name.slice(3));
      throw Error(name);
    },
    module,
    module.exports,
  );
  const waters = [],
    support = { setFarms() {}, clearNaturalChunks() {}, clearCoastChunks() {} };
  const view = new module.exports.V6IslandView(
    { node: {} },
    {},
    {},
    {
      configure(_renderer, data) {
        waters.push(data);
      },
    },
    support,
  );
  view.sync(state6);
  const oldChunks = view.chunks;
  assert.equal(view.source.world, old.terrain);
  view.sync(state7);
  assert.notEqual(view.chunks, oldChunks);
  assert.equal(disposed, 1);
  assert.equal(view.source.world, next.terrain);
  assert.notDeepEqual(waters[0].colors, waters[1].colors);
  assert.equal(
    view.pickTerrain({ o: { x: 6.5, y: 50, z: 6.5 }, d: { x: 0, y: -1, z: 0 } }),
    null,
    'old published picks cannot survive switch',
  );
  const current = view.chunks;
  view.sync({ ...state7 });
  assert.equal(view.chunks, current, 'same identity does not churn caches');
  view.sync(state6);
  assert.equal(view.source.world, old.terrain);
  assert.deepEqual(waters[0].colors, waters[2].colors);
  view.dispose();
});
