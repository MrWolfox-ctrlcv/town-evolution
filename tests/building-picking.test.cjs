/** CPU triangles and presentation routing; not a browser, renderer or device test. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { MeshSurface } = require('../.domain-build/application/MeshSurface');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');
const { part } = require('../.domain-build/art/AssetTypes');
const ray = (o, d) => ({ o: { x: o[0], y: o[1], z: o[2] }, d: { x: d[0], y: d[1], z: d[2] } });
const surface = (id) => {
  const data = compileAsset(ASSETS[id]);
  return new MeshSurface(data.positions, data.indices);
};
const shop = surface('shop');
const board = surface('order-board');
const gap = ray([0.85, 0.85, 3], [0, 0, -1]);
const solid = ray([0, 0.8, 3], [0, 0, -1]);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('shop empty footprint corners, sloping roof air and counter gaps do not select', () => {
  for (const r of [ray([0.9, 5, 0.85], [0, -1, 0]), ray([0.35, 1.7, 3], [0, 0, -1]), gap])
    assert.equal(shop.distance(r), null);
});

test('oblique front and back views also pass through the actual counter air gap', () => {
  for (const direction of [
    [0.02, -0.02, -1],
    [-0.02, -0.01, 1],
    [0, -0.015, -1],
    [0.01, -0.015, 1],
  ]) {
    const target = [0.85, 0.85, 0];
    assert.equal(
      shop.distance(
        ray(
          target.map((n, i) => n - direction[i] * 3),
          direction,
        ),
      ),
      null,
    );
  }
});

test('actual walls, counter, awning, roof and tall chimney remain selectable', () => {
  for (const r of [
    solid,
    ray([2, 0.46, -0.08], [-1, 0, 0]),
    ray([0.7, 5, -0.08], [0, -1, 0]),
    ray([-0.25, 5, 0], [0, -1, 0]),
    ray([0.16, 2.025, 3], [0, 0, -1]),
  ])
    assert.notEqual(shop.distance(r), null);
  close(shop.distance(ray([2, 0.46, -0.08], [-1, 0, 0])), 1.14);
});

test('board leg opening and the narrow gap between wooden planks stay empty', () => {
  assert.equal(board.distance(ray([0, 0.3, 3], [0, 0, -1])), null);
  assert.equal(board.distance(ray([0, 0.7, 3], [0, 0, -1])), null);
  assert.notEqual(board.distance(ray([0, 0.8, 3], [0, 0, -1])), null);
  assert.notEqual(board.distance(ray([0.29, 0.3, 3], [0, 0, -1])), null);
});

test('nearest visible triangle wins rather than first triangle or AABB entrance', () => {
  const data = compileAsset({
    id: 'two-panels',
    footprint: [1, 1],
    parts: [
      part('back', 'box', [0, 0, -2], [1, 1, 0.2], '#FFFFFF'),
      part('front', 'box', [0, 0, 0], [1, 1, 0.2], '#FFFFFF'),
    ],
  });
  const panels = new MeshSurface(data.positions, data.indices);
  close(panels.distance(ray([0, 0, 3], [0, 0, -1])), 2.9);
  assert.equal(panels.distance(ray([0, 0, 3], [0, 0, -1]), 2), null);
  assert.equal(panels.distance(ray([0, 0, 3], [0, 0, 1])), null);
});

test('back-facing triangles are not clickable through culled faces', () => {
  const triangle = new MeshSurface([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
  close(triangle.distance(ray([0.2, 0.2, 3], [0, 0, -1])), 3);
  assert.equal(triangle.distance(ray([0.2, 0.2, -3], [0, 0, 1])), null);
  assert.equal(triangle.distance(ray([0.8, 0.8, 3], [0, 0, -1])), null);
  close(triangle.distance(ray([0, 0, 3], [0, 0, -1])), 3);
});

test('farmland selection follows actual bed surface rather than a 0.6-high box', () => {
  for (const id of [
    'farm-cell-bed',
    'farm-cell-bed-water',
    'farm-large-bed',
    'farm-large-bed-water',
  ]) {
    const bed = surface(id);
    assert.equal(bed.distance(ray([0, 0.5, 4], [0, 0, -1])), null);
    const t = bed.distance(ray([0, 5, 0], [0, -1, 0]));
    assert.ok(t > 4.7 && t < 5, id);
  }
});

test('palette and generated wood parts give the same closest surface as their combined mesh', () => {
  const recipe = ASSETS.shop;
  const batches = [false, true].map((textured) => {
    const data = compileAsset({
      ...recipe,
      parts: recipe.parts.filter((p) => Boolean(p.texture) === textured),
    });
    return new MeshSurface(data.positions, data.indices);
  });
  for (const r of [solid, gap, ray([2, 0.46, -0.08], [-1, 0, 0])]) {
    const distances = batches.map((batch) => batch.distance(r)).filter((t) => t !== null);
    const split = distances.length ? Math.min(...distances) : null;
    const merged = shop.distance(r);
    if (merged === null) assert.equal(split, null);
    else close(split, merged);
  }
});

// Real TownView methods with isolated rendering and resource collaborators.
const source = fs.readFileSync('assets/scripts/presentation/TownView.ts', 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleFixture = { exports: {} };
new Function('require', 'module', 'exports', output)(
  (id) =>
    ['./TownObjectPicking', './TownFarmPicking'].includes(id)
      ? require('./helpers/farm-picking-ui.cjs').load(id.slice(2))
      : id.startsWith('../')
        ? require(`../.domain-build/${id.slice(3)}`)
        : {},
  moduleFixture,
  moduleFixture.exports,
);
const { TownView } = moduleFixture.exports;
function townFixture() {
  const town = Object.create(TownView.prototype);
  const node = { active: true };
  town.buildings = new Map([
    [
      'shop',
      {
        kind: 'shop',
        node,
        surface: {
          distance: (ray, limit) => shop.distance(ray, limit),
          hit: (ray, limit) => {
            const distance = shop.distance(ray, limit);
            return distance === null ? null : { node, distance };
          },
        },
      },
    ],
  ]);
  town.lifted = null;
  town.resources = { pickTree: () => null, pickNatural: () => null, pickStack: () => null };
  return town;
}

test('all resource categories remain reachable through shop air but not through solid walls', () => {
  for (const [method, resourceMethod, target] of [
    ['pickStack', 'pickStack', { id: 'pile:0:0', x: 0, z: 0, distance: 2.8 }],
    ['pickTree', 'pickTree', { id: 'tree', distance: 2.8 }],
    ['pickNatural', 'pickNatural', { id: 'stone', distance: 2.8 }],
  ]) {
    const town = townFixture();
    town.resources[resourceMethod] = () => target;
    assert.equal(town.pickBuilding(gap), null);
    assert.deepEqual(town[method](gap), method === 'pickStack' ? target : target.id);
    assert.equal(town.pickBuilding(solid), 'shop');
    assert.equal(town[method](solid), null);
    town.resources[resourceMethod] = () => ({ ...target, distance: 1 });
    assert.equal(town.pickBuilding(solid), null, 'nearer resource blocks building');
    assert.notEqual(town[method](solid), null, 'nearer resource stays selectable');
  }
});

test('hidden or excluded dragged buildings cannot select or occlude a target', () => {
  const town = townFixture();
  assert.equal(town.pickBuilding(solid), 'shop');
  assert.equal(town.pickBuilding(solid, 'shop'), null);
  town.setLifted('shop');
  assert.equal(town.pickBuilding(solid), null);
  assert.equal(town.buildings.get('shop').node.active, false);
  town.resources.pickStack = () => ({ id: 'pile', x: 0, z: 0, distance: 3 });
  assert.equal(town.pickStack(solid)?.id, 'pile');
  town.setLifted(null);
  assert.equal(town.pickStack(solid), null);
});

test('crop targeting is blocked by building triangles, not empty building bounds', () => {
  const town = townFixture();
  const farm = {
    id: 'farm',
    kind: 'farm',
    x: -0.16,
    z: -0.92,
    rotation: 0,
    cropJobs: Array(9).fill(null),
  };
  farm.cropJobs[4] = { id: 'job', crop: 'wheat', startedAt: 0, readyAt: 1 };
  const state = { buildings: [farm], lastSeenAt: 1 };
  const { surface: cropSurface } = require('./helpers/farm-picking-ui.cjs').surface(
    'crop-cell-wheat-ready',
    { x: 0.84, z: 0.08 },
    0,
  );
  const cropNode = { active: true };
  town.buildings.set('farm', {
    kind: 'farm',
    node: cropNode,
    crops: { cellAt: () => 4, isSoil: () => false },
    surface: {
      distance: (ray, limit) => cropSurface.distance(ray, limit),
      hit: (ray, limit) => {
        const distance = cropSurface.distance(ray, limit);
        return distance === null ? null : { node: cropNode, distance };
      },
    },
  });
  const targetRay = ray([0.85, 0.6, 3], [0, 0, -1]);
  assert.equal(shop.distance(targetRay), null);
  assert.equal(town.pickCrop(targetRay, state)?.buildingId, 'farm');
  town.buildings.set('front', {
    kind: 'shop',
    node: { active: true },
    surface: { distance: () => 1, hit: () => ({ node: {}, distance: 1 }) },
  });
  assert.equal(town.pickCrop(targetRay, state), null);
  town.setLifted('front');
  assert.equal(town.pickCrop(targetRay, state)?.buildingId, 'farm');
});

test('all interaction paths share mesh picking and logical footprint remains placement-only', () => {
  assert.doesNotMatch(source, /pickBoxes|rayAABB|new geometry\.AABB/);
  const model = fs.readFileSync('assets/scripts/presentation/ModelPicking.ts', 'utf8');
  assert.match(model, /getComponentsInChildren\(MeshRenderer\)/);
  assert.match(model, /mesh\.readAttribute/);
  assert.match(model, /mesh\.readIndices/);
  assert.match(model, /getWorldMatrix/);
  assert.match(model, /transformMat4Normal/);
  assert.match(model, /activeInHierarchy/);
  assert.match(model, /WeakMap<Mesh/);
  assert.doesNotMatch(model, /normalize/);
  assert.match(source, /surface: new ModelPicking\(node\)/);
  assert.match(source, /buildingOutline\(\s*this.root/);
  const outline = fs.readFileSync('assets/scripts/presentation/BuildingOutline.ts', 'utf8');
  assert.match(outline, /footprint\(rotated\)/);
  assert.match(outline, /farmBoxCell/);
  assert.doesNotMatch(outline, /pick|rayAABB/);
});
