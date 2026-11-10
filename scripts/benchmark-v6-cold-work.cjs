/** Deterministic before/after cold-work counts, not elapsed time or device performance. */
const fs = require('node:fs'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
const root = process.env.V6_SURFACE_BUILD || path.join(__dirname, '../.domain-build');
const uploader = require('../tests/helpers/v6-upload-fixture.cjs');
const { V6WorldPreparation } = require(root + '/domain/v6-preparation');
const { createGame, getV6EditSurface } = require(root + '/domain/game');
const { V6SurfaceChunks } = require(root + '/art/V6SurfaceChunks');
const { createV6CoastSource } = require(root + '/art/V6Coast');
const p = new V6WorldPreparation(42173);
while (p.progress.status === 'building') p.step(64);
p.takeResult();
const state = createGame(60000, 42173, 6),
  source = getV6EditSurface(state);
const keys = ['5,4', '4,5', '5,5', '6,5', '5,6', '8,7', '7,8', '8,8', '9,8', '8,9'];
const report = {
  scope:
    'Deterministic Node CPU work counts and real V6ChunkMeshes with Cocos call doubles; no GPU/browser/phone timing.',
  sourceBuild: root,
  seed: 42173,
  node: process.version,
  requests: 20,
  maxStepsPerRequest: 512,
  maxMilliseconds: 'Infinity to remove wall-clock scheduling noise',
  keys,
  visualAnchors: true,
  syntheticSequenceNotRecordedCamera: true,
  scenarios: [],
};
for (const compatible of [true, false]) {
  const c = new V6SurfaceChunks(
      source,
      createV6CoastSource(source.world, state.landExtensions),
      undefined,
      new Set(state.trees.map((t) => `${t.x},${t.z}`)),
    ),
    gpu = uploader(root);
  let stats;
  const reset = () => ({
    completedCellPatches: 0,
    discardedCellPatches: 0,
    publishedCellBuilds: 0,
    groupsPublished: 0,
    rebuiltGroupsPublished: 0,
    uploadBytes: 0,
    buildSteps: 0,
    advanceCalls: 0,
    retainedRequests: 0,
    peakAccountedBytes: 0,
    worldMeshCalls: 0,
  });
  function request(fine) {
    const epoch = c.epoch,
      rebuilt = c.rebuilt,
      active = !!c.jobs;
    c.request(keys, fine, 0.25);
    if (c.epoch !== epoch) stats.discardedCellPatches += rebuilt;
    else if (active) stats.retainedRequests++;
  }
  function advance() {
    const before = c.rebuilt,
      calls = gpu.calls.length,
      t = c.advance(512, Infinity);
    stats.completedCellPatches += c.rebuilt - before;
    stats.buildSteps += c.lastAdvanceSteps;
    stats.advanceCalls++;
    gpu.uploads.retain(c.cachedMeshes());
    const m = c.memoryUsage();
    stats.peakAccountedBytes = Math.max(stats.peakAccountedBytes, m.resident + m.staging);
    if (t) {
      gpu.uploads.stage(t.chunks);
      for (;;) {
        const done = gpu.uploads.advance(262144, Infinity);
        stats.uploadBytes += gpu.uploads.lastAdvanceBytes;
        if (done) break;
      }
      stats.publishedCellBuilds += t.rebuiltCells;
      stats.groupsPublished++;
      if (t.rebuiltCells > 0) stats.rebuiltGroupsPublished++;
      t.commit();
      gpu.uploads.retain(c.cachedMeshes());
      gpu.uploads.publish();
    }
    stats.worldMeshCalls += gpu.calls.length - calls;
  }
  function settle() {
    let count = 0;
    while (!c.isSettled()) {
      if (++count > 10000) throw Error('benchmark stalled');
      advance();
    }
  }
  stats = reset();
  request([]);
  settle();
  const setup = stats;
  stats = reset();
  for (let i = 0; i < 20; i++) {
    request(compatible ? (i % 2 ? ['5,5', '8,8'] : ['5,5']) : i % 2 ? ['5,5'] : ['8,8']);
    advance();
  }
  const movement = stats;
  stats = reset();
  request(['5,5']);
  settle();
  const afterStop = stats,
    hash = createHash('sha256');
  for (const [key, chunk] of [...c.resident()].sort(([a], [b]) => a.localeCompare(b))) {
    const m = chunk.mesh;
    hash.update(
      JSON.stringify([
        key,
        chunk.detail,
        m.positions,
        m.normals,
        m.colors,
        m.indices,
        m.min,
        m.max,
        m.triangles.map((t) => [t.x, t.z, t.surface, t.material, t.resourceId]),
      ]),
    );
  }
  const result = {
    label: compatible ? 'stable_A_with_distant_B_toggling' : 'incompatible_A_B_alternation',
    setup,
    movement,
    afterStop,
    totalCompletedCellPatches: movement.completedCellPatches + afterStop.completedCellPatches,
    totalDiscardedCellPatches: movement.discardedCellPatches + afterStop.discardedCellPatches,
    residentChunks: c.resident().size,
    geometrySha256: hash.digest('hex'),
    memoryUsage: c.memoryUsage(),
    cacheUsage: c.cacheUsage(),
  };
  c.dispose();
  gpu.uploads.dispose();
  result.disposedUsage = c.memoryUsage();
  result.allMeshesDestroyedOnce = gpu.meshes.every((m) => m.destroyed === 1);
  report.scenarios.push(result);
}
const output =
  process.env.V6_BENCHMARK_OUTPUT || path.join(__dirname, '../build/v6-cold-work-benchmark.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
