const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  { performance } = require('node:perf_hooks');
const root = process.env.V6_SURFACE_BUILD || __dirname + '/../.domain-build';
const uploader = require(__dirname + '/../tests/helpers/v6-upload-fixture.cjs');
const { V6WorldPreparation } = require(root + '/domain/v6-preparation');
const { createGame, getV6EditSurface } = require(root + '/domain/game');
const { V6SurfaceChunks } = require(root + '/art/V6SurfaceChunks');
const { createV6CoastSource } = require(root + '/art/V6Coast');
const round = (x) => Math.round(x * 100) / 100;
const report = {
  scope:
    'CPU-only current-source cache audit; real V6ChunkMeshes code with mocked Cocos worldMesh/Node, not GPU/browser/phone timings',
  node: process.version,
  cpu: os.cpus()[0]?.model,
  sourceBuild: root,
  phases: [],
};
let start = performance.now();
const p = new V6WorldPreparation(42173);
while (p.progress.status === 'building') p.step(64);
p.takeResult();
report.worldPreparationMs = round(performance.now() - start);
const state = createGame(60000, 42173, 6),
  source = getV6EditSurface(state),
  coast = createV6CoastSource(source.world, state.landExtensions),
  visual = new Set(state.trees.map((t) => `${t.x},${t.z}`)),
  keys = [...coast.keys];
let chunks = new V6SurfaceChunks(source, coast, undefined, visual),
  f = uploader(root);
function retain() {
  if (chunks.cachedMeshes) f.uploads.retain(chunks.cachedMeshes());
}
function publish(tx) {
  f.uploads.stage(tx.chunks);
  let n = 0,
    bytes = 0;
  while (true) {
    const done = f.uploads.advance(262144, 3);
    n++;
    bytes += f.uploads.lastAdvanceBytes;
    if (done) break;
    if (n > 1000) throw Error('upload stalled');
  }
  tx.commit();
  retain();
  f.uploads.publish();
  return { n, bytes };
}
function phase(label, fine, requestKeys = keys) {
  const before = new Map(chunks.resident()),
    preCalls = f.calls.length;
  const r = {
    label,
    fine,
    requested: requestKeys.length,
    advanceCalls: 0,
    completedCellBuilds: 0,
    transactionChunks: 0,
    uploadCalls: 0,
    simulatedUploadBytes: 0,
    worldMeshCalls: 0,
    reusedResidentObjects: 0,
    cpuBuildMs: 0,
    peakAccountedBytes: 0,
  };
  chunks.request(requestKeys, fine, 0.25);
  retain();
  let count = 0;
  while (!chunks.isSettled()) {
    start = performance.now();
    const tx = chunks.advance(512, 3);
    r.cpuBuildMs += performance.now() - start;
    r.advanceCalls++;
    retain();
    const mem = chunks.memoryUsage();
    r.peakAccountedBytes = Math.max(r.peakAccountedBytes, mem.resident + mem.staging);
    if (tx) {
      r.completedCellBuilds += tx.rebuiltCells;
      r.transactionChunks += tx.chunks.length;
      const q = publish(tx);
      r.uploadCalls += q.n;
      r.simulatedUploadBytes += q.bytes;
    }
    if (++count > 30000) throw Error('build stalled');
  }
  for (const [key, c] of chunks.resident()) if (before.get(key) === c) r.reusedResidentObjects++;
  r.worldMeshCalls = f.calls.length - preCalls;
  r.cpuBuildMs = round(r.cpuBuildMs);
  r.memoryUsage = chunks.memoryUsage();
  r.cacheUsage = chunks.cacheUsage?.();
  report.phases.push(r);
  console.log(JSON.stringify(r));
  return new Map(chunks.resident());
}
phase('cold_all_far', []);
phase('same_far_no_work', []);
const firstA = phase('first_near_A', ['5,5']);
phase('same_A_no_work', ['5,5']);
const firstB = phase('first_near_B', ['8,8']);
const backA = phase('return_A', ['5,5']);
report.returnAMatchesFirstA = [...firstA].filter(([k, v]) => backA.get(k) === v).length;
const backB = phase('return_B', ['8,8']);
report.returnBMatchesFirstB = [...firstB].filter(([k, v]) => backB.get(k) === v).length;
phase('return_A_again', ['5,5']);
function rapid(label) {
  const preCalls = f.calls.length;
  let discarded = 0,
    cells = 0,
    groups = 0,
    bytes = 0;
  for (let i = 0; i < 20; i++) {
    const before = chunks.rebuilt;
    chunks.request(activeKeys, [i % 2 ? '5,5' : '8,8'], 0.25);
    discarded += before;
    retain();
    const tx = chunks.advance(512, 3);
    retain();
    if (tx) {
      groups++;
      cells += tx.rebuiltCells;
      bytes += publish(tx).bytes;
    }
  }
  const r = {
    label,
    requests: 20,
    completedCellPatchesDiscardedAtRequest: discarded,
    groupsPublishedDuringMovement: groups,
    completedCellsDuringMovement: cells,
    simulatedUploadBytes: bytes,
    worldMeshCalls: f.calls.length - preCalls,
    illustrativeSyntheticRequestSequenceNotRecordedUserCamera: true,
  };
  report.rapid ??= [];
  report.rapid.push(r);
  console.log(JSON.stringify(r));
  phase(label + '_settle_after_stop', ['5,5'], activeKeys);
}
let activeKeys = keys;
rapid('warm_rapid_alternation');
chunks.dispose();
f.uploads.dispose();
chunks = new V6SurfaceChunks(source, coast, undefined, visual);
f = uploader(root);
activeKeys = ['5,4', '4,5', '5,5', '6,5', '5,6', '8,7', '7,8', '8,8', '9,8', '8,9'];
phase('cold_rapid_far_setup', [], activeKeys);
rapid('cold_rapid_alternation');
chunks.dispose();
f.uploads.dispose();
const output =
  process.env.V6_BENCHMARK_OUTPUT || path.join(__dirname, '../build/v6-hot-cache-benchmark.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2));
