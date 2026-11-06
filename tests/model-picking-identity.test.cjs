/** Production ModelPicking with deterministic CPU meshes and narrow engine math adapters. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, load, Node } = require('./helpers/farm-picking-ui.cjs');
const { MeshSurface } = require('../.domain-build/application/MeshSurface');
const { ModelPicking } = load('ModelPicking');
const { RenderedCropPicking } = load('RenderedCropPicking');
const r = { o: { x: 0, y: 0, z: 5 }, d: { x: 0, y: 0, z: -1 } };
function triangle(name) {
  const node = new Node(name);
  const positions = [-1, -1, 0, 1, -1, 0, 0, 1, 0];
  node.renderers.push({
    enabled: true,
    node,
    mesh: {
      struct: { primitives: [{ primitiveMode: 4 }] },
      readAttribute: () => positions,
      readIndices: () => [0, 1, 2],
    },
  });
  return node;
}

test('nearest mesh hit carries actual node identity and preserves inclusive limits and distance API', () => {
  const root = new Node('building'),
    back = triangle('back'),
    front = triangle('front');
  root.addChild(back);
  root.addChild(front);
  front.world = { tz: 2, sz: 3 };
  const picker = new ModelPicking(root);
  assert.deepEqual(picker.hit(r), { node: front, distance: 3 });
  assert.equal(picker.distance(r), 3);
  assert.equal(picker.hit(r, 2.999), null);
  assert.equal(picker.hit(r, 3).node, front);
  assert.equal(picker.hit({ o: r.o, d: { x: 0, y: 0, z: 1 } }), null);
});

test('hit identity follows current transforms and filters hidden, disabled and singular renderers', () => {
  const root = new Node('building'),
    back = triangle('back'),
    front = triangle('front');
  root.addChild(back);
  root.addChild(front);
  const picker = new ModelPicking(root);
  front.world = { tz: 2, sz: 3 };
  assert.equal(picker.hit(r).distance, 3);
  front.world = { tz: 3, sz: 2, sx: 1.3, sy: 0.7 };
  assert.deepEqual(picker.hit(r), { node: front, distance: 2 });
  front.active = false;
  assert.equal(picker.hit(r).node, back);
  front.active = true;
  front.renderers[0].enabled = false;
  assert.equal(picker.hit(r).node, back);
  front.renderers[0].enabled = true;
  front.world.sz = 0;
  assert.equal(picker.hit(r).node, back);
  front.world.sz = 2;
  root.active = false;
  assert.equal(picker.hit(r), null);
  root.active = true;
  assert.equal(picker.hit(r).node, front);
});

test('a labelled hit queries each renderer primitive once without a second identity raycast', () => {
  const counts = new Map();
  class CountedMeshSurface extends MeshSurface {
    constructor(positions, indices) {
      super(positions, indices);
      this.key = positions;
    }
    distance(ray, limit) {
      counts.set(this.key, (counts.get(this.key) ?? 0) + 1);
      return super.distance(ray, limit);
    }
  }
  const { ModelPicking: Picker } = load('ModelPicking', {
    '../application/MeshSurface': { MeshSurface: CountedMeshSurface },
  });
  const root = new Node('building'),
    first = triangle('first'),
    second = triangle('second');
  root.addChild(first);
  root.addChild(second);
  const palette = first.renderers[0].mesh.readAttribute(),
    wood = palette.map((v, i) => (i % 3 === 2 ? v - 1 : v));
  first.renderers[0].mesh.struct.primitives.push({ primitiveMode: 4 });
  first.renderers[0].mesh.readAttribute = (index) => (index ? wood : palette);
  const picker = new Picker(root);
  assert.equal(picker.hit(r, Infinity, (node) => node === second).node, second);
  assert.equal(counts.size, 3);
  assert.ok([...counts.values()].every((count) => count === 1));
});

test('planting keeps crop priority on exact soil/building ties and strictly nearer resource occlusion', () => {
  const f = fixture(),
    farm = new Node('farm'),
    grid = new Node('FarmGrid'),
    cell = new Node('Cell8'),
    pivot = new Node('CropSoilPivot'),
    crop = triangle('crop');
  farm.addChild(grid);
  grid.addChild(triangle('soil'));
  grid.addChild(cell);
  cell.addChild(pivot);
  pivot.addChild(crop);
  const shop = triangle('shop');
  const farmEntry = {
    kind: 'farm',
    node: farm,
    surface: new ModelPicking(farm),
    crops: new RenderedCropPicking(farm),
  };
  const shopEntry = { kind: 'shop', node: shop, surface: new ModelPicking(shop) };
  for (const entries of [
    [
      ['shop', shopEntry],
      ['b2', farmEntry],
    ],
    [
      ['b2', farmEntry],
      ['shop', shopEntry],
    ],
  ]) {
    f.town.buildings = new Map(entries);
    assert.deepEqual(f.town.pickPlant(r), { buildingId: 'b2', cell: 8, distance: 5 });
    for (const method of ['pickTree', 'pickStack', 'pickNatural']) {
      f.town.resources[method] = () => ({ id: 'equal', distance: 5 });
      assert.equal(f.town.pickPlant(r).cell, 8);
      f.town.resources[method] = () => ({ id: 'nearer', distance: 4.999 });
      assert.equal(f.town.pickPlant(r), null);
      f.town.resources[method] = () => null;
    }
  }
  assert.equal(f.town.pickCrop(r, null, 'plant'), null);
  assert.deepEqual(f.town.pickCrop(r, f.session.state, 'plant'), {
    buildingId: 'b2',
    cell: 8,
    distance: 5,
  });
  shop.world = { tz: 0.1 };
  assert.deepEqual(f.town.pickPlant(r), { buildingId: 'shop', cell: null, distance: 4.9 });
  assert.equal(f.town.pickCrop(r, f.session.state, 'plant'), null);
  f.town.lifted = 'shop';
  assert.equal(f.town.pickPlant(r).cell, 8);
});
