/** CPU-only diagnostics. No Cocos allocations, browser frames or GPU measurements. */
const { performance } = require('node:perf_hooks');
const { getV5World } = require('../../.domain-build/domain/v5-world');
const { createV5Foundation } = require('../../.domain-build/domain/v5-foundation');
const { V5ResourceChunks } = require('../../.domain-build/art/V5ResourceChunks');
const { iterateV5UploadParts } = require('../../.domain-build/art/V5MeshUploadParts');
const { SurfaceSupport } = require('../../.domain-build/application/SurfaceSupport');
let start = performance.now();
getV5World(42173);
const worldMs = performance.now() - start;
const f = createV5Foundation(42173);
start = performance.now();
const c = new V5ResourceChunks(42173),
  adapterMs = performance.now() - start;
c.update(f.naturalResources);
c.request(['5,4', '6,4', '5,5', '6,5']);
const ticks = [];
let tx;
for (let i = 0; i < 10000 && !tx; i++) {
  start = performance.now();
  tx = c.advance(8, 3);
  ticks.push(performance.now() - start);
}
if (!tx) throw Error('No completed transaction');
const split = [],
  support = [];
for (const ch of tx.chunks) {
  const it = iterateV5UploadParts(ch.mesh);
  for (;;) {
    start = performance.now();
    const result = it.next();
    split.push(performance.now() - start);
    if (result.done) break;
  }
  start = performance.now();
  new SurfaceSupport(ch.mesh.positions, ch.mesh.indices);
  support.push(performance.now() - start);
}
const summary = (a) => {
  const s = a.slice().sort((a, b) => a - b);
  return {
    calls: s.length,
    totalMs: s.reduce((n, x) => n + x, 0),
    p95Ms: s[Math.floor((s.length - 1) * 0.95)],
    maxMs: s.at(-1),
  };
};
console.log(
  JSON.stringify(
    {
      limits:
        'Cloud CPU, real production pure classes. Source generation, adapter super constructor and support-index construction remain synchronous. 3 ms is a cooperative check, not a hard frame guarantee. GPU/browser/driver not measured.',
      scope: 'First independently publishable chunk of a four-chunk request; not the full view.',
      worldMs,
      adapterMs,
      patchAndMergeAdvance: summary(ticks),
      oneLazyUploadPart: summary(split),
      oneChunkSupportIndex: summary(support),
      preparedChunks: tx.chunks.length,
      rebuiltCells: tx.rebuiltCells,
    },
    null,
    2,
  ),
);
c.dispose();
