const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { splitMesh16 } = require('../.domain-build/art/MeshChunks');
const { ContinuousResources } = require('../.domain-build/art/ContinuousResources');
const g = require('../.domain-build/domain/game');

function verifyTriangles(source, chunks) {
  let offset = 0;
  for (const chunk of chunks) {
    assert.ok(chunk.positions.length / 3 <= 65535);
    assert.equal(chunk.indices.length % 3, 0);
    for (const index of chunk.indices) {
      assert.ok(index >= 0 && index < 65535);
      const original = source.indices[offset++];
      for (const [name, width] of [
        ['positions', 3],
        ['normals', 3],
        ['colors', 4],
        ['uvs', 2],
      ]) {
        if (!source[name]) continue;
        for (let i = 0; i < width; i++)
          assert.equal(chunk[name][index * width + i], source[name][original * width + i]);
      }
    }
  }
  assert.equal(offset, source.indices.length, 'no triangle is lost, duplicated, or reordered');
}

test('exact 16-bit boundary reuses small meshes and splits larger meshes with all attributes', () => {
  const count = 65538;
  const mesh = {
    positions: Array.from({ length: count * 3 }, (_, i) => i / 11),
    normals: Array.from({ length: count * 3 }, (_, i) => (i % 3 === 1 ? 1 : 0)),
    colors: Array.from({ length: count * 4 }, (_, i) => (i % 4) / 3),
    uvs: Array.from({ length: count * 2 }, (_, i) => (i % 17) / 17),
    indices: Array.from({ length: count }, (_, i) => i),
    min: [0, 0, 0],
    max: [1, 1, 1],
  };
  const chunks = splitMesh16(mesh);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].positions.length / 3, 65535);
  verifyTriangles(mesh, chunks);
  const small = {
    ...mesh,
    positions: mesh.positions.slice(0, 65535 * 3),
    indices: mesh.indices.slice(0, 65535),
  };
  assert.equal(splitMesh16(small)[0], small);
  assert.deepEqual(splitMesh16({ ...mesh, indices: [] }), []);
});

test('legal multi-cell excavation retains exact rendered and picked triangles beyond 65k vertices', () => {
  const state = g.createGame(0, 42173);
  for (const mode of ['first-layer', 'checker-deplete']) {
    const resources = state.naturalResources.flatMap((r) =>
      mode === 'checker-deplete' && (r.x + r.z) % 2 === 0
        ? []
        : [
            {
              ...r,
              amount:
                mode === 'first-layer' && r.kind === 'stone' ? Math.max(1, r.amount - 1) : r.amount,
            },
          ],
    );
    const saved = { ...state, naturalResources: resources };
    assert.deepEqual(g.importSave(g.exportSave(saved), 0), saved);
    const field = new ContinuousResources(192, state.mapSeed, (x, z) =>
      g.terrainAt(x, z, state.mapSeed, 4),
    );
    const result = field.sync(resources);
    assert.ok(result.mesh.positions.length / 3 > 65535, mode);
    assert.equal(result.naturalSurface.positions, result.mesh.positions);
    const chunks = splitMesh16(result.mesh);
    assert.ok(chunks.length > 1 && chunks.length <= 6);
    verifyTriangles(result.mesh, chunks);
    assert.equal(
      result.naturalSurface.positions,
      result.mesh.positions,
      'upload splitting never replaces picking data',
    );
  }
});

test('island uploads every chunk with inherited shadows and releases old mesh/node batches', () => {
  const code = ts.transpileModule(
    fs.readFileSync('assets/scripts/presentation/IslandView.ts', 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    },
  ).outputText;
  const created = [],
    removed = [];
  class Node {
    children = [];
    constructor(name) {
      this.name = name;
    }
    addChild(node) {
      this.children.push(node);
      node.parent = this;
    }
    removeFromParent() {
      this.parent.children = this.parent.children.filter((v) => v !== this);
    }
    destroy() {
      removed.push(this);
    }
    addComponent(Type) {
      const result = new Type();
      result.node = this;
      this.renderer = result;
      return result;
    }
  }
  class Renderer {
    setMaterial(value) {
      this.material = value;
    }
  }
  const cc = {
    Node,
    MeshRenderer: Renderer,
    utils: {
      createMesh(data) {
        assert.ok(
          data.positions.length / 3 <= 65535,
          'production path must never send overflowing indices to Cocos',
        );
        const mesh = {
          ...data,
          destroyed: 0,
          destroy() {
            this.destroyed++;
          },
        };
        created.push(mesh);
        return mesh;
      },
    },
  };
  const worldModule = { exports: {} };
  const worldCode = ts.transpileModule(
    fs.readFileSync('assets/scripts/presentation/WorldMesh.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  new Function('require', 'module', 'exports', worldCode)(
    (id) => {
      assert.equal(id, 'cc');
      return cc;
    },
    worldModule,
    worldModule.exports,
  );
  const upload = require('./helpers/farm-picking-ui.cjs').load('IslandMeshUpload', {
    cc,
    './WorldMesh': worldModule.exports,
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) =>
      id === './IslandMeshUpload'
        ? upload
        : id === 'cc'
          ? cc
          : id === '../art/MeshChunks'
            ? { splitMesh16 }
            : id === './WorldMesh'
              ? worldModule.exports
              : {},
    module,
    module.exports,
  );
  const view = Object.create(module.exports.IslandView.prototype);
  view.extraChunks = new Map();
  view.material = {};
  const node = new Node('Terrain');
  node.layer = 123;
  const renderer = node.addComponent(Renderer);
  renderer.shadowCastingMode = 1;
  renderer.receiveShadow = 1;
  const count = 65538;
  const data = {
    positions: Array(count * 3).fill(0),
    normals: Array(count * 3).fill(0),
    colors: Array(count * 4).fill(1),
    indices: Array.from({ length: count }, (_, i) => i),
    min: [0, 0, 0],
    max: [0, 0, 0],
  };
  const first = view.replace(renderer, [], data);
  assert.equal(first.length, 2);
  for (const mesh of first) {
    assert.deepEqual(mesh.minPos, { x: 0, y: 0, z: 0 });
    assert.deepEqual(mesh.maxPos, { x: 0, y: 0, z: 0 });
  }
  assert.equal(node.children.length, 1);
  assert.equal(renderer.mesh, first[0]);
  const extra = node.children[0];
  assert.equal(extra.layer, node.layer);
  assert.equal(extra.renderer.mesh, first[1]);
  assert.equal(extra.renderer.material, view.material);
  assert.equal(extra.renderer.shadowCastingMode, 1);
  assert.equal(extra.renderer.receiveShadow, 1);
  const next = view.replace(renderer, first, { ...data, indices: [] });
  assert.deepEqual(next, []);
  assert.equal(renderer.mesh, null);
  assert.equal(node.children.length, 0);
  assert.deepEqual(
    first.map((m) => m.destroyed),
    [1, 1],
  );
  assert.deepEqual(removed, [extra]);
  assert.equal(created.length, 2);
});
