const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { v6MeshBytes, v6UploadParts } = require('../.domain-build/art/V6MeshUploadParts');
function mesh(triangles = 1000, uv = false) {
  const value = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
    min: [0, 0, 0],
    max: [triangles, 1, 1],
  };
  if (uv) value.uvs = [];
  for (let t = 0; t < triangles; t++)
    for (let c = 0; c < 3; c++) {
      value.positions.push(t, c === 1 ? 1 : 0, c === 2 ? 1 : 0);
      value.normals.push(0, 1, 0);
      value.colors.push(t / triangles, c / 3, 0.5, 1);
      value.indices.push(t * 3 + c);
      if (uv) value.uvs.push(t / triangles, c / 3);
    }
  return value;
}
const vertex = (m, id) => [
  ...m.positions.slice(id * 3, id * 3 + 3),
  ...m.normals.slice(id * 3, id * 3 + 3),
  ...m.colors.slice(id * 4, id * 4 + 4),
  ...(m.uvs?.slice(id * 2, id * 2 + 2) ?? [0, 0]),
];
test('v6 bytes exactly include implicit UV0 and official 16-bit indices', () => {
  assert.equal(v6MeshBytes(mesh(1)), 150);
  assert.equal(v6MeshBytes(mesh(1, true)), 150);
  assert.equal(v6MeshBytes(mesh(1000)), 150000);
  const world = fs.readFileSync('assets/scripts/presentation/WorldMesh.ts', 'utf8');
  assert.match(world, /uvs: data\.uvs \?\? new Array/);
});
test('64KiB v6 parts preserve all triangles, explicit UVs and finite local bounds', () => {
  for (const uv of [false, true]) {
    const source = mesh(1500, uv),
      before = JSON.stringify(source),
      parts = v6UploadParts(source);
    assert.ok(parts.length > 1);
    assert.ok(parts.every((p) => v6MeshBytes(p) <= 65536 && p.positions.length / 3 < 65535));
    const actual = parts.flatMap((p) => p.indices.map((id) => vertex(p, id)));
    assert.deepEqual(
      actual,
      source.indices.map((id) => vertex(source, id)),
    );
    assert.equal(
      parts.reduce((n, p) => n + p.indices.length, 0),
      source.indices.length,
    );
    assert.equal(JSON.stringify(source), before);
    for (const p of parts)
      for (let i = 0; i < p.positions.length; i++)
        assert.ok(p.positions[i] >= p.min[i % 3] && p.positions[i] <= p.max[i % 3]);
  }
});
test('part rollover correctly recharges shared vertices and rejects malformed uploads', () => {
  const shared = mesh(2, true);
  shared.indices = [0, 1, 2, 2, 1, 3];
  const parts = v6UploadParts(shared, 150);
  assert.equal(parts.length, 2);
  assert.ok(parts.every((p) => v6MeshBytes(p) === 150));
  assert.deepEqual(
    parts.flatMap((p) => p.indices.map((id) => vertex(p, id))),
    shared.indices.map((id) => vertex(shared, id)),
  );
  for (const limit of [0, 149, 65537, Infinity, NaN])
    assert.throws(() => v6UploadParts(shared, limit));
  for (const change of [
    (s) => s.normals.pop(),
    (s) => s.colors.pop(),
    (s) => s.uvs.pop(),
    (s) => (s.indices[0] = -1),
    (s) => (s.indices[0] = 999),
    (s) => (s.positions[0] = NaN),
    (s) => (s.uvs[0] = Infinity),
  ]) {
    const bad = mesh(1, true);
    change(bad);
    assert.throws(() => v6UploadParts(bad));
  }
});
function uploader() {
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
    addChild(n) {
      this.children.push(n);
      n.parent = this;
    }
    addComponent() {
      return { setMaterial() {} };
    }
    removeFromParent() {
      if (this.parent) this.parent.children = this.parent.children.filter((n) => n !== this);
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const code = ts.transpileModule(
    fs.readFileSync('assets/scripts/presentation/V6ChunkMeshes.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id === 'cc') return { Node, MeshRenderer: class {} };
      if (id === '../art/V6MeshUploadParts')
        return require('../.domain-build/art/V6MeshUploadParts');
      if (id === './WorldMaterial') return { worldShadows() {} };
      if (id === './WorldMesh')
        return {
          worldMesh(data) {
            if (calls.length === failAt) throw Error('simulated upload failure');
            calls.push(data);
            const value = {
              destroy() {
                this.destroyed = true;
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
}
test('each v6 frame respects total uploaded attribute bytes and publishes the full group atomically', () => {
  const f = uploader();
  f.uploads.stage([{ key: 'a', mesh: mesh(1) }]);
  assert.equal(f.uploads.advance(65536, Infinity), true);
  f.uploads.publish();
  const old = f.parent.children[0];
  assert.equal(old.active, true);
  f.uploads.stage([
    { key: 'a', mesh: mesh(1500) },
    { key: 'b', mesh: mesh(800, true) },
  ]);
  assert.throws(() => f.uploads.publish(), /Incomplete/);
  let complete = false,
    frames = 0;
  while (!complete) {
    const before = f.calls.length;
    complete = f.uploads.advance(65536, Infinity);
    frames++;
    const bytes = f.calls.slice(before).reduce((n, p) => n + v6MeshBytes(p), 0);
    assert.ok(bytes <= 65536);
    assert.ok(++frames < 50);
    assert.equal(old.active, true);
    assert.equal(old.destroyed, undefined);
    assert.ok(f.parent.children.filter((n) => n !== old).every((n) => !n.active));
  }
  assert.ok(frames > 2);
  f.uploads.publish();
  assert.equal(old.active, false);
  assert.equal(old.destroyed, true);
  assert.deepEqual(f.uploads.keys(), ['a', 'b']);
  assert.ok(f.parent.children.every((n) => n.active));
  f.uploads.dispose();
  assert.equal(f.parent.children.length, 0);
  assert.ok(f.meshes.every((m) => m.destroyed));
});
test('zero/insufficient budget, cancellation and failure never expose a partial v6 mesh', () => {
  const f = uploader();
  f.uploads.stage([{ key: 'old', mesh: mesh(1) }]);
  f.uploads.advance(65536, Infinity);
  f.uploads.publish();
  const old = f.parent.children[0];
  f.uploads.stage([{ key: 'new', mesh: mesh(1000) }]);
  let before = f.calls.length;
  assert.equal(f.uploads.advance(0, Infinity), false);
  assert.equal(f.calls.length, before);
  assert.equal(f.uploads.advance(149, Infinity), false);
  assert.equal(f.calls.length, before);
  assert.equal(f.uploads.advance(65536, Infinity), false);
  assert.ok(f.calls.length > before);
  f.uploads.cancel();
  assert.deepEqual(f.uploads.keys(), ['old']);
  assert.equal(old.destroyed, undefined);
  assert.deepEqual(f.parent.children, [old]);
  f.uploads.stage([{ key: 'new', mesh: mesh(1000) }]);
  f.failOn(f.calls.length + 1);
  assert.throws(() => f.uploads.advance(262144, Infinity), /simulated/);
  assert.deepEqual(f.parent.children, [old]);
  assert.deepEqual(f.uploads.keys(), ['old']);
  assert.throws(
    () =>
      f.uploads.stage([
        { key: 'x', mesh: mesh(1) },
        { key: 'x', mesh: mesh(1) },
      ]),
    /Duplicate/,
  );
  f.uploads.stage([{ key: 'old', mesh: mesh(0) }]);
  assert.equal(f.uploads.advance(65536, Infinity), true);
  f.uploads.publish();
  assert.deepEqual(f.uploads.keys(), []);
  assert.equal(old.destroyed, true);
});
