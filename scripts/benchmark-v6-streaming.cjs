/** CPU-only reproduction of the 2026-11-07 whole-island far-surface profile.
 * Compile first. V6_SURFACE_BUILD may select an isolated before/after build.
 * This does not measure Cocos upload, rendering, browser FPS or phone performance. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const root = process.env.V6_SURFACE_BUILD || path.join(__dirname, '../.domain-build');
const { V6WorldPreparation } = require(path.join(root, 'domain/v6-preparation'));
const { createGame, getV6EditSurface } = require(path.join(root, 'domain/game'));
const { createV6CoastSource } = require(path.join(root, 'art/V6Coast'));
const { V6SurfaceChunks } = require(path.join(root, 'art/V6SurfaceChunks'));
const { iterateV6UploadParts, v6MeshBytes } = require(path.join(root, 'art/V6MeshUploadParts'));
const now = () => performance.now();
const round = (n) => Math.round(n * 100) / 100;
const seed = Number(process.env.V6_SEED || 42173);
let start = now();
const preparation = new V6WorldPreparation(seed);
while (preparation.progress.status !== 'ready') preparation.step(64);
preparation.takeResult();
const preparationMs = now() - start;
const state = createGame(60000, seed, 6);
const source = getV6EditSurface(state);
start = now();
const coast = createV6CoastSource(source.world, state.landExtensions);
const coastSetupMs = now() - start;
const distance = (key) => {
  const [x, z] = key.split(',').map(Number);
  return Math.hypot(x * 16 + 8 - 96, z * 16 + 8 - 96);
};
// Keep original island-center ordering for a like-for-like CPU comparison.
const keys = [...coast.keys].sort((a, b) => distance(a) - distance(b));
const chunks = new V6SurfaceChunks(
  source,
  coast,
  undefined,
  new Set(state.trees.map((t) => `${t.x},${t.z}`)),
);
chunks.request(keys, [], 0.25);
let calls = 0,
  transactions = 0,
  buildMs = 0,
  uploadPartitionMs = 0,
  maxCallMs = 0;
let vertices = 0,
  triangles = 0,
  uploadParts = 0,
  sourceBytes = 0,
  maxPartBytes = 0;
const hash = createHash('sha256');
while (!chunks.isSettled()) {
  start = now();
  const tx = chunks.advance(512, 3);
  const elapsed = now() - start;
  buildMs += elapsed;
  maxCallMs = Math.max(maxCallMs, elapsed);
  calls++;
  if (calls > 15000) throw Error('Bounded benchmark limit exceeded');
  if (!tx) continue;
  start = now();
  for (const chunk of tx.chunks) {
    vertices += chunk.mesh.positions.length / 3;
    triangles += chunk.mesh.indices.length / 3;
    for (const part of iterateV6UploadParts(chunk.mesh)) {
      const bytes = v6MeshBytes(part);
      uploadParts++;
      sourceBytes += bytes;
      maxPartBytes = Math.max(maxPartBytes, bytes);
    }
  }
  uploadPartitionMs += now() - start;
  // Exact whole-world array/metadata identity, outside the timed build section.
  for (const chunk of tx.chunks) {
    const m = chunk.mesh;
    hash.update(
      JSON.stringify([
        chunk.key,
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
  tx.commit();
  transactions++;
}
const result = {
  scope: 'Cloud Node CPU only; no Cocos/GPU/browser/phone. Hashing is outside build/upload timers.',
  node: process.version,
  cpu: os.cpus()[0]?.model,
  seed,
  preparationMs: round(preparationMs),
  coastSetupMs: round(coastSetupMs),
  keys: keys.length,
  buildMs: round(buildMs),
  uploadPartitionMs: round(uploadPartitionMs),
  maxCallMs: round(maxCallMs),
  calls,
  transactions,
  vertices,
  triangles,
  uploadParts,
  sourceBytes,
  maxPartBytes,
  geometrySha256: hash.digest('hex'),
  accountedResidentBytes: chunks.memoryUsage().resident,
  oneAdvancePerFrameEstimateSeconds30Hz: round(calls / 30),
  oneAdvancePerFrameEstimateSeconds60Hz: round(calls / 60),
  note: 'Call-count estimates retain the old one-advance-per-frame model, not the new bounded batching or measured load time.',
};
chunks.dispose();
console.log(JSON.stringify(result, null, 2));
if (process.env.V6_BENCHMARK_OUTPUT)
  fs.writeFileSync(process.env.V6_BENCHMARK_OUTPUT, JSON.stringify(result, null, 2) + '\n');
