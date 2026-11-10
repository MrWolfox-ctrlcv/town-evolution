/** Real domain edits + deterministic upload bytes; Cocos calls are test doubles, not GPU timing. */
const path = require('node:path'),
  { createHash } = require('node:crypto');
const root = process.env.V6_SURFACE_BUILD || path.join(__dirname, '../.domain-build');
const { V6WorldPreparation } = require(root + '/domain/v6-preparation'),
  G = require(root + '/domain/game');
const { V6SurfaceChunks } = require(root + '/art/V6SurfaceChunks'),
  { createV6CoastSource } = require(root + '/art/V6Coast');
const uploader = require('../tests/helpers/v6-upload-fixture.cjs');
const p = new V6WorldPreparation(42173);
while (p.progress.status === 'building') p.step(65536);
p.takeResult();
const initial = G.createGame(60000, 42173, 6);
function geometry(chunks) {
  const h = createHash('sha256');
  for (const [key, chunk] of [...chunks.resident()].sort(([a], [b]) => a.localeCompare(b))) {
    h.update(key);
    for (const attr of ['positions', 'normals', 'colors', 'indices', 'min', 'max'])
      h.update(Buffer.from(new Float64Array(chunk.mesh[attr]).buffer));
    h.update(JSON.stringify(chunk.mesh.triangles));
  }
  return h.digest('hex');
}
const report = {
  scope:
    'Seed 42173, actual domain dig/fill commands and actual upload splitter/uploader with Cocos call doubles. No browser, GPU or phone timing. Inventory seeded only in an isolated fixture.',
  seed: 42173,
  node: process.version,
  scenarios: [],
};
for (const [name, x, z, kinds] of [
  ['interior', 83, 82, ['dig']],
  ['batch-boundary', 88, 88, ['dig']],
  ['chunk-boundary', 95, 88, ['dig']],
  ['repeat-dig-fill', 88, 88, ['dig', 'dig', 'fill', 'fill']],
]) {
  let state = { ...initial, inventory: { ...initial.inventory, soil: 3, stone: 0 } },
    source = G.getV6EditSurface(state);
  const chunks = new V6SurfaceChunks(
      source,
      createV6CoastSource(source.world, state.landExtensions),
    ),
    gpu = uploader(root, process.env.V6_UPLOAD_SOURCE),
    keys = x === 95 ? ['5,5', '6,5'] : ['5,5'];
  chunks.request(keys);
  function settle() {
    let bytes = 0,
      rebuilt = 0,
      uploadCalls = 0;
    while (!chunks.isSettled()) {
      const tx = chunks.advance(100000, Infinity);
      gpu.uploads.retain(chunks.cachedMeshes());
      if (!tx) continue;
      rebuilt += tx.rebuiltCells;
      gpu.uploads.stage(tx.chunks);
      while (true) {
        uploadCalls++;
        const done = gpu.uploads.advance(65536, Infinity);
        bytes += gpu.uploads.lastAdvanceBytes;
        if (done) break;
      }
      tx.commit();
      gpu.uploads.retain(chunks.cachedMeshes());
      gpu.uploads.publish();
    }
    return {
      bytes,
      rebuilt,
      uploadCalls,
      liveNodes: gpu.parent.children.filter((n) => n.active).length,
      accountedResidentBytes: chunks.memoryUsage().resident,
      geometry: geometry(chunks),
    };
  }
  const cold = settle(),
    edits = [];
  for (const kind of kinds) {
    for (const drop of [...state.looseDrops]) {
      const pickup = G.dispatch(
        state,
        { type: 'pickupDrop', dropId: drop.id },
        state.lastSeenAt + 1,
      );
      if (!pickup.ok) throw Error(pickup.error);
      state = pickup.state;
    }
    const level = G.terrain6EditLevel(state, x, z, kind),
      command = {
        type: 'editTerrain6',
        kind,
        x,
        z,
        level,
        expectedOperation: state.terrain6.nextOperation,
        ...(kind === 'fill'
          ? {
              material: 'soil',
              source: { type: 'inventory', item: 'soil', amount: state.inventory.soil },
            }
          : {}),
      };
    const result = G.dispatch(state, command, state.lastSeenAt + 1);
    if (!result.ok) throw Error(result.error);
    state = result.state;
    source = G.getV6EditSurface(state);
    chunks.update(source, [{ x, z }]);
    edits.push({ kind, level, ...settle() });
  }
  chunks.dispose();
  gpu.uploads.dispose();
  if (gpu.parent.children.length || gpu.meshes.some((m) => m.destroyed !== 1))
    throw Error('GPU lifecycle leak');
  report.scenarios.push({ name, x, z, cold, edits });
}
console.log(JSON.stringify(report, null, 2));
