const { test } = require('node:test');
const assert = require('node:assert/strict');
const { expectedSchema10 } = require('./helpers/expected-schema10.cjs');
const fs = require('node:fs');
const ts = require('typescript');
const g = require('../.domain-build/domain/game');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');
const { terrainHash } = require('../.domain-build/art/NaturalMesh');
const { TREE_VARIANTS, treeVariants, resourceTreeVisual } = require('../.domain-build/art/TreeKit');
const variants = treeVariants();

test('tree leaf banks vary shape, size, offsets and color without adding geometry or textures', () => {
  assert.equal(variants.length, 24);
  assert.deepEqual(treeVariants(), variants);
  for (const kind of ['tree', 'tree-pine']) {
    const bank = variants.filter((a) => a.id.startsWith(`${kind}-canopy-`));
    assert.equal(bank.length, TREE_VARIANTS[kind]);
    const base = compileAsset(ASSETS[kind]);
    for (const property of ['size', 'position', 'rotation', 'color']) {
      const signatures = bank.map((a) =>
        JSON.stringify(
          a.parts
            .filter((p) => p.shape === 'crown' || p.name === 'pine-tier')
            .map((p) => p[property]),
        ),
      );
      assert.equal(new Set(signatures).size, bank.length, `${kind} ${property}`);
    }
    for (const recipe of bank) {
      const mesh = compileAsset(recipe);
      assert.equal(mesh.positions.length, base.positions.length, 'no extra vertices per tree');
      assert.equal(mesh.indices.length, base.indices.length, 'no extra triangles per tree');
      assert.ok(recipe.parts.every((p) => p.texture === undefined));
      assert.equal(ASSETS[recipe.id].category, 'natural-plants');
      assert.ok(mesh.max[1] <= base.max[1] + 1e-9);
      assert.ok(mesh.min[1] >= -1e-9);
      for (let i = 0; i < mesh.positions.length; i += 3)
        assert.ok(Math.hypot(mesh.positions[i], mesh.positions[i + 2]) <= 0.595 + 1e-9);
    }
  }
});

test('seed/coordinate identity is stable, independent of render order, and varies neighboring trees', () => {
  for (const seed of [1, 42173, 999999999]) {
    const state = g.createGame(0, seed);
    const visual = state.trees.map((t) => resourceTreeVisual(seed, t.x, t.z));
    const reversed = [...state.trees]
      .reverse()
      .map((t) => resourceTreeVisual(seed, t.x, t.z))
      .reverse();
    assert.deepEqual(visual, reversed);
    assert.equal(new Set(visual.map((v) => JSON.stringify(v))).size, state.trees.length);
    assert.ok(new Set(visual.map((v) => v.asset)).size >= 15);
    for (const tree of state.trees) {
      const v = resourceTreeVisual(seed, tree.x, tree.z);
      assert.deepEqual(v, resourceTreeVisual(seed, tree.x, tree.z));
      assert.notDeepEqual(v, resourceTreeVisual(seed + 1, tree.x, tree.z));
      assert.equal(v.pickAsset, terrainHash(seed, tree.x, 0, tree.z) < 0.28 ? 'tree-pine' : 'tree');
      assert.deepEqual(v.pickScale, [0.85, 1.15, 0.85]);
      assert.ok(ASSETS[v.asset]);
      assert.ok(v.yaw >= 0 && v.yaw < 360);
    }
  }
});

test('every rendered tree vertex remains inside the historic size envelope for all sampled yaws', () => {
  const meshes = Object.fromEntries(variants.map((a) => [a.id, compileAsset(a)]));
  const bounds = {
    tree: compileAsset(ASSETS.tree),
    'tree-pine': compileAsset(ASSETS['tree-pine']),
  };
  for (const seed of [1, 42173, 999999999]) {
    for (let x = 0; x < 40; x++)
      for (let z = 0; z < 40; z++) {
        const visual = resourceTreeVisual(seed, x, z);
        const mesh = meshes[visual.asset];
        const old = bounds[visual.pickAsset];
        const angle = (visual.yaw * Math.PI) / 180;
        for (let i = 0; i < mesh.positions.length; i += 3) {
          const px = mesh.positions[i] * visual.scale[0];
          const py = mesh.positions[i + 1] * visual.scale[1];
          const pz = mesh.positions[i + 2] * visual.scale[2];
          assert.ok(Math.abs(px * Math.cos(angle) + pz * Math.sin(angle)) < 0.51);
          assert.ok(Math.abs(-px * Math.sin(angle) + pz * Math.cos(angle)) < 0.51);
          assert.ok(py >= old.min[1] * 1.15 - 1e-9 && py <= old.max[1] * 1.15 + 1e-9);
        }
      }
  }
});

test('legacy saves roundtrip unchanged; unrelated harvest and reordering do not reroll trees', () => {
  const historical = require('./fixtures/terrain-v2-depleted.json');
  for (const state of [historical, ...[1, 2, 3].map((v) => g.createGame(0, 42173, v))]) {
    const save = JSON.stringify(state);
    const before = state.trees.map((t) => [t.id, resourceTreeVisual(state.mapSeed, t.x, t.z)]);
    const restored = g.importSave(g.exportSave(state), state.lastSeenAt);
    assert.deepEqual(restored, state.schemaVersion === 8 ? expectedSchema10(state) : state);
    assert.equal(JSON.stringify(state), save);
    assert.deepEqual(
      restored.trees.map((t) => [t.id, resourceTreeVisual(restored.mapSeed, t.x, t.z)]),
      before,
    );
    const chopped = g.dispatch(
      restored,
      { type: 'useTool', tool: 'axe', treeId: restored.trees[0].id },
      state.lastSeenAt,
    );
    assert.equal(chopped.ok, true, chopped.error);
    assert.equal(chopped.state.trees.length, state.trees.length - 1);
    const survivors = new Map(before.slice(1));
    for (const t of chopped.state.trees)
      assert.deepEqual(resourceTreeVisual(chopped.state.mapSeed, t.x, t.z), survivors.get(t.id));
    assert.deepEqual(g.importSave(g.exportSave(chopped.state), state.lastSeenAt), chopped.state);
  }
});

// State-adapter tests exercise actual presentation code, not Cocos pixels or GPU behavior.
class Node {
  children = [];
  constructor(name) {
    this.name = name;
  }
  addChild(n) {
    this.children.push(n);
  }
  setPosition(...v) {
    this.position = v;
  }
  setScale(...v) {
    this.scale = v;
  }
  setRotationFromEuler(...v) {
    this.rotation = v;
  }
  destroy() {
    this.destroyed = true;
  }
}
class Factory {
  asset(asset, name) {
    const n = new Node(name);
    n.asset = asset;
    return n;
  }
  shape(parent, name) {
    const n = new Node(name);
    parent.addChild(n);
    return n;
  }
  dispose() {}
}
function presentation(file, cc, extra = {}) {
  const code = ts.transpileModule(
    fs.readFileSync(`assets/scripts/presentation/${file}.ts`, 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        experimentalDecorators: true,
      },
    },
  ).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id === 'cc') return cc;
      if (extra[id]) return extra[id];
      if (id.startsWith('../')) return require(`../.domain-build/${id.slice(3)}`);
      throw new Error(id);
    },
    m,
    m.exports,
  );
  return m.exports[file];
}

test('standing trees pick their visible variants and repeat sync does not recreate or reroll them', () => {
  const { fixture, worldSurface } = require('./helpers/resource-picking-ui.cjs');
  const state = g.createGame(0, 42173);
  const { resources: renderer } = fixture(state);
  for (let i = 0; i < state.trees.length; i++) {
    const t = state.trees[i];
    const v = resourceTreeVisual(state.mapSeed, t.x, t.z);
    const node = renderer.trees[i].node;
    assert.equal(node.asset, v.asset);
    assert.deepEqual(node.scale, v.scale);
    assert.deepEqual(node.rotation, [0, v.yaw, 0]);
    const ray = { o: { x: t.x + 0.5, y: 20, z: t.z + 0.5 }, d: { x: 0, y: -1, z: 0 } };
    const expected = worldSurface(node).distance(ray);
    assert.notEqual(expected, null);
    const hit = renderer.pickTree(ray);
    assert.equal(hit?.id, t.id);
    assert.ok(Math.abs(hit.distance - expected) < 1e-8);
  }
  const nodes = [...renderer.root.children];
  renderer.sync(state);
  assert.deepEqual(renderer.root.children, nodes);
  assert.equal(renderer.pickTree({ o: { x: -10, y: 20, z: -10 }, d: { x: 0, y: -1, z: 0 } }), null);
});

test('chop feedback starts with the same variant, size and yaw and releases its finite animation', () => {
  class Component {
    node = new Node();
  }
  const TownFeedback = presentation('TownFeedback', {
    Node,
    Component,
    isValid: (n) => !n.destroyed,
    _decorator: { ccclass: () => (c) => c },
  });
  for (const seed of [1, 42173]) {
    const feedback = new TownFeedback();
    feedback.configure(new Factory());
    const v = resourceTreeVisual(seed, 8, 10);
    feedback.chop(8, 10, seed);
    const root = feedback.node.children[0],
      tree = root.children[0];
    assert.deepEqual(root.position, [8.5, 0, 10.5]);
    assert.equal(tree.asset, v.asset);
    assert.deepEqual(tree.scale, v.scale);
    assert.deepEqual(tree.rotation, [0, v.yaw, 0]);
    for (let i = 0; i < 8; i++) {
      feedback.update(0.1);
      assert.ok([...tree.scale, ...tree.rotation].every(Number.isFinite));
      assert.equal(tree.rotation[1], v.yaw);
    }
    feedback.update(0.01);
    assert.equal(root.destroyed, true);
    assert.equal(feedback.effects.length, 0);
  }
});
