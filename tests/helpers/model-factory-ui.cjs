/** Production building assembly, canonical CPU triangles and real triangle picking. No GPU evidence. */
const fs = require('node:fs'),
  ts = require('typescript');
const { compileAsset } = require('../../.domain-build/art/MeshCompiler');
const { ASSETS } = require('../../.domain-build/art/AssetCatalog');
const { Node: ResourceNode, ModelPicking, worldSurface } = require('./resource-picking-ui.cjs');
function mesh(data) {
  return {
    data,
    struct: { primitives: [{ primitiveMode: 4 }] },
    readAttribute: () => data.positions,
    readIndices: () => data.indices,
    destroy() {
      this.destroyed = true;
    },
  };
}
class Renderer {
  enabled = true;
  setMaterial(_slot, material) {
    this.material = material;
  }
}
class Node extends ResourceNode {
  addComponent(Type) {
    const c = new Type();
    c.node = this;
    if (c instanceof Renderer) this.renderers.push(c);
    else (this.components ??= []).push(c);
    return c;
  }
}
class Assets {
  meshes = new Map();
  create(id, name) {
    return this.createRecipe(ASSETS[id], name);
  }
  createRecipe(recipe, name) {
    if (!this.meshes.has(recipe.id)) this.meshes.set(recipe.id, mesh(compileAsset(recipe)));
    const node = new Node(name);
    let target = node;
    if (recipe.id === 'v5-pier-foot-unit') {
      target = new Node('GeneratedWoodMaterial');
      node.addChild(target);
    }
    const renderer = target.addComponent(Renderer);
    renderer.mesh = this.meshes.get(recipe.id);
    return node;
  }
  createTransient(data, name) {
    const node = new Node(name);
    const renderer = node.addComponent(Renderer);
    renderer.mesh = mesh(data);
    return node;
  }
  dispose() {
    for (const m of this.meshes.values()) m.destroy();
  }
}
function factory(overrides = {}) {
  const m = { exports: {} },
    code = ts.transpileModule(
      fs.readFileSync('assets/scripts/presentation/ModelFactory.ts', 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
    ).outputText;
  const box = () =>
    compileAsset({
      id: 'unit-box',
      footprint: [1, 1],
      parts: [
        { name: 'box', shape: 'box', position: [0, 0, 0], size: [1, 1, 1], color: '#FFFFFF' },
      ],
    });
  const deps = {
    cc: { Node, MeshRenderer: Renderer, primitives: { box }, utils: { createMesh: mesh } },
    './AssetRenderer': { AssetRenderer: Assets },
    './WorldMaterial': {
      worldShadows() {},
      worldMaterial: () => ({ setProperty() {}, destroy() {} }),
    },
    './Palette': { color: (v) => v },
    './CropMotion': {},
    ...overrides,
  };
  new Function('require', 'module', 'exports', code)(
    (id) => deps[id] ?? require('../../.domain-build/' + id.slice(3)),
    m,
    m.exports,
  );
  return new m.exports.ModelFactory();
}

module.exports = { factory, Node, ModelPicking, worldSurface };
