/** Real production gesture routing/domain/save commits, with narrow node recording. Not WebGL. */
const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  ts = require('typescript');
const g = require('../.domain-build/domain/game');
const { GameSession } = require('../.domain-build/application/GameSession');
const { load } = require('./helpers/selection-ui.cjs');
const { createUiState } = load('UiContracts');
const { BRIDGE_ROOT_HEIGHT } = require('../.domain-build/art/WoodenBridgeKit');
class Node {
  children = [];
  active = true;
  constructor(name) {
    this.name = name;
  }
  addChild(n) {
    this.children.push(n);
    n.parent = this;
  }
  setPosition(x, y, z) {
    this.position = { x, y, z };
  }
  destroy() {
    this.destroyed = true;
    this.active = false;
  }
}
class Vec3 {
  constructor(x, y, z) {
    Object.assign(this, { x, y, z });
  }
}
class Factory {
  building(b) {
    const n = new Node(b.id);
    n.building = structuredClone(b);
    const f = g.footprint(b);
    n.setPosition(
      b.x + f.width / 2,
      b.kind === 'woodenBridge' ? BRIDGE_ROOT_HEIGHT : 0,
      b.z + f.depth / 2,
    );
    return n;
  }
  shape(parent, name, x, y, z, sx, sy, sz) {
    const n = new Node(name);
    Object.assign(n, { position: { x, y, z }, size: { sx, sy, sz } });
    parent.addChild(n);
    return n;
  }
  dispose() {}
}
const cache = {};
function actual(name) {
  if (cache[name]) return cache[name];
  const m = { exports: {} };
  const code = ts.transpileModule(
    fs.readFileSync(`assets/scripts/presentation/${name}.ts`, 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  new Function('require', 'module', 'exports', code)(
    (id) =>
      id === 'cc'
        ? { Node, Vec3 }
        : id === './ModelFactory'
          ? { ModelFactory: Factory }
          : id.startsWith('../')
            ? require('../.domain-build/' + id.slice(3))
            : actual(id.slice(2)),
    m,
    m.exports,
  );
  return (cache[name] = m.exports);
}
const { BuildingDrag } = actual('BuildingDrag');
const baseline = g.createBridgeDemo(100000);
function fixture(reverse = false) {
  const values = new Map(),
    storage = {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => values.set(k, v),
      removeItem: (k) => values.delete(k),
    };
  const session = new GameSession(
    storage,
    () => 100000,
    () => structuredClone(baseline),
  );
  session.save();
  const ui = createUiState(),
    root = new Node('world');
  const piers = session.state.buildings
    .filter((b) => b.kind === 'woodenPier')
    .sort((a, b) => a.x - b.x);
  const source = piers[reverse ? 1 : 0],
    target = piers[reverse ? 0 : 1];
  const town = {
    pickBuilding: (r, exclude) => (r.id !== exclude ? (r.id ?? null) : null),
    pickTree: () => null,
    pickNatural: () => null,
    pickDrop: () => null,
    setLifted(id) {
      this.lifted = id;
    },
  };
  const drag = new BuildingDrag(root, session, ui, town, () => {});
  const ray = (b) => ({
    id: b?.id,
    o: { x: (b?.x ?? 110) + 1, y: 20, z: (b?.z ?? 110) + 1 },
    d: { x: 0, y: -1, z: 0 },
  });
  const begin = () => {
    assert.equal(drag.candidate(ray(source)), source.id);
    drag.move(source.id, { x: source.x + 1, y: 0, z: source.z + 1 }, ray(source));
  };
  const move = (b) => drag.move(source.id, { x: b.x + 1, y: 0, z: b.z + 1 }, ray(b));
  return { session, ui, root, source, target, drag, ray, begin, move, values, storage };
}
for (const reverse of [false, true])
  test(`real ${reverse ? 'reverse' : 'forward'} pier drag previews the whole span, commits no coins and focuses geometric near ID`, () => {
    const f = fixture(reverse),
      before = g.exportSave(f.session.state),
      saved = [...f.values],
      coins = f.session.state.coins;
    f.begin();
    f.move(f.target);
    assert.equal(g.exportSave(f.session.state), before);
    assert.deepEqual([...f.values], saved);
    const preview = f.root.children.find((n) => n.name === 'BridgeMergePreview' && n.active);
    assert.ok(preview);
    assert.equal(preview.building.bridge.length, 15);
    assert.deepEqual(g.footprint(preview.building), { width: 15, depth: 2 });
    assert.equal(preview.position.y, BRIDGE_ROOT_HEIGHT);
    assert.equal(preview.position.x, 140.5);
    assert.equal(f.session.message, '松手合成');
    assert.doesNotMatch(f.session.message, /20|币/);
    const ring = f.root.children.filter((n) => n.name === 'BuildingDropTarget' && n.active).at(-1);
    assert.ok(ring.children.some((n) => n.size.sx === 15.1));
    f.drag.drop(f.source.id, f.ray(f.target));
    const bridge = f.session.state.buildings.find((b) => b.kind === 'woodenBridge');
    assert.ok(bridge);
    assert.equal(bridge.id, [f.source, f.target].sort((a, b) => a.x - b.x)[0].id);
    assert.equal(f.ui.selected, bridge.id);
    assert.equal(f.session.state.coins, coins);
    assert.deepEqual(new GameSession(f.storage, () => 100000).state, f.session.state);
  });
for (const side of ['source', 'target'])
  for (const change of ['move', 'rotate', 'kind', 'remove', 'restore'])
    test(`observed ${side} ${change} cannot refresh a locked bridge snapshot on release`, () => {
      const f = fixture();
      f.begin();
      f.move(f.target);
      const b = f[side],
        original = structuredClone(b);
      if (change === 'remove')
        f.session.state.buildings = f.session.state.buildings.filter((v) => v.id !== b.id);
      else if (change === 'rotate') b.rotation = 1;
      else if (change === 'kind') b.kind = 'crate';
      else b.x++;
      f.move(f.target);
      if (side === 'source' && change === 'remove') {
        assert.ok(
          f.root.children
            .filter((n) =>
              ['BridgeMergePreview', 'BuildingDropTarget', 'BuildingLift'].includes(n.name),
            )
            .every((n) => !n.active || n.destroyed),
          'Removed source immediately clears every old valid preview',
        );
        f.session.state.buildings.push(original);
        f.move(f.target);
        assert.ok(
          !f.root.children.some((n) => n.name === 'BridgeMergePreview' && n.active),
          'Restoring the same ID cannot re-arm the invalid snapshot',
        );
      }
      if (change === 'restore') Object.assign(b, original);
      const before = JSON.stringify(f.session.state),
        saved = [...f.values];
      f.drag.drop(f.source.id, f.ray(f.target));
      assert.equal(JSON.stringify(f.session.state), before);
      assert.deepEqual([...f.values], saved);
      assert.equal(
        f.session.state.buildings.some((b) => b.kind === 'woodenBridge'),
        false,
      );
    });
test('first actual second pier stays locked; third pier and empty ground cannot replace it', () => {
  const f = fixture();
  f.begin();
  f.move(f.target);
  const third = { ...f.target, id: 'b999999', x: 170 };
  f.session.state.buildings.push(third);
  const before = JSON.stringify(f.session.state);
  f.move(third);
  f.drag.drop(f.source.id, f.ray(third));
  assert.equal(JSON.stringify(f.session.state), before);
  const k = fixture();
  k.begin();
  k.move(k.target);
  const old = g.exportSave(k.session.state);
  k.drag.drop(k.source.id, k.ray());
  assert.equal(g.exportSave(k.session.state), old);
});
test('cancel, covered UI and repeated release never consume either pier', () => {
  for (const way of ['cancel', 'covered']) {
    const f = fixture(),
      before = g.exportSave(f.session.state),
      saved = [...f.values];
    f.begin();
    f.move(f.target);
    if (way === 'cancel') f.drag.clear();
    else f.drag.move(f.source.id, { x: 0, y: 0, z: 0 }, null);
    f.drag.drop(f.source.id, null);
    f.drag.drop(f.source.id, f.ray(f.target));
    assert.equal(g.exportSave(f.session.state), before);
    assert.deepEqual([...f.values], saved);
  }
});
test('bridge movement includes its captured source and whole span; invalid turn and move preserve save', () => {
  const f = fixture();
  f.begin();
  f.move(f.target);
  f.drag.drop(f.source.id, f.ray(f.target));
  const b = f.session.state.buildings.find((b) => b.kind === 'woodenBridge');
  f.drag.candidate(f.ray(b));
  f.drag.move(b.id, { x: b.x + 1, y: 0, z: b.z + 1 }, f.ray(b));
  const command = f.drag.command(b, f.ray(b));
  assert.equal(command.type, 'moveBuilding');
  assert.deepEqual(command.source, {
    id: b.id,
    kind: b.kind,
    x: b.x,
    z: b.z,
    rotation: b.rotation,
  });
  const before = g.exportSave(f.session.state),
    saved = [...f.values];
  assert.equal(f.session.run({ type: 'rotateBuilding', buildingId: b.id }), false);
  assert.equal(g.exportSave(f.session.state), before);
  assert.deepEqual([...f.values], saved);
  f.drag.drop(b.id, f.ray({ x: 100, z: 100 }));
  assert.equal(g.exportSave(f.session.state), before);
  assert.deepEqual([...f.values], saved);
});
