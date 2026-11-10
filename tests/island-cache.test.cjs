const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { ContinuousResources } = require('../.domain-build/art/ContinuousResources');
const coast = require('../.domain-build/art/ContinuousCoast');
const water = require('../.domain-build/art/CoastalWater');
const { emptyNaturalMesh } = require('../.domain-build/art/NaturalMesh');
const geometry = require('../.domain-build/domain/geometry');
function load(source, dependencies) {
  const code = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      experimentalDecorators: true,
    },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (dependencies[id]) return dependencies[id];
      if (id.startsWith('../')) return require('../.domain-build/' + id.slice(3));
      if (id.startsWith('./'))
        return load(path.join(path.dirname(source), `${id}.ts`), dependencies);
      throw new Error(`Unexpected dependency ${id}`);
    },
    module,
    module.exports,
  );
  return module.exports;
}
test('only actual shoreline protection changes rebuild coast/water; inland edits keep cached layers', () => {
  let queries = 0,
    fields = 0,
    coasts = 0,
    waters = 0,
    destroyed = 0,
    uploads = 0,
    detailBuilds = 0;
  class Renderer {
    static ShadowCastingMode = { OFF: 0, ON: 1 };
    static ShadowReceivingMode = { OFF: 0, ON: 1 };
    setMaterial() {}
  }
  class Motion {
    configure() {
      waters++;
    }
    onDestroy() {}
  }
  class Node {
    addChild() {}
    addComponent(Type) {
      const c = new Type();
      c.node = this;
      return c;
    }
  }
  class Material {
    initialize() {}
    setProperty() {}
    destroy() {}
  }
  const deps = {
    '../application/DropGeometry': require('../.domain-build/application/DropGeometry'),
    '../domain/game': require('../.domain-build/domain/game'),
    './DropSupport': require('./helpers/selection-ui.cjs').load('DropSupport'),
    cc: {
      Node,
      MeshRenderer: Renderer,
      Material,
      EffectAsset: { get: () => null },
      Color: class {},
      utils: {
        createMesh(data) {
          uploads++;
          return {
            ...data,
            destroy() {
              destroyed++;
            },
          };
        },
      },
    },
    '../art/ContinuousResources': {
      ContinuousResources: class extends ContinuousResources {
        constructor(...args) {
          super(...args);
          fields++;
        }
      },
    },
    '../art/ContinuousCoast': {
      ...coast,
      buildContinuousCoast(...args) {
        coasts++;
        return coast.buildContinuousCoast(...args);
      },
    },
    '../art/CoastalWater': water,
    '../art/MeshChunks': require('../.domain-build/art/MeshChunks'),
    './CoastalWaterMotion': { CoastalWaterMotion: Motion },
    '../domain/terrain': {
      terrainAt(x, z) {
        queries++;
        return { biome: 'mountain', elevation: x === 2 && z === 2 ? 2 : 0 };
      },
    },
    '../domain/geometry': geometry,
    '../domain/world': require('../.domain-build/domain/world'),
    '../art/SceneGroundArt': {
      sceneGroundArt: () => {
        detailBuilds++;
        return emptyNaturalMesh();
      },
    },
  };
  // Run the real material adapter against this test's explicit render-resource doubles.
  // This is cache/lifetime coverage, not a GPU or Cocos rendering claim.
  deps['./WorldMaterial'] = load('assets/scripts/presentation/WorldMaterial.ts', { cc: deps.cc });
  deps['./WorldMesh'] = load('assets/scripts/presentation/WorldMesh.ts', { cc: deps.cc });
  const { IslandView } = load('assets/scripts/presentation/IslandView.ts', deps);
  const view = new IslandView(new Node(), 40);
  const state = {
    mapSeed: 1,
    terrainVersion: 3,
    landExtensions: [],
    naturalResources: [],
    groundStacks: [],
    buildings: [],
    trees: [],
  };
  view.sync(state);
  assert.equal(queries, 1600);
  assert.equal(fields, 1);
  assert.equal(coasts, 1);
  assert.equal(waters, 1);
  const initialUploads = uploads;
  view.sync(state);
  assert.equal(uploads, initialUploads);
  state.naturalResources = [{ id: 'n2_2', x: 2, z: 2, kind: 'stone', amount: 2 }];
  view.sync(state);
  const full = view.naturalSurface.resources[0].center[1];
  state.naturalResources[0].amount = 1;
  view.sync(state);
  assert.ok(full > view.naturalSurface.resources[0].center[1]);
  assert.equal(queries, 1600);
  assert.equal(fields, 1);
  assert.equal(coasts, 1);
  assert.equal(waters, 1);
  const positions = view.naturalSurface.positions;
  state.buildings = [{ id: 'farm', kind: 'farm', x: 0, z: 0, rotation: 0, farmSize: 1 }];
  view.sync(state);
  assert.equal(coasts, 2);
  assert.equal(waters, 2);
  assert.equal(view.naturalSurface.positions, positions);
  view.sync(state);
  assert.equal(coasts, 2, 'new curve stores its own protection signature immediately');
  for (const change of [{ x: 1 }, { rotation: 1 }, { farmSize: 6 }, { kind: 'warehouse' }]) {
    Object.assign(state.buildings[0], change);
    view.sync(state);
  }
  assert.equal(coasts, 5, 'square-footprint rotation does not change shoreline protection');
  assert.equal(waters, 5);
  assert.equal(queries, 1600);
  assert.equal(fields, 1);
  const coastalBuilding = state.buildings[0];
  const inlandBuilding = { id: 'inland', kind: 'farm', x: 15, z: 15, rotation: 0, farmSize: 1 };
  state.buildings.push(inlandBuilding);
  view.sync(state);
  const detailsBefore = detailBuilds;
  for (const change of [{ x: 16 }, { rotation: 1 }, { farmSize: 6 }, { kind: 'warehouse' }]) {
    Object.assign(inlandBuilding, change);
    const serialized = JSON.stringify(state);
    view.sync(state);
    assert.equal(JSON.stringify(state), serialized, 'rendering never changes the save');
    assert.equal(coasts, 5);
    assert.equal(waters, 5);
    assert.equal(view.naturalSurface.positions, positions);
  }
  assert.equal(detailBuilds, detailsBefore + 4, 'ground details still follow inland buildings');
  state.buildings.reverse();
  view.sync(state);
  state.buildings = [coastalBuilding];
  view.sync(state);
  assert.equal(coasts, 5, 'order changes and inland removal do not alter coast');
  coastalBuilding.x = 18;
  coastalBuilding.z = 18;
  view.sync(state);
  assert.equal(coasts, 6, 'leaving the coast removes its old protection');
  coastalBuilding.x = 20;
  view.sync(state);
  assert.equal(coasts, 6);
  coastalBuilding.x = 38;
  coastalBuilding.z = 10;
  coastalBuilding.kind = 'dock';
  view.sync(state);
  assert.equal(coasts, 7, 'entering the coast adds protection');
  for (const rotation of [0, 1, 2, 3]) {
    coastalBuilding.rotation = rotation;
    view.sync(state);
  }
  assert.equal(coasts, 7, 'the dock margin already protects exits in all four directions');
  assert.equal(waters, 7);
  state.naturalResources = [];
  view.sync(state);
  assert.equal(view.naturalSurface.resources.length, 0);
  state.mapSeed = 2;
  view.sync(state);
  assert.equal(queries, 3200);
  assert.equal(fields, 2);
  state.terrainVersion = 2;
  view.sync(state);
  assert.equal(queries, 4800);
  assert.equal(fields, 3);
  state.landExtensions = [{ x: 1, z: 2 }];
  view.sync(state);
  assert.equal(queries, 6400);
  assert.equal(fields, 4);
  assert.equal(coasts, 10, 'seed/version/land changes always rebuild topology');
  assert.equal(waters, 10);
  view.dispose();
  assert.equal(view.surfaceCells.size, 0);
  assert.ok(destroyed >= 8);
  assert.equal(view.naturalSurface.resources.length, 0);
});
test('water updates only reusable water arrays at 20 Hz and retains required Cocos dynamic indices', () => {
  let created = 0,
    updated = 0,
    destroyed = 0,
    last,
    first;
  const deps = {
    '../application/DropGeometry': require('../.domain-build/application/DropGeometry'),
    '../domain/game': require('../.domain-build/domain/game'),
    './DropSupport': require('./helpers/selection-ui.cjs').load('DropSupport'),
    cc: {
      _decorator: { ccclass: () => (Type) => Type },
      Component: class {},
      utils: {
        MeshUtils: {
          createDynamicMesh(index, data, existing, options) {
            created++;
            assert.equal(existing, undefined);
            assert.equal(options.maxSubMeshes, 1);
            assert.equal(options.maxSubMeshVertices, data.positions.length / 3);
            assert.equal(options.maxSubMeshIndices, data.indices16.length);
            first = data;
            return {
              updateSubMesh(index, value) {
                assert.equal(value.indices16, first.indices16);
                assert.equal(value.positions, first.positions);
                assert.equal(value.colors, first.colors);
                updated++;
                last = value;
              },
              destroy() {
                destroyed++;
              },
            };
          },
        },
      },
    },
    '../art/CoastalWater': water,
  };
  const { CoastalWaterMotion } = load('assets/scripts/presentation/CoastalWaterMotion.ts', deps),
    motion = new CoastalWaterMotion(),
    renderer = { mesh: null };
  const data = water.buildCoastalWater(40, 17, []),
    serialized = JSON.stringify(data);
  assert.ok(data.positions.length / 3 > 1024, 'exercise the Cocos default capacity boundary');
  assert.ok(data.indices.length > 1024);
  motion.configure(renderer, data, 17);
  const before = first.positions.slice();
  motion.update(0.01);
  assert.equal(updated, 0);
  motion.update(0.04);
  assert.equal(updated, 1);
  assert.notDeepEqual(last.positions, before);
  for (const dt of [NaN, Infinity, -1, 0]) motion.update(dt);
  assert.equal(updated, 1);
  for (let n = 0; n < 100; n++) motion.update(0.05);
  assert.ok([...last.positions, ...last.colors].every(Number.isFinite));
  assert.equal(JSON.stringify(data), serialized);
  assert.equal(created, 1);
  const priorPhase = last.positions.slice();
  motion.configure(renderer, data, 17);
  assert.deepEqual(first.positions, priorPhase, 'coast refresh retains the current water phase');
  assert.equal(created, 2);
  assert.equal(destroyed, 1);
  motion.onDestroy();
  assert.equal(destroyed, 2);
  assert.equal(renderer.mesh, null);
  motion.onDestroy();
  assert.equal(destroyed, 2);
});
