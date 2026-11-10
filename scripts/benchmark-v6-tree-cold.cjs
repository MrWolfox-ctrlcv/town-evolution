/** First-visit CPU transforms, not an end-to-end Cocos frame or device benchmark. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { fingerprint } = require('../tests/helpers/v6-tree-fingerprint.cjs');
const current = path.resolve(__dirname, '../.domain-build');
const baseline = process.env.V6_TREE_COLD_BASELINE_BUILD;
if (!baseline)
  throw Error('Set V6_TREE_COLD_BASELINE_BUILD to the compiled tree-cache checkpoint 697948f');
const roots = [path.resolve(baseline), current];
const implementations = roots.map(
  (root) => require(root + '/art/V6TreeGeometry').V6TreeBatchBuilder,
);
const upload = require(current + '/art/V6MeshUploadParts');
const { V6WorldPreparation } = require(current + '/domain/v6-preparation');
const { createGame, getV6EditSurface } = require(current + '/domain/game');
const p = new V6WorldPreparation(42173);
while (p.progress.status === 'building') p.step(64);
p.takeResult();
const state = createGame(60000, 42173, 6),
  source = getV6EditSurface(state),
  originalSave = JSON.stringify(state);
const trees = state.trees
  .filter((t) => Math.floor(t.x / 16) === 7 && Math.floor(t.z / 16) === 3)
  .map((t) => ({ id: t.id, x: t.x, z: t.z, stage: 3 }));
const height = (x, z) => source.heightInCell(x, z, Math.floor(x), Math.floor(z));
const report = {
  scope:
    'Node CPU tree-batch construction only; not GPU, browser, phone, FPS or whole-region loading time.',
  baseline:
    '697948f tree-cache checkpoint, based on delivered b8a8f7f plus libfile_2753def6b3988191b464f79a067996ba',
  seed: 42173,
  chunk: '7:3',
  trees: trees.length,
  node: process.version,
  method:
    'Both implementations use the same saved trees and real height source. Every sample creates a new batch. Three warmups each, then 21 alternating AB/BA sample pairs, no explicit GC. First full batch, including template setup and transforms, is recorded once outside steady-state samples; no tree-batch cache is involved.',
  cases: [],
};
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
function build(Builder, data, far) {
  const start = performance.now();
  const b = new Builder(42173, data, far, height);
  while (!b.complete) b.append();
  const batch = b.finish();
  return { ms: performance.now() - start, batch };
}
for (const [name, data, far] of [
  ['mature_near', trees, false],
  ['mature_far', trees, true],
  ['mixed_growth_near', trees.map((t, i) => ({ ...t, stage: i % 4 })), false],
]) {
  const setup = implementations.map((Builder) => build(Builder, data, far));
  const expected = fingerprint(setup[0].batch, upload);
  assert.deepEqual(fingerprint(setup[1].batch, upload), expected);
  for (let warm = 0; warm < 3; warm++)
    for (const Builder of implementations) build(Builder, data, far);
  const timings = [[], []];
  let last;
  for (let pair = 0; pair < 21; pair++)
    for (const i of pair % 2 ? [1, 0] : [0, 1]) {
      const result = build(implementations[i], data, far);
      timings[i].push(result.ms);
      last = result.batch;
    }
  assert.deepEqual(fingerprint(last, upload), expected);
  report.cases.push({
    name,
    firstBatchMsIncludingTemplateSetup: setup.map((r) => r.ms),
    before: { medianMs: median(timings[0]), samplesMs: timings[0] },
    after: { medianMs: median(timings[1]), samplesMs: timings[1] },
    eliminatedTemporaryVertexArrays: expected.vertices,
    geometryAndPicking: expected,
  });
}
assert.equal(JSON.stringify(state), originalSave);
report.savedStateUnchanged = true;
const output =
  process.env.V6_TREE_COLD_OUTPUT || path.join(__dirname, '../build/v6-tree-cold.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (process.env.V6_TREE_COLD_GOLDENS) {
  const golden = { source: 'Unmodified checkpoint 697948f builder', cases: [] };
  for (const [name, data, far] of [
    ['dense_near', trees, false],
    ['dense_far', trees, true],
    ['mixed_growth', trees.map((t, i) => ({ ...t, stage: i % 4 })), false],
    ['empty', [], false],
  ]) {
    const b = build(implementations[0], data, far).batch;
    golden.cases.push({
      name,
      seed: 42173,
      trees: data,
      far,
      heights: b.anchors.map((a) => a.y),
      expected: fingerprint(b, upload),
    });
  }
  for (const seed of [1, 1937, 2147483647])
    for (const far of [false, true]) {
      const data = Array.from({ length: 16 }, (_, i) => ({
        id: `fixture-${i}`,
        x: i === 0 ? -0 : i * 11,
        z: i % 3 === 0 ? 0 : i * 7,
        stage: i % 4,
      }));
      const b = new implementations[0](seed, data, far, (x, z) =>
        Math.fround(0.015 + x * 0.071 - z * 0.053),
      );
      while (!b.complete) b.append();
      const batch = b.finish();
      golden.cases.push({
        name: `synthetic-${seed}-${far}`,
        seed,
        trees: data,
        far,
        heights: batch.anchors.map((a) => a.y),
        expected: fingerprint(batch, upload),
      });
    }
  fs.writeFileSync(process.env.V6_TREE_COLD_GOLDENS, JSON.stringify(golden, null, 2) + '\n');
}
