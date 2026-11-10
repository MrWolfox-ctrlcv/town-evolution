const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
  let loads = 0;
  class Material {
    initialize(info) {
      this.info = info;
    }
    setProperty() {}
    destroy() {}
  }
  class Texture2D {
    static PixelFormat = { RGBA8888: 1 };
    reset() {}
    uploadData() {}
    destroy() {}
  }
  class MeshRenderer {
    static ShadowCastingMode = { ON: 1, OFF: 0 };
    static ShadowReceivingMode = { ON: 1 };
    setSharedMaterial(material) {
      this.material = material;
    }
  }
  class Node {
    static EventType = { NODE_DESTROYED: 'destroyed' };
    constructor(name) {
      this.name = name;
      this.children = [];
    }
    addChild(node) {
      this.children.push(node);
    }
    addComponent(Type) {
      return (this.renderer = new Type());
    }
    setPosition(...p) {
      this.position = p;
    }
    setRotationFromEuler(...r) {
      this.rotation = r;
    }
    on() {}
  }
  const cc = {
    Material,
    Node,
    MeshRenderer,
    Texture2D,
    Color: class {},
    ImageAsset: class {},
    assetManager: {
      getBundle: () => ({
        load() {
          loads++;
        },
      }),
    },
  };
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const module = { exports: {} };
    const source = fs.readFileSync(`assets/scripts/presentation/${name}.ts`, 'utf8');
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const requireLocal = (id) => {
      if (id === 'cc') return cc;
      if (id === '../application/SharedResource')
        return require('../.domain-build/application/SharedResource');
      if (id === './WorldMesh') return { worldMesh: (data) => ({ data, destroy() {} }) };
      if (id === '../art/AssetCatalog') return { ASSETS: {} };
      if (id === '../art/MeshCompiler')
        return {
          compileAsset: (recipe) => ({
            indices: recipe.parts.length ? [0, 1, 2] : [],
            parts: recipe.parts,
          }),
        };
      return load(id.slice(2));
    };
    vm.runInNewContext(js, { module, exports: module.exports, require: requireLocal, console });
    cache.set(name, module.exports);
    return module.exports;
  }
  return {
    load,
    get loads() {
      return loads;
    },
  };
}

test('instancing is explicit, defaults off for terrain/tree/water callers and initializes builtin-standard', () => {
  const { worldMaterial } = harness().load('WorldMaterial');
  for (const scope of [undefined, 'standalone', 'repeated-assets']) {
    const material = worldMaterial(true, false, scope);
    assert.equal(material.info.effectName, 'builtin-standard');
    assert.equal(material.info.defines.USE_INSTANCING, scope === 'repeated-assets');
    assert.equal(material.info.defines.USE_VERTEX_COLOR, true);
    assert.equal(material.info.defines.USE_ALBEDO_MAP, false);
  }
});

test('repeated assets share exact mesh/material references, keep palette/wood separate, and retain independent transforms', () => {
  const h = harness();
  const { AssetRenderer } = h.load('AssetRenderer');
  const factory = new AssetRenderer();
  const recipe = { id: 'house', parts: [{ name: 'wall' }, { name: 'roof', texture: 'warm-wood' }] };
  const a = factory.createRecipe(recipe, 'house-a');
  const b = factory.createRecipe(recipe, 'house-b');
  assert.equal(a.renderer.mesh, b.renderer.mesh);
  assert.equal(a.renderer.material, b.renderer.material);
  assert.equal(a.children[0].renderer.mesh, b.children[0].renderer.mesh);
  assert.equal(a.children[0].renderer.material, b.children[0].renderer.material);
  assert.notEqual(a.renderer.mesh, a.children[0].renderer.mesh);
  assert.notEqual(a.renderer.material, a.children[0].renderer.material);
  assert.equal(a.renderer.material.info.defines.USE_ALBEDO_MAP, false);
  assert.equal(a.children[0].renderer.material.info.defines.USE_ALBEDO_MAP, true);
  for (const n of [a, a.children[0]])
    assert.equal(n.renderer.material.info.defines.USE_INSTANCING, true);
  assert.equal(h.loads, 1);
  a.setPosition(4, 2, 7);
  a.setRotationFromEuler(0, 90, 0);
  assert.deepEqual(a.position, [4, 2, 7]);
  assert.deepEqual(a.rotation, [0, 90, 0]);
  assert.equal(b.position, undefined);
  assert.equal(a.renderer.mesh, b.renderer.mesh, 'movement never mutates cached mesh');
  const other = factory.createRecipe({ id: 'box', parts: [{ name: 'wall' }] });
  assert.notEqual(
    other.renderer.mesh,
    a.renderer.mesh,
    'unrelated shapes do not share index buffers',
  );
  factory.dispose();
});

test('standalone rollback does not reuse instanced wood material; each scope keeps reference-counted sharing', () => {
  const h = harness();
  const { acquireBuildingTexture } = h.load('BuildingTexture');
  const a = acquireBuildingTexture('repeated-assets');
  const b = acquireBuildingTexture('repeated-assets');
  const c = acquireBuildingTexture('standalone');
  assert.equal(a.value, b.value);
  assert.notEqual(a.value.material, c.value.material);
  assert.equal(a.value.material.info.defines.USE_INSTANCING, true);
  assert.equal(c.value.material.info.defines.USE_INSTANCING, false);
  assert.equal(h.loads, 2);
  for (const lease of [a, b, c]) lease.release();
});
