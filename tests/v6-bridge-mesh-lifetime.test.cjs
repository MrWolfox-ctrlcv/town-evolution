const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  ts = require('typescript');
test('terrain-dependent bridge meshes are instance-owned and released exactly when their model is destroyed', () => {
  const meshes = [],
    materialUses = [];
  let released = 0;
  const woodMaterial = { name: 'wood' };
  class Node {
    static EventType = { NODE_DESTROYED: 'node-destroyed' };
    constructor(name) {
      this.name = name;
      this.events = new Map();
    }
    addChild() {}
    addComponent(T) {
      return new T();
    }
    on(name, fn) {
      this.events.set(name, [...(this.events.get(name) ?? []), fn]);
    }
    destroy() {
      for (const fn of this.events.get('node-destroyed') ?? []) fn();
    }
  }
  class MeshRenderer {
    setSharedMaterial(material) {
      materialUses.push(material);
    }
  }
  const deps = {
    cc: { Node, MeshRenderer },
    './WorldMaterial': { worldMaterial: () => ({ destroy() {} }), worldShadows() {} },
    './WorldMesh': {
      worldMesh: () => {
        const mesh = {
          destroyed: 0,
          destroy() {
            this.destroyed++;
          },
        };
        meshes.push(mesh);
        return mesh;
      },
    },
    './BuildingTexture': {
      acquireBuildingTexture: () => ({
        value: { material: woodMaterial },
        release() {
          released++;
        },
      }),
    },
    '../art/AssetCatalog': { ASSETS: {} },
    '../art/MeshCompiler': {},
  };
  const code = ts.transpileModule(
    fs.readFileSync('assets/scripts/presentation/AssetRenderer.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => {
      assert.ok(deps[id], id);
      return deps[id];
    },
    m,
    m.exports,
  );
  const renderer = new m.exports.AssetRenderer(),
    data = { indices: [0, 1, 2, 3, 4, 5], texturedIndices: [3, 4, 5] },
    a = renderer.createTransient(data, 'a'),
    b = renderer.createTransient(data, 'b');
  assert.equal(renderer.meshes.size, 0);
  assert.equal(materialUses.filter((m) => m === woodMaterial).length, 2);
  a.destroy();
  assert.deepEqual(
    meshes.map((m) => m.destroyed),
    [1, 1, 0, 0],
  );
  b.destroy();
  renderer.dispose();
  assert.equal(released, 1);
  assert.throws(() => renderer.createTransient(data, 'late'), /disposal/);
  assert.deepEqual(
    meshes.map((m) => m.destroyed),
    [1, 1, 1, 1],
  );
});
