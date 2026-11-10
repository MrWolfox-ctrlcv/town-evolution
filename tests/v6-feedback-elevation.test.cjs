/** Production collection/feedback wiring with narrow CPU adapters; not Cocos/GPU evidence. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { collectionOrigin } = require('../.domain-build/application/Collections');
const { farmBoxCell } = require('../.domain-build/domain/game');
const { farmCellCenter } = require('../.domain-build/application/FarmCells');
const {
  v6TreeRoot,
  v5TreeVisual,
  V6TreeBatchBuilder,
} = require('../.domain-build/art/V6TreeGeometry');
function load(folder, name, overrides = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(`assets/scripts/${folder}/${name}.ts`, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      experimentalDecorators: true,
    },
  }).outputText;
  new Function('require', 'module', 'exports', code)(
    (id) =>
      overrides[id] ?? (id.startsWith('../') ? require(`../.domain-build/${id.slice(3)}`) : {}),
    module,
    module.exports,
  );
  return module.exports;
}
class Node {
  children = [];
  position = { x: 0, y: 0, z: 0 };
  constructor(name = '') {
    this.name = name;
  }
  addChild(node) {
    this.children.push(node);
  }
  setPosition(x, y, z) {
    this.position = { x, y, z };
  }
  setScale(...scale) {
    this.scale = scale;
  }
  setRotationFromEuler(...rotation) {
    this.rotation = rotation;
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
  shape(parent, name, x, y, z) {
    const n = new Node(name);
    n.setPosition(x, y, z);
    parent.addChild(n);
    return n;
  }
  dispose() {}
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const event = (command, before) => ({ command, before, gains: [{ kind: 'wood', amount: 2 }] });
test('elevated building, rotated farm cell and collection box sources add base height exactly once', () => {
  for (const size of [3, 6])
    for (const rotation of [0, 1, 2, 3]) {
      const farm = {
        id: 'f',
        kind: 'farm',
        x: 40,
        z: 50,
        rotation,
        ...(size === 6 ? { farmSize: 6 } : {}),
        collectionBox: { stock: { rice: 2 } },
      };
      for (const command of [
        { type: 'harvestCell', buildingId: 'f', cell: size * size - 1 },
        { type: 'withdrawFarmBox', buildingId: 'f', item: 'rice', quantity: 1 },
        { type: 'collect', buildingId: 'f' },
      ]) {
        const low = collectionOrigin(event(command, { buildings: [farm] }));
        const high = collectionOrigin(
          event(command, { buildings: [{ ...farm, baseElevation: 8.015 }] }),
        );
        assert.ok(low && high);
        assert.equal(high.x, low.x);
        assert.equal(high.z, low.z);
        near(high.y - low.y, 8.015);
        const p =
          command.type === 'harvestCell'
            ? farmCellCenter(farm, command.cell)
            : command.type === 'withdrawFarmBox'
              ? farmBoxCell(farm)
              : null;
        if (p) {
          near(high.x, p.x + (command.type === 'withdrawFarmBox' ? 0.5 : 0));
          near(high.z, p.z + (command.type === 'withdrawFarmBox' ? 0.5 : 0));
        }
      }
    }
  const building = { id: 'w', kind: 'warehouse', x: 1, z: 2, rotation: 0, baseElevation: 9.015 };
  near(
    collectionOrigin(event({ type: 'collect', buildingId: 'w' }, { buildings: [building] })).y,
    10.015,
  );
});
test('high pile collection resolves its lifted saved node before refresh removes it, without legacy drift', () => {
  const { GroundObjects } = load('presentation', 'GroundObjects');
  const resources = Object.create(GroundObjects.prototype);
  const position = { x: 40.5, y: 8.024, z: 50.5 };
  resources.piles = [{ x: 40, z: 50, ready: true, node: { active: false, position } }];
  const { TownView } = load('presentation', 'TownView');
  const town = Object.assign(Object.create(TownView.prototype), { resources });
  assert.equal(town.stackOrigin(40, 50), position);
  const { bindCollections } = load('presentation', 'CollectionBinding');
  for (const command of [
    { type: 'pickupStack', x: 40, z: 50 },
    { type: 'pickupProduct', x: 40, z: 50, item: 'wood' },
    { type: 'useTool', tool: 'saw', x: 40, z: 50 },
  ]) {
    resources.piles[0] = { x: 40, z: 50, ready: true, node: { active: false, position } };
    const e = event(command, { terrainVersion: 6 }),
      flights = [];
    let listener;
    bindCollections(
      {
        setCollectionListener(fn) {
          listener = fn;
        },
      },
      { project: (p) => ({ x: p.x, y: p.y - p.z }) },
      { collect: (...args) => flights.push(args) },
      () => {
        resources.piles = [];
      },
      town,
    );
    listener(e);
    assert.deepEqual(flights, [['wood', 2, { x: 40.5, y: 8.024 - 50.5 }]]);
    assert.equal(town.stackOrigin(40, 50), null);
    assert.equal(
      collectionOrigin(e),
      null,
      'No invented zero-plane height when geometry is absent',
    );
    assert.deepEqual(
      collectionOrigin(event(command, { terrainVersion: 5 }), undefined, undefined, () => position),
      { x: 40.5, y: 0.4, z: 50.5 },
    );
  }
  resources.piles = [{ x: 40, z: 50, ready: false, node: { position } }];
  assert.equal(town.stackOrigin(40, 50), null, 'Unresolved support is not a collection origin');
});
test('terrain6 flight and falling tree share the exact offset standing-tree root on slopes', () => {
  const samples = [],
    height = (x, z) => 8 + x * 0.03 + z * 0.07;
  const surface = {
    heightInCell(x, z, ownerX, ownerZ) {
      samples.push([x, z, ownerX, ownerZ]);
      return height(x, z);
    },
  };
  const deps = { '../domain/v6-edit-surface': { getV6EditSurface: () => surface } };
  const { collectionOrigin: origin } = load('application', 'Collections', deps);
  const { townChanges } = load('presentation', 'TownChanges', deps);
  const tree = { id: 't', x: 40, z: 50 },
    seed = 1937;
  const before = {
    terrainVersion: 6,
    mapSeed: seed,
    trees: [tree],
    groundStacks: [],
    buildings: [],
  };
  const root = v6TreeRoot(seed, tree.x, tree.z, height);
  assert.deepEqual(origin(event({ type: 'useTool', tool: 'axe', treeId: 't' }, before)), {
    ...root,
    y: root.y + 1,
  });
  class Component {
    node = new Node();
  }
  const { TownFeedback } = load('presentation', 'TownFeedback', {
    cc: {
      Node,
      Component,
      isValid: (n) => !n.destroyed,
      _decorator: { ccclass: () => (c) => c },
    },
  });
  const feedback = new TownFeedback();
  feedback.configure(new Factory());
  townChanges(before, { ...before, trees: [] }, feedback, () => null);
  const effect = feedback.node.children[0],
    falling = effect.children[0];
  assert.deepEqual(effect.position, root);
  const visual = v5TreeVisual(seed, tree.x, tree.z);
  assert.equal(falling.asset, visual.asset);
  assert.deepEqual(falling.scale, visual.scale);
  assert.deepEqual(falling.rotation, [0, visual.yaw, 0]);
  assert.deepEqual(samples, Array(2).fill([root.x, root.z, tree.x, tree.z]));
  const builder = new V6TreeBatchBuilder(seed, [{ ...tree, stage: 3 }], false, height);
  builder.append();
  const batch = builder.finish();
  assert.deepEqual(batch.anchors, [root]);
  near(batch.surfaces.get('t').bounds.min[1], root.y);
  feedback.update(0.81);
  assert.equal(effect.destroyed, true);
  assert.equal(feedback.effects.length, 0);
});
test('high pile and farm-box pulses use real support, preserve legacy heights and do not repeat', () => {
  const { townChanges } = load('presentation', 'TownChanges');
  const previous = {
    terrainVersion: 6,
    mapSeed: 1,
    trees: [],
    groundStacks: [],
    buildings: [
      {
        id: 'f',
        kind: 'farm',
        x: 40,
        z: 50,
        rotation: 1,
        baseElevation: 8.015,
        collectionBox: { stock: { rice: 0 } },
      },
    ],
  };
  const state = structuredClone(previous);
  state.groundStacks = [{ x: 10, z: 20, item: 'wood', amount: 2 }];
  state.buildings[0].collectionBox.stock.rice = 2;
  const calls = [],
    point = { x: 10.5, y: 7.024, z: 20.5 };
  const feedback = {
    stack: (...a) => calls.push(['stack', ...a]),
    drop: (...a) => calls.push(['drop', ...a]),
  };
  townChanges(previous, state, feedback, { dropOrigin: () => null, stackOrigin: () => point });
  assert.deepEqual(calls[0], ['stack', 10, 20, point]);
  near(calls[1][1].y, 8.615);
  townChanges(state, state, feedback, { dropOrigin: () => null, stackOrigin: () => point });
  assert.equal(calls.length, 2);
  calls.length = 0;
  townChanges(previous, state, feedback, { dropOrigin: () => null, stackOrigin: () => null });
  assert.equal(calls.length, 1, 'No ground-plane pulse for an unsupported high pile');
  const oldBefore = { ...previous, terrainVersion: 5, buildings: [] };
  townChanges(oldBefore, { ...state, terrainVersion: 5, buildings: [] }, feedback, () => null);
  assert.deepEqual(calls[1], ['stack', 10, 20]);
});
test('plant and harvest highlights follow every rotated field cell at its saved elevation', () => {
  const { FarmTools } = load('presentation', 'FarmTools', {
    cc: { Node },
    './ModelFactory': { ModelFactory: Factory },
  });
  for (const kind of ['plant', 'harvest'])
    for (const size of [3, 6])
      for (const rotation of [0, 1, 2, 3])
        for (const elevation of [undefined, 8.015]) {
          const farm = {
            id: 'f',
            kind: 'farm',
            x: 40,
            z: 50,
            rotation,
            ...(size === 6 ? { farmSize: 6 } : {}),
            ...(elevation === undefined ? {} : { baseElevation: elevation }),
          };
          const tools = new FarmTools(
            new Node(),
            { mode: 'normal', state: { buildings: [farm] }, reason: () => null },
            { cancelGesture() {} },
            {},
            () => {},
          );
          tools.begin(kind, 1, { x: 0, y: 0 });
          assert.equal(tools.highlights.children.length, size * size);
          for (let cell = 0; cell < size * size; cell++)
            assert.deepEqual(tools.highlights.children[cell].position, {
              ...farmCellCenter(farm, cell),
              y: (elevation ?? 0) + 0.18,
            });
          const highlights = tools.highlights;
          tools.cancel();
          assert.equal(highlights.destroyed, true);
        }
});
