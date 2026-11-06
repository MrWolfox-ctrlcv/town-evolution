/** CPU scene transforms and canonical meshes; production resource/triangle pickers, no GPU. */
const { load, Node: BaseNode } = require('./farm-picking-ui.cjs');
const { ASSETS } = require('../../.domain-build/art/AssetCatalog');
const { compileAsset } = require('../../.domain-build/art/MeshCompiler');
const { MeshSurface } = require('../../.domain-build/application/MeshSurface');
const touch = load('TouchPicking');
const { ModelPicking } = load('ModelPicking', { './TouchPicking': touch });
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
function multiply(a, b) {
  return [0, 4, 8].flatMap((row) => [
    ...[0, 1, 2].map((column) =>
      [0, 1, 2].reduce((sum, k) => sum + a[row + k] * b[k * 4 + column], 0),
    ),
    a[row + 3] + [0, 1, 2].reduce((sum, k) => sum + a[row + k] * b[k * 4 + 3], 0),
  ]);
}
class Node extends BaseNode {
  position = [0, 0, 0];
  scale = [1, 1, 1];
  rotation = [0, 0, 0];
  setPosition(...value) {
    this.position = value;
  }
  setScale(...value) {
    this.scale = value;
  }
  setRotationFromEuler(...value) {
    this.rotation = value;
  }
  getWorldMatrix(out) {
    const [sx, sy, sz] = this.scale,
      [tx, ty, tz] = this.position,
      angle = (this.rotation[1] * Math.PI) / 180,
      c = Math.cos(angle),
      s = Math.sin(angle);
    const local = [sx * c, 0, sz * s, tx, 0, sy, 0, ty, -sx * s, 0, sz * c, tz];
    const parent = { affine: identity() };
    this.parent?.getWorldMatrix(parent);
    out.affine = multiply(parent.affine, local);
    return out;
  }
  destroy() {
    this.active = false;
    this.destroyed = true;
    if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this);
  }
}
class Factory {
  meshes = new Map();
  calls = 0;
  reads = 0;
  asset(id, name = id) {
    this.calls++;
    const node = new Node(name);
    node.asset = id;
    const recipe = ASSETS[id];
    const hasWood = recipe.parts.some((part) => part.texture === 'warm-wood');
    for (const textured of hasWood ? [false, true] : [false]) {
      const key = `${id}/${textured}`;
      let mesh = this.meshes.get(key);
      if (!mesh) {
        const data = compileAsset(
          hasWood
            ? {
                ...recipe,
                parts: recipe.parts.filter((part) => Boolean(part.texture) === textured),
              }
            : recipe,
        );
        if (!data.indices.length) continue;
        mesh = {
          struct: { primitives: [{ primitiveMode: 4 }] },
          readAttribute: () => {
            this.reads++;
            return data.positions;
          },
          readIndices: () => data.indices,
          data,
        };
        this.meshes.set(key, mesh);
      }
      const target = textured ? new Node('GeneratedWoodMaterial') : node;
      if (textured) node.addChild(target);
      target.renderers.push({ node: target, enabled: true, mesh });
    }
    return node;
  }
  dispose() {}
}
const cc = { Node };
const { pileModel } = load('PileModel', { cc });
const { GroundObjects } = load('GroundObjects', {
  cc,
  './ModelFactory': { ModelFactory: Factory },
  './ModelPicking': { ModelPicking },
  './PileModel': { pileModel },
  './TouchPicking': touch,
});
const { TownObjectPicking } = load('TownObjectPicking', { './TouchPicking': touch });
const { TownView } = load('TownView', { './TownObjectPicking': { TownObjectPicking } });
function fixture(state, surface) {
  const resources = new GroundObjects(new Node('Root'));
  resources.sync(state, surface);
  const town = Object.assign(Object.create(TownView.prototype), {
    resources,
    buildings: new Map(),
    lifted: null,
    previous: state,
  });
  return { resources, town };
}
/** Independent world-vertex oracle verifies the inverse-transform production picker. */
function worldSurface(node) {
  const positions = [],
    indices = [];
  for (const renderer of node.getComponentsInChildren()) {
    const matrix = {};
    renderer.node.getWorldMatrix(matrix);
    const m = matrix.affine,
      data = renderer.mesh.data,
      offset = positions.length / 3;
    for (let i = 0; i < data.positions.length; i += 3) {
      const [x, y, z] = data.positions.slice(i, i + 3);
      positions.push(
        m[0] * x + m[1] * y + m[2] * z + m[3],
        m[4] * x + m[5] * y + m[6] * z + m[7],
        m[8] * x + m[9] * y + m[10] * z + m[11],
      );
    }
    indices.push(...data.indices.map((index) => index + offset));
  }
  return new MeshSurface(positions, indices);
}
module.exports = {
  Node,
  Factory,
  ModelPicking,
  GroundObjects,
  fixture,
  worldSurface,
  pileModel,
  touch,
};
