/** Reproduce a loading correctness defect, not a wall-clock or GPU benchmark. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const uploader = require('../tests/helpers/v6-upload-fixture.cjs');
const { fingerprint } = require('../tests/helpers/v6-tree-fingerprint.cjs');
const current = path.resolve(__dirname, '../.domain-build');
const baseline = process.env.V6_TREE_GROUND_BASELINE_BUILD;
const baselineView = process.env.V6_TREE_GROUND_BASELINE_VIEW;
if (!baseline || !baselineView)
  throw Error(
    'Set V6_TREE_GROUND_BASELINE_BUILD and V6_TREE_GROUND_BASELINE_VIEW to unmodified 5519fd1 compiled code and V6TreeView.ts',
  );
const { V6WorldPreparation } = require(current + '/domain/v6-preparation');
const { createGame, getV6EditSurface } = require(current + '/domain/game');
const prep = new V6WorldPreparation(42173);
while (prep.progress.status === 'building') prep.step(64);
prep.takeResult();
const state = createGame(60000, 42173, 6),
  source = getV6EditSurface(state),
  original = JSON.stringify(state);
const blocked = state.trees.find((t) => Math.floor(t.x / 16) === 7 && Math.floor(t.z / 16) === 3);
const ready = state.trees.find((t) => Math.floor(t.x / 16) === 8 && Math.floor(t.z / 16) === 7);
assert.ok(blocked && ready);
const bounds = { minX: 130, minZ: 32, maxX: 142, maxZ: 128 };
function run(root, viewFile) {
  const { V6SurfaceChunks } = require(root + '/art/V6SurfaceChunks');
  const ground = Object.create(V6SurfaceChunks.prototype);
  Object.assign(ground, {
    live: new Map(Array.from({ length: 7 }, (_, i) => [`8,${i + 2}`, { detail: true }])),
    dirty: new Set(),
    coastDirty: new Set(),
    lodDirty: new Set(),
  });
  const pools = [],
    first = uploader(root);
  class Uploads {
    constructor() {
      const gpu = pools.length ? uploader(root) : first;
      pools.push(gpu);
      return gpu.uploads;
    }
  }
  const code = ts.transpileModule(fs.readFileSync(viewFile, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id === 'cc') return { Node: first.parent.constructor };
      if (id === './V6ChunkMeshes') return { V6ChunkMeshes: Uploads };
      if (id === './WorldMaterial') return { worldMaterial: () => ({ destroy() {} }) };
      if (id === './TouchPicking') return { nearProjectedBounds: () => true };
      if (id.startsWith('../')) return require(path.join(root, id.slice(3)));
      throw Error(id);
    },
    module,
    module.exports,
  );
  const view = new module.exports.V6TreeView(
    first.parent,
    (x, z) => ground.ready(x, z),
    (x, z) => source.heightInCell(x, z, Math.floor(x), Math.floor(z)),
    (x, z) => ground.visible(x, z),
  );
  view.sync({ ...state, trees: [blocked, ready] }, state.lastSeenAt);
  const ids = () => [...view.stream.surfaces()].map(([id]) => id).sort();
  for (let i = 0; i < 1000; i++) view.frame(bounds, 30);
  const blockedPhase = {
    frameCalls: 1000,
    visibleTreeIds: ids(),
    pendingChunk: view.stream.pending?.chunk.key ?? null,
    loading: view.loading,
    meshCreates: pools.reduce((n, p) => n + p.calls.length, 0),
  };
  ground.live.set('7,3', { detail: true });
  for (let i = 0; i < 1000 && ids().length !== 2; i++) view.frame(bounds, 30);
  const completedIds = ids(),
    upload = require(root + '/art/V6MeshUploadParts');
  const completedGeometry = [...view.stream.live]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, ...fingerprint(value.batch, upload) }));
  view.dispose();
  assert.ok(pools.every((p) => p.meshes.every((m) => m.destroyed === 1)));
  return {
    blockedPhase,
    completedIds,
    completedGeometry,
    allSimulatedMeshesDestroyedOnce: true,
    disposedCacheBytes: view.stream.cacheUsage().bytes,
  };
}
const before = run(path.resolve(baseline), path.resolve(baselineView));
const after = run(current, path.resolve(__dirname, '../assets/scripts/presentation/V6TreeView.ts'));
assert.deepEqual(before.blockedPhase.visibleTreeIds, []);
assert.equal(before.blockedPhase.pendingChunk, '7:3');
assert.equal(before.blockedPhase.loading, true);
assert.deepEqual(after.blockedPhase.visibleTreeIds, [ready.id]);
assert.equal(after.blockedPhase.pendingChunk, null);
assert.equal(after.blockedPhase.loading, false);
assert.deepEqual(before.completedIds, after.completedIds);
assert.deepEqual(before.completedGeometry, after.completedGeometry);
assert.equal(JSON.stringify(state), original);
const report = {
  scope:
    'Actual V6TreeView, V6TreeStreaming, V6SurfaceChunks visibility and V6ChunkMeshes with Cocos call doubles; no browser/GPU/device evidence.',
  baseline: '5519fd1 tree-cold-and-cache checkpoint',
  seed: 42173,
  bounds,
  fixture:
    'Two actual identities sampled from the generated saved state. The constrained ground residency models the chunks intersecting this viewport; the 2-unit tree margin also includes unavailable 7:3.',
  blockedTree: blocked,
  readyTree: ready,
  before,
  after,
  savedStateUnchanged: true,
};
const output =
  process.env.V6_TREE_GROUND_OUTPUT ||
  path.resolve(__dirname, '../build/v6-tree-ground-reproduction.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
