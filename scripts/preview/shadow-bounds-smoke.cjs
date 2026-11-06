/** Official Cocos mesh/model bounds and shadow-culling test. No shader or GPU rendering. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const ts = require('typescript');

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

  const sourceFile = path.join(out, 'shadow-bounds-source.cjs');
  await dependency('esbuild').build({
    stdin: {
      contents: `export { worldMesh } from './assets/scripts/presentation/WorldMesh'; export { worldShadows } from './assets/scripts/presentation/WorldMaterial'; export { ASSETS } from './assets/scripts/art/AssetCatalog'; export { compileAsset } from './assets/scripts/art/MeshCompiler'; export { splitMesh16 } from './assets/scripts/art/MeshChunks'; export { ContinuousResources } from './assets/scripts/art/ContinuousResources'; export { buildContinuousCoast } from './assets/scripts/art/ContinuousCoast'; export { createGame, terrainAt, isLandCell } from './assets/scripts/domain/game';`,
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
  const app = require(sourceFile);

  // Transpile the complete, unmodified pinned engine module. Resolve its imports
  // to the SAME actual compiled Cocos classes/enums; do not reimplement culling.
  const cullingPath = path.join(engine, 'cocos/rendering/scene-culling.ts');
  const cullingSource = fs.readFileSync(cullingPath, 'utf8');
  const cullingCode = ts.transpileModule(cullingSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const engineImports = {
    '../core': cc,
    '../core/geometry': cc.geometry,
    '../render-scene/scene/camera': cc.renderer.scene,
    '../render-scene/scene/shadows': cc.renderer.scene,
    './define': cc.pipeline,
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', cullingCode)(
    (id) => {
      assert.ok(engineImports[id], `Unmapped official culling dependency: ${id}`);
      return engineImports[id];
    },
    module,
    module.exports,
  );
  const { shadowCulling } = module.exports;
  assert.equal(typeof shadowCulling, 'function');
  const layerObjects = new cc.CachedArray(32);
  const camera = {
    visibility: cc.Layers.Enum.DEFAULT,
    scene: {
      mainLight: {
        csmLevel: 1,
        csmOptimizationMode: cc.renderer.scene.CSMOptimizationMode.RemoveDuplicates,
      },
    },
  };
  const sceneData = { csmLayers: { layerObjects } };
  const layer = { level: 0, validFrustum: new cc.geometry.Frustum(), shadowObjects: [] };
  layer.validFrustum.accurate = true;
  cc.geometry.Frustum.createFromAABB(
    layer.validFrustum,
    new cc.geometry.AABB(100, 0, 100, 300, 100, 300),
  );
  const included = (model) => {
    layerObjects.clear();
    layerObjects.push({ model, depth: 0 });
    shadowCulling(camera, sceneData, layer);
    return layer.shadowObjects.some((entry) => entry.model === model);
  };

  // Exercise the real MeshRenderer geometry-change path without inventing a GPU
  // shader/material. Its bound update is exactly the path used after mesh assignment.
  function attach(mesh, name) {
    const node = new cc.Node(name);
    node.active = false;
    node.setPosition(8, 3, 5);
    node.setRotationFromEuler(0, 35, 0);
    node.setScale(0.7, 1.2, 0.9);
    const component = node.addComponent(cc.MeshRenderer);
    const model = new cc.renderer.scene.Model();
    model.initialize();
    model.node = model.transform = node;
    component._mesh = mesh;
    component._model = model;
    component.onGeometryChanged();
    app.worldShadows(component);
    assert.equal(model.castShadow, true);
    return { node, component, model, mesh };
  }
  function release(fixture) {
    fixture.component._model = null;
    fixture.component._mesh = null;
    fixture.model.destroy();
    fixture.mesh.destroy();
    fixture.node.destroy();
  }
  let batches = 0,
    checkedVertices = 0;
  function verify(data, name) {
    const mesh = app.worldMesh(data);
    assert.deepEqual([mesh.minPosition.x, mesh.minPosition.y, mesh.minPosition.z], data.min, name);
    assert.deepEqual([mesh.maxPosition.x, mesh.maxPosition.y, mesh.maxPosition.z], data.max, name);
    const fixture = attach(mesh, name);
    const bounds = fixture.model.worldBounds;
    assert.ok(bounds, `${name}: real Model.worldBounds must exist`);
    const point = new cc.Vec3();
    for (let i = 0; i < data.positions.length; i += 3) {
      point.set(data.positions[i], data.positions[i + 1], data.positions[i + 2]);
      cc.Vec3.transformMat4(point, point, fixture.node.worldMatrix);
      for (const axis of ['x', 'y', 'z'])
        assert.ok(
          Math.abs(point[axis] - bounds.center[axis]) <= bounds.halfExtents[axis] + 1e-4,
          `${name}: transformed ${axis} outside world bounds`,
        );
      checkedVertices++;
    }
    assert.equal(
      included(fixture.model),
      true,
      `${name}: official shadowCulling must retain the caster`,
    );
    batches++;
    release(fixture);
  }

  // Each palette/wood batch gets its own compiled local bounds, not its sibling's.
  for (const recipe of Object.values(app.ASSETS)) {
    const hasWood = recipe.parts.some((part) => part.texture === 'warm-wood');
    for (const textured of hasWood ? [false, true] : [false]) {
      const data = app.compileAsset(
        hasWood
          ? { ...recipe, parts: recipe.parts.filter((part) => Boolean(part.texture) === textured) }
          : recipe,
      );
      if (data.indices.length) verify(data, `${recipe.id}/${textured ? 'wood' : 'palette'}`);
    }
  }
  const catalogBatches = batches;
  const state = app.createGame(0, 42173, 4);
  const field = new app.ContinuousResources(192, 42173, (x, z) => app.terrainAt(x, z, 42173, 4));
  const cut = field.sync(
    state.naturalResources.filter((resource) => (resource.x + resource.z) % 2),
  ).mesh;
  const coast = app.buildContinuousCoast(192, 42173, (x, z) => app.isLandCell(x, z, 42173, 4)).mesh;
  const terrainChunks = app.splitMesh16(cut),
    coastChunks = app.splitMesh16(coast);
  assert.ok(terrainChunks.length > 1, 'Exercise the real multi-chunk cut terrain');
  for (const [name, chunks] of [
    ['cut-terrain', terrainChunks],
    ['coast', coastChunks],
  ])
    chunks.forEach((chunk, index) => verify(chunk, `${name}/${index}`));

  const house = app.compileAsset(app.ASSETS.house);
  const unbounded = attach(
    cc.utils.createMesh({
      positions: house.positions,
      normals: house.normals,
      indices: house.indices,
    }),
    'OldMissingBoundsRegression',
  );
  assert.equal(unbounded.model.worldBounds, null);
  assert.equal(
    included(unbounded.model),
    false,
    'Negative control reproduces the original invisible-to-shadow-culling defect',
  );
  release(unbounded);
  const moving = attach(app.worldMesh(house), 'MovingHouse');
  assert.equal(included(moving.model), true);
  moving.node.setPosition(2000, 0, 2000);
  moving.model.updateWorldBound();
  assert.equal(included(moving.model), false, 'Out-of-frustum casters are still rejected');
  moving.node.setPosition(12, 7, 14);
  moving.node.setRotationFromEuler(0, 90, 0);
  moving.node.setScale(1.4, 0.8, 1.4);
  moving.model.updateWorldBound();
  assert.equal(
    included(moving.model),
    true,
    'Moving/rotating/scaling restores the caster in range',
  );
  moving.component.shadowCastingMode = cc.MeshRenderer.ShadowCastingMode.OFF;
  assert.equal(included(moving.model), false);
  moving.component.shadowCastingMode = cc.MeshRenderer.ShadowCastingMode.ON;
  moving.node.layer = 1 << 18;
  assert.equal(
    included(moving.model),
    false,
    'Isolated handbook layer does not enter the world shadow map',
  );
  release(moving);
  layerObjects.destroy();
  cc.CCObject._deferredDestroy();
  cc.gfx.deviceManager.gfxDevice.destroy();
  dom.window.close();
  const result = {
    passed: true,
    mode: 'Official Cocos 3.8.8 CPU/EmptyDevice mesh bounds, real Model/MeshRenderer bounds propagation and unmodified shadowCulling; no shader execution or GPU pixels',
    revision,
    officialCullingSha256: createHash('sha256').update(cullingSource).digest('hex'),
    catalogBatches,
    terrainChunks: terrainChunks.length,
    coastChunks: coastChunks.length,
    checkedVertices,
    missingBoundsNegativeControl: true,
    movedRotatedScaledCaster: true,
    canvasCapabilityDiagnostics: canvasDiagnostics,
  };
  fs.writeFileSync(
    path.join(root, 'build/shadow-bounds-smoke.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
