const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const uploader = require('./v6-upload-fixture.cjs');
const build = path.resolve(__dirname, '../../.domain-build');
const { V6SurfaceChunks, v6ChunkKey } = require(build + '/art/V6SurfaceChunks');
function presentation(name, overrides = {}) {
  const code = ts.transpileModule(
    fs.readFileSync(
      path.resolve(__dirname, '../../assets/scripts/presentation', name + '.ts'),
      'utf8',
    ),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    },
  ).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id in overrides) return overrides[id];
      if (id.startsWith('../')) return require(path.join(build, id.slice(3)));
      return {};
    },
    module,
    module.exports,
  );
  return module.exports;
}
function fixture(trees, visibleKeys = ['8,7']) {
  const pools = [],
    first = uploader();
  const ground = Object.create(V6SurfaceChunks.prototype);
  Object.assign(ground, {
    live: new Map(visibleKeys.map((k) => [k, { detail: true }])),
    coastDirty: new Set(),
    dirty: new Set(),
    lodDirty: new Set(),
  });
  const controls = { maxUploadBytes: 262144, anchorsAllowed: true };
  class Uploads {
    constructor() {
      const gpu = pools.length ? uploader() : first;
      pools.push(gpu);
      const advance = gpu.uploads.advance.bind(gpu.uploads);
      gpu.uploads.advance = (bytes) => advance(Math.min(bytes, controls.maxUploadBytes), Infinity);
      return gpu.uploads;
    }
  }
  const { V6TreeView } = presentation('V6TreeView', {
    cc: { Node: first.parent.constructor },
    './V6ChunkMeshes': { V6ChunkMeshes: Uploads },
    './WorldMaterial': { worldMaterial: () => ({ destroy() {} }) },
    './TouchPicking': { nearProjectedBounds: () => true },
  });
  const visible = (x, z) =>
    ground.visible(x, z) && (controls.anchorsAllowed || (x % 16 === 8 && z % 16 === 8));
  const view = new V6TreeView(
    first.parent,
    (x, z) => ground.ready(x, z),
    () => 7.015,
    visible,
  );
  const state = { mapSeed: 42173, lastSeenAt: 100, trees };
  view.sync(state, 100);
  const bounds = { minX: 130, minZ: 32, maxX: 142, maxZ: 128 };
  const frame = (budget = {}) =>
    view.stream.frame(
      bounds,
      { maxTrees: 24, maxMilliseconds: Infinity, maxUploadBytes: 262144, lodSpan: 30, ...budget },
      () => 0,
    );
  function settle(limit = 100) {
    for (let i = 0; i < limit; i++) {
      frame();
      if (!view.loading) return;
    }
    throw Error('Tree view did not settle');
  }
  return { view, ground, controls, pools, state, bounds, frame, settle, v6ChunkKey };
}
module.exports = { fixture, presentation };
