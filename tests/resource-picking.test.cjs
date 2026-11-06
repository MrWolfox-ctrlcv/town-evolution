/** Real GroundObjects -> ModelPicking -> triangles, with narrow CPU mesh/transform adapters. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const game = require('../.domain-build/domain/game');
const {
  fixture,
  worldSurface,
  Factory,
  ModelPicking,
} = require('./helpers/resource-picking-ui.cjs');
const { resourceTreeVisual } = require('../.domain-build/art/TreeKit');
const { ContinuousResources } = require('../.domain-build/art/ContinuousResources');
const { terrainAt } = require('../.domain-build/domain/terrain');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');
const gapRay = {
  o: { x: 19.346091082202307, y: 13.10294047558195, z: 33.30609451690152 },
  d: { x: -0.4869206048708966, y: -0.6492274731611954, z: -0.584304725845076 },
};
function woodState() {
  const state = game.createGame(100, 1, 3);
  state.inventory.wood = 1;
  const dropped = game.dispatch(
    state,
    { type: 'dropProduct', item: 'wood', quantity: 1, x: 9, z: 21 },
    100,
  );
  assert.equal(dropped.ok, true, dropped.error);
  return dropped.state;
}
test('tree canopy air cannot steal the visible wood pile on the current camera ray', () => {
  const state = woodState();
  const surface = new ContinuousResources(40, state.mapSeed, (x, z) =>
    terrainAt(x, z, state.mapSeed, state.terrainVersion),
  ).sync(state.naturalResources).naturalSurface;
  const f = fixture(state, surface);
  const pile = f.resources.piles[0];
  assert.notEqual(
    worldSurface(pile.node).distance(gapRay),
    null,
    'ray crosses real wood triangles',
  );
  assert.ok(f.resources.trees.every((tree) => worldSurface(tree.node).distance(gapRay) === null));
  assert.equal(f.resources.pickNatural(gapRay), null);
  assert.equal(f.resources.pickTree(gapRay), null);
  assert.equal(f.town.pickTree(gapRay), null);
  assert.equal(f.town.pickStack(gapRay)?.id, 'pile:9:21');
});

test('a one-log empty corner and below-log air are not selectable pile surfaces', () => {
  const state = {
    mapSeed: 1,
    trees: [],
    naturalResources: [],
    groundStacks: [{ item: 'wood', amount: 1, x: 0, z: 0 }],
  };
  const f = fixture(state),
    node = f.resources.piles[0].node;
  const rays = [
    { o: { x: 0.69, y: 5, z: 0.69 }, d: { x: 0, y: -1, z: 0 } },
    { o: { x: 0.5, y: -0.01, z: 5 }, d: { x: 0, y: 0, z: -1 } },
  ];
  for (const ray of rays) {
    assert.equal(worldSurface(node).distance(ray), null, 'the regression ray must hit only air');
    assert.equal(f.resources.pickStack(ray), null);
  }
});

test('every pile quantity keeps its real visible faces and air gaps selectable consistently', () => {
  for (const asset of Object.keys(ASSETS).filter((id) => id.startsWith('pile-'))) {
    const [, item, amount] = /^pile-(.+)-(\d+)$/.exec(asset),
      f = fixture({
        mapSeed: 1,
        trees: [],
        naturalResources: [],
        groundStacks: [{ item, amount: Number(amount), x: 0, z: 0 }],
      }),
      oracle = worldSurface(f.resources.piles[0].node);
    let visible = 0;
    for (let x = 0.1; x <= 0.91; x += 0.1)
      for (let z = 0.1; z <= 0.91; z += 0.1) {
        const ray = { o: { x, y: 5, z }, d: { x: 0, y: -1, z: 0 } },
          expected = oracle.distance(ray),
          actual = f.resources.pickStack(ray);
        if (expected === null) assert.equal(actual, null, asset);
        else {
          visible++;
          assert.equal(actual?.id, 'pile:0:0', asset);
          assert.ok(Math.abs(actual.distance - expected) < 1e-8, asset);
        }
      }
    assert.ok(visible > 0, `${asset} retains a visible target`);
  }
});

test('unchanged trees and piles retain their model and picker when other resources change', () => {
  const state = woodState(),
    f = fixture(state),
    trees = new Map(f.resources.trees.map((tree) => [tree.id, tree])),
    pile = f.resources.piles[0];
  const changed = structuredClone(state);
  changed.groundStacks[0].amount = 2;
  f.resources.sync(changed);
  for (const tree of f.resources.trees) assert.ok(tree === trees.get(tree.id));
  assert.notEqual(f.resources.piles[0].node, pile.node);
  assert.equal(pile.node.destroyed, true);
  const survivor = f.resources.piles[0];
  changed.trees = changed.trees.slice(1).reverse();
  f.resources.sync(changed);
  assert.ok(f.resources.piles[0] === survivor);
  assert.equal(trees.get(state.trees[0].id).node.destroyed, true);
  for (const tree of f.resources.trees) assert.ok(tree === trees.get(tree.id));
});

test('all tree variants match world triangles at current yaw and nonuniform scale', () => {
  const selected = new Map();
  for (let x = 0; x < 40; x++)
    for (let z = 0; z < 40; z++) {
      const v = resourceTreeVisual(1, x, z);
      if (!selected.has(v.asset)) selected.set(v.asset, { id: v.asset, x, z });
    }
  assert.equal(selected.size, 24);
  for (const tree of selected.values()) {
    const f = fixture({ mapSeed: 1, trees: [tree], groundStacks: [], naturalResources: [] }),
      node = f.resources.trees[0].node,
      picker = f.resources.trees[0].surface;
    for (const yaw of [node.rotation[1], 0, 90, 173]) {
      node.setRotationFromEuler(0, yaw, 0);
      node.setScale(0.61, 1.23, 0.94);
      const oracle = worldSurface(node);
      let hits = 0,
        misses = 0;
      for (const dx of [-0.44, -0.2, 0, 0.2, 0.44])
        for (const dz of [-0.44, -0.2, 0, 0.2, 0.44]) {
          const ray = {
            o: { x: tree.x + 0.5 + dx, y: 5, z: tree.z + 0.5 + dz },
            d: { x: 0, y: -1, z: 0 },
          };
          const expected = oracle.distance(ray),
            actual = f.resources.pickTree(ray);
          if (expected === null) {
            misses++;
            assert.equal(actual, null);
          } else {
            hits++;
            assert.equal(actual?.id, tree.id);
            assert.ok(Math.abs(actual.distance - expected) < 1e-8);
          }
        }
      assert.ok(hits > 0 && misses > 0, `${tree.id} ${yaw}: retain both solid and air`);
      assert.ok(f.resources.trees[0].surface === picker, 'current transforms need no new picker');
    }
  }
});

test('actual trunks and wood faces occlude each other by triangle distance, excluding lifted piles', () => {
  const f = fixture({
    mapSeed: 1,
    trees: [{ id: 'tree', x: 0, z: 0 }],
    groundStacks: [{ item: 'wood', amount: 1, x: 0, z: 2 }],
    naturalResources: [],
  });
  const front = { o: { x: 0.5, y: 0.14, z: 5 }, d: { x: 0, y: 0, z: -1 } },
    back = { o: { x: 0.5, y: 0.14, z: -5 }, d: { x: 0, y: 0, z: 1 } };
  for (const ray of [front, back]) {
    assert.notEqual(f.resources.pickTree(ray), null);
    assert.notEqual(f.resources.pickStack(ray), null);
  }
  assert.equal(f.town.pickStack(front)?.id, 'pile:0:2');
  assert.equal(f.town.pickTree(front), null);
  assert.equal(f.town.pickTree(back), 'tree');
  assert.equal(f.town.pickStack(back), null);
  assert.equal(f.resources.pickStack(front, 'pile:0:2'), null);
  f.resources.setLifted('pile:0:2');
  assert.equal(f.town.pickStack(front), null);
  assert.equal(f.town.pickTree(front), 'tree');
  f.resources.setLifted(null);
  assert.equal(f.town.pickTree(front), null);
});

test('trees share mesh caches, skip hidden or disabled renderers, and refresh on seed changes', () => {
  const state = {
      mapSeed: 1,
      trees: [{ id: 'tree', x: 0, z: 0 }],
      groundStacks: [],
      naturalResources: [],
    },
    f = fixture(state),
    ray = { o: { x: 0.5, y: 5, z: 0.5 }, d: { x: 0, y: -1, z: 0 } },
    old = f.resources.trees[0];
  assert.equal(f.resources.pickTree(ray)?.id, 'tree');
  const reads = f.resources.factory.reads;
  for (let i = 0; i < 30; i++) assert.equal(f.resources.pickTree(ray)?.id, 'tree');
  assert.equal(
    f.resources.factory.reads,
    reads,
    'never reread mesh positions during pointer moves',
  );
  old.node.active = false;
  assert.equal(f.resources.pickTree(ray), null);
  old.node.active = true;
  old.node.renderers[0].enabled = false;
  assert.equal(f.resources.pickTree(ray), null);
  old.node.renderers[0].enabled = true;
  const second = new ModelPicking(f.resources.factory.asset(old.node.asset));
  second.distance({ o: { x: 0, y: 5, z: 0 }, d: ray.d });
  assert.equal(f.resources.factory.reads, reads, 'identical variants share the same CPU surface');
  f.resources.sync({ ...state, mapSeed: 2 });
  assert.equal(old.node.destroyed, true);
  assert.equal(f.resources.trees[0].node.asset, resourceTreeVisual(2, 0, 0).asset);
  assert.equal(f.resources.pickTree(ray)?.id, 'tree');
});

test('building and natural triangles still block tree silhouettes, not the other way around', () => {
  const state = {
      mapSeed: 1,
      trees: [{ id: 'tree', x: 0, z: 0 }],
      groundStacks: [],
      naturalResources: [{ id: 'stone', amount: 1 }],
    },
    ray = { o: { x: 0.5, y: 8, z: 0.5 }, d: { x: 0, y: -1, z: 0 } };
  const f = fixture(state, {
    positions: [0, 3, 0, 1, 3, 0, 0, 3, 1, 1, 3, 1],
    resources: [
      {
        id: 'stone',
        indices: [0, 2, 1, 1, 2, 3],
        min: [0, 3, 0],
        max: [1, 3, 1],
        center: [0.5, 3, 0.5],
      },
    ],
  });
  assert.equal(f.town.pickNatural(ray), 'stone');
  assert.equal(f.town.pickTree(ray), null);
  const node = new Factory().asset('crate');
  node.setPosition(0.5, 4, 0.5);
  f.town.buildings.set('crate', { node, kind: 'crate', surface: new ModelPicking(node) });
  assert.equal(f.town.pickBuilding(ray), 'crate');
  assert.equal(f.town.pickNatural(ray), null);
  assert.equal(f.town.pickTree(ray), null);
  node.setPosition(0.5, 0, 0.5);
  f.resources.sync({ ...state, naturalResources: [] });
  assert.equal(f.town.pickTree(ray), 'tree');
  assert.equal(f.town.pickBuilding(ray), null);
});
