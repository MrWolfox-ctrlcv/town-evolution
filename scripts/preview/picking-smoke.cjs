/** Actual Cocos CPU mesh buffers, nodes and matrices. No WebGL, scene activation or pointer events. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');
const { ASSETS } = require('../../.domain-build/art/AssetCatalog.js');
const { compileAsset } = require('../../.domain-build/art/MeshCompiler.js');
const { part } = require('../../.domain-build/art/AssetTypes.js');
const engine = path.resolve(process.env.COCOS_ENGINE || 'temp/cocos-engine');
const out = path.resolve(process.env.PREVIEW_OUT || 'build/preview');
const tools = path.resolve(process.env.PREVIEW_TOOLS || engine);
const { JSDOM, VirtualConsole } = require(path.join(tools, 'node_modules/jsdom'));
const { System } = require(path.join(engine, 'node_modules/systemjs/dist/system-node.cjs'));
async function main() {
  const warnings = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (error) => warnings.push(error.message));
  const dom = new JSDOM('<canvas id="GameCanvas"></canvas>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'HTMLCanvasElement',
    'HTMLImageElement',
    'Image',
    'XMLHttpRequest',
    'localStorage',
    'screen',
    'location',
  ])
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  try {
    const cc = await System.import(pathToFileURL(path.join(out, 'engine/cc.js')).href);
    const source = fs.readFileSync('assets/scripts/presentation/ModelPicking.ts', 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    });
    const fixture = { exports: {} };
    new Function('require', 'module', 'exports', outputText)(
      (id) => (id === 'cc' ? cc : require('../../.domain-build/application/MeshSurface.js')),
      fixture,
      fixture.exports,
    );
    const { ModelPicking } = fixture.exports;
    const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
    const root = new cc.Node('Building');
    const visual = new cc.Node('BuildingMesh');
    root.addChild(visual);
    const assets = [];
    for (const textured of [false, true]) {
      const node = new cc.Node(textured ? 'Wood' : 'Palette');
      visual.addChild(node);
      const data = compileAsset({
        ...ASSETS.shop,
        parts: ASSETS.shop.parts.filter((p) => Boolean(p.texture) === textured),
      });
      const mesh = cc.utils.createMesh(data);
      // CPU-only fixture: attach real components, but do not initialize GPU buffers or scene models.
      const renderer = node.addComponent(cc.MeshRenderer);
      renderer._mesh = mesh;
      assets.push({ renderer, node, mesh });
    }
    const activate = (node, active) => {
      node._activeInHierarchy = active;
      for (const child of node.children) activate(child, active);
    };
    activate(root, true);
    const picker = new ModelPicking(root);
    const transformRay = (o, d, node = visual) => {
      const matrix = node.getWorldMatrix(new cc.Mat4());
      const ray = new cc.geometry.Ray();
      cc.Vec3.transformMat4(ray.o, new cc.Vec3(...o), matrix);
      cc.Vec3.transformMat4Normal(ray.d, new cc.Vec3(...d), matrix);
      // Camera world directions are normalized. The inverse must not normalize them again.
      cc.Vec3.normalize(ray.d, ray.d);
      return ray;
    };
    let checked = 0;
    for (const rotation of [0, 90, 180, 270]) {
      root.setPosition(13, 0.3, 19);
      root.setScale(1.12, 0.68, 1.12);
      visual.setRotationFromEuler(0, rotation, 0);
      assert.equal(picker.distance(transformRay([0.85, 0.85, 3], [0, 0, -1])), null);
      assert.equal(picker.distance(transformRay([0.35, 1.7, 3], [0, 0, -1])), null);
      close(picker.distance(transformRay([2, 0.46, -0.08], [-1, 0, 0])), 1.14 * 1.12);
      assert.notEqual(picker.distance(transformRay([-0.25, 5, 0], [0, -1, 0])), null);
      checked += 4;
    }
    // Live transforms, disabled renderer, dragged/hidden parent, and hierarchy attachments.
    visual.setRotationFromEuler(0, 0, 0);
    const ray = transformRay([2, 0.46, -0.08], [-1, 0, 0]);
    const before = picker.distance(ray);
    root.setPosition(30, 0, 30);
    assert.equal(picker.distance(ray), null);
    root.setPosition(13, 0.3, 19);
    close(picker.distance(ray), before);
    activate(root, false);
    assert.equal(picker.distance(ray), null);
    activate(root, true);
    const wood = assets.find((a) => a.node.name === 'Wood');
    wood.renderer._enabled = false;
    assert.ok(picker.distance(ray) > before, 'disabled counter no longer intercepts the wall');
    wood.renderer._enabled = true;
    close(picker.distance(ray), before);
    activate(root, false);
    const material = new cc.Node('AttachedMaterials');
    root.addChild(material);
    const data = compileAsset({
      id: 'attached',
      footprint: [1, 1],
      parts: [part('block', 'box', [2, 0.5, 0], [0.3, 0.3, 0.3], '#FFFFFF')],
    });
    const mesh = cc.utils.createMesh(data);
    const renderer = material.addComponent(cc.MeshRenderer);
    renderer._mesh = mesh;
    activate(root, true);
    const attachedPicker = new ModelPicking(root);
    assert.notEqual(attachedPicker.distance(transformRay([2, 4, 0], [0, -1, 0], root)), null);
    assert.equal(picker.distance(transformRay([2, 4, 0], [0, -1, 0], root)), null);
    // Cache is reused without rereading buffers on repeated pointer samples.
    for (const { mesh } of assets) {
      mesh.readAttribute = () => {
        throw new Error('Repeated CPU vertex copy');
      };
      mesh.readIndices = () => {
        throw new Error('Repeated CPU index copy');
      };
    }
    const start = performance.now();
    for (let i = 0; i < 10000; i++) close(picker.distance(ray), before);
    const elapsedMs = performance.now() - start;
    const result = {
      passed: true,
      rotatedSurfaceChecks: checked,
      repeatQueries: 10000,
      elapsedMs,
      layer: 'actual compiled Cocos CPU buffers/components/matrices; no WebGL or pointer events',
      warnings,
    };
    fs.mkdirSync('build', { recursive: true });
    fs.writeFileSync('build/picking-smoke.json', JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    dom.window.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
