/** Renderer state adapters only. Real Cocos pixels and ray intersection are verified separately. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');
const { NaturalPicking } = require('../.domain-build/application/NaturalPicking');
const { resourceTreeVisual } = require('../.domain-build/art/TreeKit');
class Node {
  children = [];
  addChild(node) {
    this.children.push(node);
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
class AABB {
  constructor(x, y, z, hx, hy, hz) {
    Object.assign(this, { x, y, z, hx, hy, hz });
  }
}
class Factory {
  calls = 0;
  asset(id) {
    this.calls++;
    const n = new Node();
    n.asset = id;
    return n;
  }
  dispose() {}
}
function load() {
  const code = ts.transpileModule(
    fs.readFileSync('assets/scripts/presentation/GroundObjects.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const deps = {
    cc: { Node, geometry: { AABB, intersect: { rayAABB: (ray, box) => ray(box) } } },
    '../art/AssetCatalog': { ASSETS },
    '../art/MeshCompiler': { compileAsset },
    '../application/NaturalPicking': { NaturalPicking },
    '../art/TreeKit': { resourceTreeVisual },
    '../domain/game': require('../.domain-build/domain/game'),
    './ModelFactory': { ModelFactory: Factory },
    './ModelPicking': { ModelPicking: class {} },
    './LooseDropView': {},
    './TouchPicking': {},
    './PileModel': { pileModel: () => new Node() },
    './ObjectBounds': { modelBounds: () => null },
  };
  function actualModule(name, compiled) {
    const m = { exports: {} };
    const output =
      compiled ??
      ts.transpileModule(fs.readFileSync(`assets/scripts/presentation/${name}.ts`, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      }).outputText;
    new Function('require', 'module', 'exports', output)(
      (id) => {
        if (deps[id]) return deps[id];
        if (id.startsWith('../')) return require('../.domain-build/' + id.slice(3));
        if (id.startsWith('./')) return actualModule(id.slice(2));
        throw new Error(`Unexpected dependency ${id}`);
      },
      m,
      m.exports,
    );
    return m.exports;
  }
  return actualModule('GroundObjects', code).GroundObjects;
}
const GroundObjects = load();
function surface(y, id = 'n1') {
  return {
    positions: [2, y, 3, 3, y, 3, 2, y, 4],
    resources: [
      { id, indices: [0, 2, 1], min: [2, y, 3], max: [3, y, 4], center: [2.25, y, 3.25] },
    ],
  };
}
const ray = { o: { x: 2.2, y: 12, z: 3.2 }, d: { x: 0, y: -1, z: 0 } };
test('curved picking updates without rebuilding trees or piles, including repeated sync and depletion', () => {
  const renderer = new GroundObjects(new Node());
  const s = {
    mapSeed: 17,
    trees: [{ id: 't1', x: 6, z: 7 }],
    groundStacks: [],
    naturalResources: [{ id: 'n1', kind: 'stone', x: 2, z: 3, amount: 4 }],
  };
  const mesh = surface(7);
  renderer.sync(s, mesh);
  const tree = renderer.root.children[0];
  assert.equal(renderer.pickNatural(ray).distance, 5);
  assert.deepEqual(renderer.naturalOrigin('n1'), { x: 2.25, y: 7, z: 3.25 });
  renderer.sync(s, mesh);
  assert.equal(renderer.root.children[0], tree);
  assert.equal(renderer.factory.calls, 1);
  s.naturalResources[0].amount = 3;
  renderer.sync(s, surface(0.8));
  assert.equal(renderer.pickNatural(ray).distance, 11.2);
  assert.equal(renderer.factory.calls, 1);
  assert.equal(tree.destroyed, undefined);
  s.naturalResources = [];
  renderer.sync(s, mesh);
  assert.equal(renderer.pickNatural(ray), null);
  assert.equal(renderer.naturalOrigin('n1'), null);
});
test('natural mesh absence cannot fall back to amount bounds', () => {
  const renderer = new GroundObjects(new Node());
  renderer.sync(
    { mapSeed: 1, trees: [], groundStacks: [], naturalResources: [{ id: 'n1', amount: 9 }] },
    { positions: [], resources: [] },
  );
  assert.equal(renderer.pickNatural(ray), null);
});

test('actual resource hit distance participates in building, tree and pile occlusion', () => {
  const source = fs.readFileSync('assets/scripts/presentation/TownView.ts', 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) =>
      id === './TownObjectPicking'
        ? require('./helpers/farm-picking-ui.cjs').load('TownObjectPicking')
        : id.startsWith('../')
          ? require(`../.domain-build/${id.slice(3)}`)
          : {},
    m,
    m.exports,
  );
  const town = Object.create(m.exports.TownView.prototype);
  const picker = new NaturalPicking();
  picker.sync(surface(7), [{ id: 'n1', amount: 1 }]);
  const hits = { tree: null, pile: null, building: null };
  town.resources = {
    pickNatural: (r) => picker.pick(r),
    pickTree: () => hits.tree,
    pickStack: () => hits.pile,
  };
  town.buildingHit = () => hits.building;
  assert.equal(town.pickNatural(ray), 'n1');
  for (const category of ['tree', 'pile', 'building']) {
    hits[category] = { id: category, distance: 4 };
    assert.equal(town.pickNatural(ray), null, `${category} in front blocks resource`);
    hits[category] = { id: category, distance: 6 };
    assert.equal(town.pickNatural(ray), 'n1', `${category} behind cannot block real high surface`);
    hits[category] = null;
  }
  hits.tree = { id: 'tree', distance: 6 };
  hits.pile = { id: 'pile', distance: 6 };
  hits.building = { id: 'building', distance: 6 };
  assert.equal(town.pickBuilding(ray), null);
  assert.equal(town.pickTree(ray), null);
  assert.equal(town.pickStack(ray), null);
});

test('collection binding resolves old surface before refreshing depleted geometry', () => {
  const source = fs.readFileSync('assets/scripts/presentation/CollectionBinding.ts', 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => require(`../.domain-build/${id.slice(3)}`),
    m,
    m.exports,
  );
  let listener;
  const picker = new NaturalPicking();
  picker.sync(surface(7), [{ id: 'n1', amount: 1 }]);
  const flights = [];
  m.exports.bindCollections(
    { setCollectionListener: (fn) => (listener = fn) },
    { project: (p) => p },
    { collect: (...args) => flights.push(args) },
    () => picker.sync(surface(7), []),
    (id) => picker.origin(id),
  );
  listener({
    command: { type: 'gatherNatural', resourceId: 'n1' },
    before: { naturalResources: [{ id: 'n1', amount: 1 }] },
    gains: [{ kind: 'stone', amount: 1 }],
  });
  assert.deepEqual(flights, [['stone', 1, { x: 2.25, y: 7, z: 3.25 }]]);
  assert.equal(picker.origin('n1'), null);
});

test('a planted sapling changes visible stages without mutating saved growth or rebuilding mature neighbors', () => {
  const renderer = new GroundObjects(new Node());
  const state = {
    mapSeed: 17,
    lastSeenAt: 100,
    trees: [
      { id: 'old', x: 3, z: 4 },
      { id: 'new', x: 6, z: 7, plantedAt: 100, readyAt: 30100, growthDurationMs: 30000 },
    ],
    groundStacks: [],
    naturalResources: [],
  };
  const before = structuredClone(state);
  renderer.sync(state, surface(0), 100);
  const old = renderer.trees[0].node,
    seedling = renderer.trees[1].node;
  assert.equal(seedling.asset, 'sapling');
  renderer.sync(state, surface(0), 9000);
  assert.strictEqual(renderer.trees[1].node, seedling);
  renderer.sync(state, surface(0), 10100);
  assert.notStrictEqual(renderer.trees[1].node, seedling);
  assert.equal(renderer.trees[1].node.asset, 'sapling');
  assert.ok(renderer.trees[1].node.scale[1] > seedling.scale[1]);
  renderer.sync(state, surface(0), 30100);
  assert.equal(renderer.trees[1].node.asset, resourceTreeVisual(state.mapSeed, 6, 7).asset);
  assert.strictEqual(renderer.trees[0].node, old);
  assert.deepEqual(state, before);
});
