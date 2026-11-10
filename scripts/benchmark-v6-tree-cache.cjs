/** Fixed saved-world CPU work and production upload calls, not device timing. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const uploader = require('../tests/helpers/v6-upload-fixture.cjs');
const current = path.resolve(__dirname, '../.domain-build');
const baseline = process.env.V6_TREE_BASELINE_BUILD;
if (!baseline)
  throw Error('Set V6_TREE_BASELINE_BUILD to the compiled unmodified b8a8f7f snapshot');
const { V6WorldPreparation } = require(current + '/domain/v6-preparation');
const { createGame, getV6EditSurface } = require(current + '/domain/game');
const preparation = new V6WorldPreparation(42173);
while (preparation.progress.status === 'building') preparation.step(64);
preparation.takeResult();
const state = createGame(60000, 42173, 6),
  source = getV6EditSurface(state);
const originalState = JSON.stringify(state);
const report = {
  scope:
    'Node CPU work counts and production V6ChunkMeshes with Cocos call doubles. No GPU, browser, phone or frame-rate measurement.',
  baseline: 'Delivered b8a8f7f snapshot restored from libfile_7cb7eeedfdc481919d97045029e719cc',
  seed: 42173,
  savedTrees: state.trees.length,
  node: process.version,
  budget: { maxTrees: 24, maxMilliseconds: 'Infinity', maxUploadBytes: 262144 },
  camera:
    'Synthetic 8x8 view centered inside each stated 16x16 chunk; the existing two-unit margin selects its saved trees. No map-size change.',
  scenarios: [],
};
function run(build, sequence, far) {
  const { V6TreeStreaming } = require(build + '/application/V6TreeStreaming');
  const { V6TreeBatchBuilder } = require(build + '/art/V6TreeGeometry');
  const append = V6TreeBatchBuilder.prototype.append;
  const live = new Map(),
    pools = new Map(),
    allPools = [];
  let counts,
    staging = null,
    peak = 0;
  V6TreeBatchBuilder.prototype.append = function () {
    counts.builtTrees++;
    return append.call(this);
  };
  const stream = new V6TreeStreaming(
    (key, batch, bytes) => {
      let gpu = pools.get(key);
      if (!gpu) {
        gpu = uploader(build);
        pools.set(key, gpu);
        allPools.push(gpu);
      }
      if (staging !== batch) {
        gpu.uploads.stage([{ key, mesh: batch.mesh }]);
        staging = batch;
      }
      const before = gpu.calls.length,
        done = gpu.uploads.advance(bytes, Infinity);
      counts.uploadBytes += gpu.uploads.lastAdvanceBytes;
      counts.meshCreates += gpu.calls.length - before;
      if (!done) return false;
      gpu.uploads.publish();
      live.set(key, batch);
      staging = null;
      return true;
    },
    (key) => {
      pools.get(key)?.uploads.dispose();
      pools.delete(key);
      live.delete(key);
    },
    (key) => {
      pools.get(key)?.uploads.cancel();
      staging = null;
    },
    (x, z) => {
      counts.heightSamples++;
      return source.heightInCell(x, z, Math.floor(x), Math.floor(z));
    },
  );
  stream.sync(state, state.lastSeenAt);
  const phases = [];
  try {
    for (const key of sequence) {
      const [x, z] = key.split(':').map(Number);
      counts = {
        builtTrees: 0,
        heightSamples: 0,
        uploadBytes: 0,
        meshCreates: 0,
        callsToSettle: 0,
      };
      do {
        if (++counts.callsToSettle > 2000) throw Error('Tree stream did not settle');
        stream.frame(
          { minX: x * 16 + 4, minZ: z * 16 + 4, maxX: x * 16 + 12, maxZ: z * 16 + 12 },
          {
            maxTrees: 24,
            maxMilliseconds: Infinity,
            maxUploadBytes: 262144,
            lodSpan: far ? 90 : 30,
          },
          () => 0,
        );
        peak = Math.max(peak, stream.cacheUsage?.().bytes ?? 0);
      } while (stream.loading);
      const meshHash = createHash('sha256'),
        pickHash = createHash('sha256');
      for (const [k, b] of [...live].sort()) {
        meshHash.update(JSON.stringify([k, b.mesh]));
        for (const [id, surface] of b.surfaces) {
          const tree = state.trees.find((t) => t.id === id),
            a = b.anchors[[...b.surfaces.keys()].indexOf(id)];
          assert.ok(tree);
          pickHash.update(
            JSON.stringify([
              id,
              surface.bounds,
              surface.distance({ o: { x: a.x, y: 100, z: a.z }, d: { x: 0, y: -1, z: 0 } }),
            ]),
          );
        }
      }
      phases.push({
        key,
        ...counts,
        visibleTrees: [...stream.surfaces()].length,
        geometrySha256: meshHash.digest('hex'),
        pickingSha256: pickHash.digest('hex'),
        cache: stream.cacheUsage?.() ?? { entries: 0, bytes: 0, limit: 0 },
      });
    }
  } finally {
    V6TreeBatchBuilder.prototype.append = append;
    stream.dispose();
    for (const gpu of pools.values()) gpu.uploads.dispose();
  }
  assert.ok(allPools.every((g) => g.meshes.every((m) => m.destroyed === 1)));
  assert.equal(stream.cacheUsage?.().bytes ?? 0, 0);
  return { phases, peakInactiveCpuAccountedBytes: peak, allSimulatedMeshesDestroyedOnce: true };
}
for (const [label, sequence, far] of [
  ['near_A_B_A', ['8:3', '10:6', '8:3'], false],
  ['far_A_B_A', ['8:3', '10:6', '8:3'], true],
  ['oversized_near_chunk_control', ['7:3', '8:3', '7:3'], false],
]) {
  const before = run(path.resolve(baseline), sequence, far),
    after = run(current, sequence, far);
  before.phases.forEach((p, i) => {
    assert.equal(after.phases[i].geometrySha256, p.geometrySha256);
    assert.equal(after.phases[i].pickingSha256, p.pickingSha256);
    assert.equal(after.phases[i].uploadBytes, p.uploadBytes);
  });
  report.scenarios.push({ label, before, after });
}
assert.equal(JSON.stringify(state), originalState, 'Rendering cannot mutate the save');
report.savedStateUnchanged = true;
const output =
  process.env.V6_TREE_BENCHMARK_OUTPUT ||
  path.join(__dirname, '../build/v6-tree-cache-benchmark.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
