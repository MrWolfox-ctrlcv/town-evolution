/** Real Cocos CPU/EmptyDevice water and large static-index test. No WebGL rendering. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '../..');
const engine = path.resolve(process.env.COCOS_ENGINE || path.join(root, 'temp/cocos-engine'));
const out = path.join(root, 'build/continuous-headless');
const revision = '411f98df047c25902f93440d4b22925c2fb65461';
const dependency = (name) => require(path.join(engine, 'node_modules', name));

async function main() {
  assert.equal(
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: engine, encoding: 'utf8' }).trim(),
    revision,
  );
  fs.mkdirSync(out, { recursive: true });
  const engineFile = path.join(out, 'cc.js');
  const stamp = path.join(out, 'revision.txt');
  if (
    !fs.existsSync(engineFile) ||
    !fs.existsSync(stamp) ||
    fs.readFileSync(stamp, 'utf8') !== revision
  ) {
    execFileSync(process.execPath, ['scripts/build-debug-infos.js'], {
      cwd: engine,
      stdio: 'inherit',
    });
    const result = await dependency('@cocos/ccbuild').buildEngine({
      engine,
      moduleFormat: 'cjs',
      mode: 'BUILD',
      platform: 'HTML5',
      out,
      features: ['base', 'gfx-empty', '3d', 'primitive', 'legacy-pipeline'],
      compress: false,
      sourceMap: false,
      flags: { DEBUG: true },
    });
    assert.equal(result.hasCriticalWarns, false);
    fs.writeFileSync(stamp, revision);
  }

  const jsdomRequire = createRequire(
    path.join(engine, 'node_modules/jest-environment-jsdom/package.json'),
  );
  const { JSDOM, VirtualConsole } = jsdomRequire('jsdom');
  const virtualConsole = new VirtualConsole();
  const canvasDiagnostics = [];
  virtualConsole.sendTo(console, { omitJSDOMErrors: true });
  virtualConsole.on('jsdomError', (error) => {
    // Cocos probes canvas support during import. Do not replace those browser APIs.
    if (/Not implemented: HTMLCanvasElement.prototype.(getContext|toDataURL)/.test(error.message))
      canvasDiagnostics.push(error.message);
    else throw error;
  });
  const dom = new JSDOM('<!doctype html><canvas id="GameCanvas"></canvas>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    virtualConsole,
  });
  for (const name of [
    'window',
    'document',
    'navigator',
    'location',
    'screen',
    'HTMLElement',
    'HTMLCanvasElement',
    'HTMLImageElement',
    'Image',
    'XMLHttpRequest',
    'localStorage',
  ]) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: name === 'window' ? dom.window : dom.window[name],
    });
  }
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
  const cc = require(engineFile);
  cc.settings.overrideSettings('rendering', 'renderMode', cc.gfx.LegacyRenderMode.HEADLESS);
  assert.equal(
    await cc.gfx.deviceManager.init(
      document.querySelector('canvas'),
      new cc.gfx.BindingMappingInfo(),
    ),
    true,
  );
  assert.ok(cc.gfx.deviceManager.gfxDevice instanceof cc.EmptyDevice);

  // Bundle the current production sources, resolving only cc to the real engine.
  const sourceFile = path.join(out, 'water-source.cjs');
  await dependency('esbuild').build({
    stdin: {
      contents: `export { CoastalWaterMotion } from './assets/scripts/presentation/CoastalWaterMotion'; export { buildCoastalWater, coastalWaveHeight } from './assets/scripts/art/CoastalWater'; export { splitMesh16 } from './assets/scripts/art/MeshChunks'; export { ContinuousResources } from './assets/scripts/art/ContinuousResources'; export { buildContinuousCoast } from './assets/scripts/art/ContinuousCoast'; export { createGame, terrainAt, isLandCell } from './assets/scripts/domain/game';`,
      resolveDir: root,
      loader: 'ts',
    },
    outfile: sourceFile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'es2020',
    alias: { cc: engineFile },
    external: [engineFile],
    tsconfigRaw: {
      compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false },
    },
  });
  const {
    CoastalWaterMotion,
    buildCoastalWater,
    coastalWaveHeight,
    splitMesh16,
    ContinuousResources,
    buildContinuousCoast,
    createGame,
    terrainAt,
    isLandCell,
  } = require(sourceFile);
  const seed = 42173;
  const data = buildCoastalWater(40, seed, []);
  const input = JSON.stringify(data);
  assert.equal(data.positions.length / 3, 6561);
  assert.equal(data.indices.length, 38400);
  const undersizedMesh = new cc.Mesh();
  assert.throws(
    () =>
      cc.utils.MeshUtils.createDynamicMesh(
        0,
        {
          positions: new Float32Array(data.positions),
          colors: new Float32Array(data.colors),
          indices16: new Uint16Array(data.indices),
        },
        undersizedMesh,
      ),
    /length|vertices|indices|bounds|offset/i,
    'Default engine capacities must reject map-size water',
  );
  undersizedMesh.destroy();

  const node = new cc.Node('HeadlessWaterSmoke');
  node.active = false;
  const renderer = node.addComponent(cc.MeshRenderer);
  const motion = node.addComponent(CoastalWaterMotion);
  motion.configure(renderer, data, seed);
  const firstMesh = renderer.mesh;
  assert.ok(firstMesh instanceof cc.Mesh);
  assert.deepEqual(firstMesh.struct.dynamic.info, {
    maxSubMeshes: 1,
    maxSubMeshVertices: 6561,
    maxSubMeshIndices: 38400,
  });
  function uploadedPositions(mesh) {
    const view = mesh.struct.vertexBundles[0].view;
    return new Float32Array(mesh.data.buffer, mesh.data.byteOffset + view.offset, view.count * 3);
  }
  function verifyUpload(mesh) {
    assert.deepEqual(uploadedPositions(mesh), motion.positions);
    const colorView = mesh.struct.vertexBundles[1].view;
    assert.deepEqual(
      new Float32Array(
        mesh.data.buffer,
        mesh.data.byteOffset + colorView.offset,
        colorView.count * 4,
      ),
      motion.colors,
    );
    const indexView = mesh.struct.primitives[0].indexView;
    assert.deepEqual(
      new Uint16Array(mesh.data.buffer, mesh.data.byteOffset + indexView.offset, indexView.count),
      motion.indices,
    );
    const draw = mesh.renderingSubMeshes[0].drawInfo;
    assert.equal(draw.vertexCount, motion.positions.length / 3);
    assert.equal(draw.indexCount, motion.indices.length);
    assert.ok([...uploadedPositions(mesh)].every(Number.isFinite));
  }
  verifyUpload(firstMesh);
  const initial = uploadedPositions(firstMesh).slice();
  motion.update(0.01);
  assert.deepEqual(uploadedPositions(firstMesh), initial);
  motion.update(0.04);
  assert.notDeepEqual(uploadedPositions(firstMesh), initial);
  for (let i = 0; i < 100; i++) motion.update(0.05);
  verifyUpload(firstMesh);
  const continued = uploadedPositions(firstMesh).slice();
  for (const dt of [NaN, Infinity, -1, 0]) motion.update(dt);
  assert.deepEqual(uploadedPositions(firstMesh), continued);
  motion.configure(renderer, data, seed);
  assert.notEqual(renderer.mesh, firstMesh);
  assert.equal(cc.isValid(firstMesh, true), false);
  assert.equal(firstMesh._renderingSubMeshes, null);
  assert.deepEqual(
    uploadedPositions(renderer.mesh),
    continued,
    'Reconfigure must preserve wave phase',
  );
  assert.equal(
    uploadedPositions(renderer.mesh)[1],
    Math.fround(coastalWaveHeight(data.positions[0], data.positions[2], seed, motion.time)),
  );
  verifyUpload(renderer.mesh);
  const finalMesh = renderer.mesh;
  motion.onDestroy();
  assert.equal(renderer.mesh, null);
  assert.equal(motion.mesh, null);
  assert.equal(cc.isValid(finalMesh, true), false);
  assert.equal(finalMesh._renderingSubMeshes, null);
  motion.onDestroy();
  motion.update(0.05);
  assert.equal(JSON.stringify(data), input, 'Production animation must not mutate source mesh');
  assert.ok(firstMesh !== finalMesh);
  // Real large-world buffer uploads, including states that exceed a single uint16 mesh.
  const state = createGame(0, seed);
  const largeCoast = buildContinuousCoast(192, seed, (x, z) => isLandCell(x, z, seed, 4));
  const largeWater = buildCoastalWater(192, seed, largeCoast.waterlines);
  motion.configure(renderer, largeWater, seed);
  verifyUpload(renderer.mesh);
  motion.update(0.05);
  verifyUpload(renderer.mesh);
  const largeWaterVertices = motion.positions.length / 3;
  assert.ok(largeWaterVertices > 30000 && largeWaterVertices <= 65535);
  motion.onDestroy();
  const field = new ContinuousResources(192, seed, (x, z) => terrainAt(x, z, seed, 4));
  const excavated = field.sync(state.naturalResources.filter((r) => (r.x + r.z) % 2));
  const chunks = splitMesh16(excavated.mesh);
  assert.ok(chunks.length > 1);
  let uploadedIndices = 0;
  for (const chunk of chunks) {
    const mesh = cc.utils.createMesh({
      positions: chunk.positions,
      normals: chunk.normals,
      colors: chunk.colors,
      indices: chunk.indices,
    });
    assert.deepEqual(mesh.readIndices(0), new Uint16Array(chunk.indices));
    assert.deepEqual(
      mesh.readAttribute(0, cc.gfx.AttributeName.ATTR_POSITION),
      new Float32Array(chunk.positions),
    );
    assert.equal(mesh.struct.primitives[0].indexView.stride, 2);
    assert.ok(chunk.positions.length / 3 <= 65535);
    uploadedIndices += mesh.readIndices(0).length;
    mesh.destroy();
  }
  assert.equal(uploadedIndices, excavated.mesh.indices.length);
  node.destroy();
  cc.CCObject._deferredDestroy();
  assert.equal(cc.isValid(firstMesh), false);
  assert.equal(cc.isValid(finalMesh), false);
  cc.gfx.deviceManager.gfxDevice.destroy();
  dom.window.close();
  console.log(
    JSON.stringify(
      {
        passed: true,
        mode: 'Real Cocos 3.8.8 CPU mesh with official EmptyDevice; no WebGL validation',
        revision,
        vertices: 6561,
        indices: 38400,
        updates: 102,
        largeWaterVertices,
        excavatedVertices: excavated.mesh.positions.length / 3,
        staticChunks: chunks.length,
        staticIndicesVerified: uploadedIndices,
        defaultCapacityRejected: true,
        phasePreserved: true,
        disposalIdempotent: true,
        canvasCapabilityDiagnostics: canvasDiagnostics,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
