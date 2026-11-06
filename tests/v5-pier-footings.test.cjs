/** Production building assembly, canonical CPU triangles and real triangle picking. No GPU evidence. */
const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  ts = require('typescript');
const g = require('../.domain-build/domain/game');
const { getV5Hydrology } = require('../.domain-build/domain/v5-hydrology');
const {
  V5_PIER_BED_LOWER,
  V5_PIER_EMBED,
  V5_PIER_FOOT_TOP,
  V5_PIER_FOOT_UNIT,
  v5PierFootings,
} = require('../.domain-build/art/V5PierFootings');
const { dockPierExtension } = require('../.domain-build/art/DockPierKit');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');
const {
  Node: ResourceNode,
  ModelPicking,
  worldSurface,
} = require('./helpers/resource-picking-ui.cjs');
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
    this.renderers.push(c);
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
  dispose() {
    for (const m of this.meshes.values()) m.destroy();
  }
}
function factory() {
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
  };
  new Function('require', 'module', 'exports', code)(
    (id) => deps[id] ?? require('../.domain-build/' + id.slice(3)),
    m,
    m.exports,
  );
  return new m.exports.ModelFactory();
}
const seed = 42173,
  hydro = getV5Hydrology(seed),
  feature = hydro.feature;
const dock = {
  id: 'actual-dock',
  kind: 'dock',
  x: feature.anchor.x,
  z: feature.anchor.z,
  rotation: feature.rotation,
  dockStyle: 'simple',
};
const footingNodes = (root) =>
  root.getChildByName('RotatedPier')?.children.filter((n) => /^V5PierFooting/.test(n.name)) ?? [];
function worldPoint(b, x, z) {
  const a = (b.rotation * Math.PI) / 2;
  return {
    x: b.x + 1 + x * Math.cos(a) + z * Math.sin(a),
    z: b.z + 1 - x * Math.sin(a) + z * Math.cos(a),
  };
}

test('extension keeps its four original posts; one shared foot unit has exactly the same log profile and wood material', () => {
  const original = dockPierExtension().parts.filter((p) => p.name === 'pier-piling');
  assert.equal(original.length, 4);
  assert.equal(V5_PIER_FOOT_UNIT.parts[0].shape, 'log');
  assert.equal(V5_PIER_FOOT_UNIT.parts[0].texture, original[0].texture);
  assert.equal(V5_PIER_FOOT_UNIT.parts[0].color, original[0].color);
  const foot = v5PierFootings(true, 2);
  original.forEach((p, i) => {
    assert.deepEqual([foot[i].x, foot[i].z], [p.position[0], p.position[2]]);
    assert.equal(foot[i].width, p.size[0]);
    assert.ok(Math.abs(p.position[1] - p.size[1] / 2 + 0.42) < 1e-12);
  });
  const unit = compileAsset(V5_PIER_FOOT_UNIT);
  assert.ok(unit.indices.length / 3 < 100);
  assert.ok(unit.texturedIndices.length > 0);
  assert.equal(unit.min[1], -0.5);
  assert.equal(unit.max[1], 0.5);
  const top = new Set(),
    bottom = new Set();
  for (let i = 0; i < unit.positions.length; i += 3)
    (unit.positions[i + 1] === 0.5 ? top : bottom).add(
      `${unit.positions[i]},${unit.positions[i + 2]}`,
    );
  assert.deepEqual(top, bottom, 'No taper or changed upper ring at the join');
  assert.equal(top.size, 10);
});

test('the complete footprint has a proven minimum embed, including cliffs and ordinary coast, across seeds and turns', () => {
  assert.ok(Math.abs(V5_PIER_BED_LOWER - (-1.3 - 2 * 0.13 - 2 * 0.07)) < 1e-12);
  const turns = new Set();
  for (const mapSeed of [1, 7, 17, 42, 100, 42173]) {
    const h = getV5Hydrology(mapSeed),
      f = h.feature;

    const b = { ...dock, x: f.anchor.x, z: f.anchor.z, rotation: f.rotation };
    assert.ok(g.hasDockExit({ mapSeed, terrainVersion: 5, landExtensions: [] }, b));
    for (const rotation of [0, 1, 2, 3]) {
      turns.add(rotation);
      // All four geometry transforms are probed; this does not grant build permission.
      for (const simple of [true, false])
        for (const p of v5PierFootings(simple, 2)) {
          const bottom = p.y - p.height / 2;
          assert.ok(Math.abs(bottom - (V5_PIER_BED_LOWER - V5_PIER_EMBED)) < 1e-12);
          assert.ok(Math.abs(p.y + p.height / 2 - V5_PIER_FOOT_TOP) < 1e-12);
          for (let ix = 0; ix <= 10; ix++)
            for (let iz = 0; iz <= 10; iz++) {
              const w = worldPoint(
                  { ...b, rotation },
                  p.x + (ix / 10 - 0.5) * p.width,
                  p.z + (iz / 10 - 0.5) * p.width,
                ),
                bed = h.sample(w.x, w.z, 'water').height;
              assert.ok(bed >= V5_PIER_BED_LOWER - 1e-12);
              assert.ok(bed - bottom >= V5_PIER_EMBED - 1e-12);
            }
        }
    }
    for (let z = 0; z <= 192; z += 7.125)
      for (let x = 0; x <= 192; x += 9.375)
        assert.ok(h.sample(x, z, 'water').height >= V5_PIER_BED_LOWER - 1e-12);
  }
  assert.equal(
    turns.size,
    4,
    'Complete footprint geometry is probed through all four rotation transforms',
  );
});

test('actual v5 ModelFactory places only four collinear lower continuations in both dock variants without making submerged supports selectable', () => {
  const f = factory();
  for (const simple of [true, false]) {
    const b = { ...dock, ...(!simple ? { dockStyle: undefined } : {}) },
      root = f.building(b, 100000, seed, 5, []),
      feet = footingNodes(root);
    assert.equal(feet.length, 4);
    assert.equal(root.getChildByName('RotatedPier').rotation[1], b.rotation * 90);
    for (const [i, n] of feet.entries()) {
      const p = v5PierFootings(simple, 2)[i],
        surface = worldSurface(n),
        w = worldPoint(b, p.x, p.z);
      assert.ok(Math.abs(surface.bounds.min[1] + 1.71) < 1e-12);
      assert.ok(Math.abs(surface.bounds.max[1] - V5_PIER_FOOT_TOP) < 1e-12);
      const ray = { o: { x: w.x - 1, y: p.y, z: w.z }, d: { x: 1, y: 0, z: 0 } };
      assert.ok(surface.distance(ray) > 0, 'Actual lower support geometry exists');
      assert.equal(
        new ModelPicking(n).distance(ray),
        null,
        'Do not select supports through opaque water',
      );
    }
    assert.ok(
      new ModelPicking(root).distance({
        o: { x: b.x + 1, y: 10, z: b.z + 1 },
        d: { x: 0, y: -1, z: 0 },
      }) > 0,
      'Original visible dock remains selectable',
    );
    const pier = root.getChildByName('RotatedPier');
    assert.equal(
      simple
        ? pier.children.filter((n) => n.name === 'PierExtension').length
        : pier.children.filter((n) => n.name === 'PierPile').length,
      simple ? 1 : 4,
    );
  }
  const keys = [...f.assets.meshes.keys()].sort();
  for (let i = 0; i < 50; i++) f.building({ ...dock, id: `moved-${i}` }, 100000, seed, 5, []);
  assert.deepEqual([...f.assets.meshes.keys()].sort(), keys);
  assert.equal(f.meshes.size, 1, 'Legacy pier boxes share one unit mesh');
  assert.equal(keys.filter((k) => k === 'v5-pier-foot-unit').length, 1);
  f.dispose();
});

test('terrain v1–v4 and illegal new-v5 shores do not receive any new foot nodes', () => {
  const f = factory();
  for (const version of [1, 2, 3, 4]) {
    let b;
    for (let z = 0; z < g.worldSize(version) && !b; z++)
      for (let x = 0; x < g.worldSize(version) && !b; x++) {
        const candidate = { ...dock, x, z, rotation: 0, dockStyle: undefined };
        if (g.isDockShore(candidate, seed, version, [])) b = candidate;
      }
    assert.ok(b);
    const root = f.building(b, 100000, seed, version, []);
    assert.ok(root.getChildByName('RotatedPier'));
    assert.equal(footingNodes(root).length, 0);
    assert.equal(
      root.getChildByName('RotatedPier').children.filter((n) => n.name === 'PierPile').length,
      4,
    );
  }
  const invalid = f.building({ ...dock, x: 0, z: 0 }, 100000, seed, 5, []);
  assert.equal(invalid.getChildByName('RotatedPier'), null);
  assert.equal(footingNodes(invalid).length, 0);
  f.dispose();
});
