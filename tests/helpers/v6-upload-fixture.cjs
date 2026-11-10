const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
module.exports = function uploader(
  build = path.join(__dirname, '../../.domain-build'),
  sourceFile = path.join(__dirname, '../../assets/scripts/presentation/V6ChunkMeshes.ts'),
) {
  const calls = [],
    nodes = [],
    meshes = [];
  let failAt = Infinity;
  class Node {
    active = true;
    layer = 1;
    children = [];
    constructor(name) {
      this.name = name;
      nodes.push(this);
    }
    addChild(node) {
      this.children.push(node);
      node.parent = this;
    }
    addComponent() {
      return { setMaterial() {} };
    }
    removeFromParent() {
      if (this.parent) this.parent.children = this.parent.children.filter((n) => n !== this);
    }
    destroy() {
      this.destroyed = (this.destroyed || 0) + 1;
    }
  }
  const code = ts.transpileModule(fs.readFileSync(sourceFile, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id === 'cc') return { Node, MeshRenderer: class {} };
      if (id === '../art/V6RenderBatches') return require(path.join(build, 'art/V6RenderBatches'));
      if (id === '../art/V6MeshUploadParts')
        return require(path.join(build, 'art/V6MeshUploadParts'));
      if (id === './WorldMaterial') return { worldShadows() {} };
      if (id === './WorldMesh')
        return {
          worldMesh(data) {
            if (calls.length === failAt) throw Error('simulated upload failure');
            calls.push(data);
            const value = {
              destroy() {
                this.destroyed = (this.destroyed || 0) + 1;
              },
            };
            meshes.push(value);
            return value;
          },
        };
      throw Error(id);
    },
    module,
    module.exports,
  );
  const parent = new Node('root');
  return {
    uploads: new module.exports.V6ChunkMeshes(parent, {}),
    calls,
    nodes,
    meshes,
    parent,
    failOn(n) {
      failAt = n;
    },
  };
};
