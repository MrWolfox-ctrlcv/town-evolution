/** Canonical CPU geometry and production streaming queues, not GPU/mobile evidence. */
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  ts = require('typescript');
const g = require('../.domain-build/domain/game');
const { TreeStreaming } = require('../.domain-build/application/TreeStreaming');
const { TreeBatchBuilder, v5TreeVisual } = require('../.domain-build/art/V5TreeGeometry');
const { MeshSurface } = require('../.domain-build/application/MeshSurface');
const whole = { minX: 0, minZ: 0, maxX: 192, maxZ: 192 };
const world = g.createGame(100000, 42173, 5);
function fixture(state = world) {
  const published = new Map(),
    removed = [];
  const stream = new TreeStreaming(
    (key, batch) => published.set(key, batch),
    (key) => {
      published.delete(key);
      removed.push(key);
    },
  );
  stream.sync(state, state.lastSeenAt);
  return { stream, published, removed };
}
function drain(f, bounds = whole) {
  for (let i = 0; i < 3000; i++) {
    f.stream.frame(bounds, { maxTrees: 24, maxMilliseconds: 2, maxUploadBytes: 262144 }, () => 0);
    if ([...f.stream.surfaces()].length === f.expected) return;
  }
  throw Error('Tree coverage did not converge');
}
const ids = (stream) => [...stream.surfaces()].map(([id]) => id).sort();
test('v5 initialization does not build the whole forest; per-frame tree and upload budgets defer publication', () => {
  const f = fixture();
  assert.equal(f.published.size, 0);
  assert.equal(ids(f.stream).length, 0);
  for (const budget of [{ maxTrees: 0 }, { maxMilliseconds: 0 }]) {
    f.stream.frame(whole, budget, () => 0);
    assert.equal(f.published.size, 0);
  }
  const isolated = { ...world, trees: world.trees.slice(0, 1) };
  const q = fixture(isolated);
  q.stream.frame(whole, { maxTrees: 1, maxUploadBytes: 0 }, () => 0);
  assert.equal(q.published.size, 0, 'No upload credit cannot publish');
  q.stream.frame(whole, { maxTrees: 1, maxUploadBytes: 1000000 }, () => 0);
  assert.deepEqual(ids(q.stream), [isolated.trees[0].id]);
});
test('whole-island overview converges to every actual saved tree, not a fixed four-chunk subset', () => {
  const before = g.exportSave(world),
    f = fixture();
  f.expected = world.trees.length;
  drain(f);
  assert.ok(world.trees.length > 1500);
  assert.ok(f.published.size > 4);
  assert.deepEqual(ids(f.stream), world.trees.map((t) => t.id).sort());
  assert.equal(g.exportSave(world), before);
  for (const batch of f.published.values()) assert.ok(batch.mesh.positions.every(Number.isFinite));
});
test('offscreen meshes recycle and an actually chopped ID never resurrects when the camera returns', () => {
  const f = fixture();
  f.expected = world.trees.length;
  drain(f);
  const tree = world.trees[0];
  const result = g.dispatch(
    world,
    { type: 'useTool', tool: 'axe', treeId: tree.id },
    world.lastSeenAt,
  );
  assert.equal(result.ok, true, result.error);
  f.stream.sync(result.state, result.state.lastSeenAt);
  assert.ok(
    !ids(f.stream).includes(tree.id),
    'Deleted identity stops rendering/picking immediately',
  );
  f.stream.frame({ minX: -100, minZ: -100, maxX: -90, maxZ: -90 }, {}, () => 0);
  assert.equal(f.published.size, 0);
  assert.equal(ids(f.stream).length, 0);
  f.expected = result.state.trees.length;
  drain(f);
  assert.deepEqual(ids(f.stream), result.state.trees.map((t) => t.id).sort());
  f.stream.dispose();
  assert.equal(f.published.size, 0);
  assert.equal(ids(f.stream).length, 0);
  f.stream.frame(whole, {}, () => 0);
  assert.equal(f.published.size, 0);
});
test('staged work is discarded on seed change, displacement and offscreen cancellation', () => {
  const t = world.trees[0],
    state = { ...world, trees: [t, { ...t, id: 'another', x: t.x + 1 }] };
  const f = fixture(state);
  f.stream.frame(whole, { maxTrees: 1, maxUploadBytes: 0 }, () => 0);
  assert.equal(f.published.size, 0);
  const next = { ...state, mapSeed: 42174, trees: [{ ...t, id: 'replacement', x: 10, z: 10 }] };
  f.stream.sync(next, next.lastSeenAt);
  f.expected = 1;
  drain(f);
  assert.deepEqual(ids(f.stream), ['replacement']);
  assert.ok(
    !f.published.has(`${Math.floor(t.x / 16)}:${Math.floor(t.z / 16)}`) ||
      Math.floor(t.x / 16) === 0,
  );
});
test('near/far geometry preserves the lab seed offset and exposes exact visible triangles for each true ID', () => {
  const tree = { id: 't1', x: 45, z: 86, stage: 3 };
  const visual = v5TreeVisual(42173, tree.x, tree.z);
  // Golden values captured from the approved isolated generator-v2 lab, no external test dependency.
  assert.deepEqual(visual.scale, [1.5194571620970965, 1.6906426821742206, 1.3562018714752049]);
  assert.deepEqual(visual.offset, [-0.06758441078476608, 0, -0.09347668012604118]);
  const near = new TreeBatchBuilder(42173, [tree], false),
    far = new TreeBatchBuilder(42173, [tree], true);
  near.append();
  far.append();
  const a = near.finish(),
    b = far.finish();
  assert.ok(b.mesh.indices.length < a.mesh.indices.length);
  for (const batch of [a, b]) {
    const exact = batch.surfaces.get(tree.id),
      combined = new MeshSurface(batch.mesh.positions, batch.mesh.indices);
    for (let x = tree.x - 1; x <= tree.x + 2; x += 0.1) {
      const ray = { o: { x, y: 10, z: tree.z + 0.5 }, d: { x: 0, y: -1, z: 0 } };
      assert.equal(exact.distance(ray), combined.distance(ray));
    }
    assert.equal(
      exact.distance({ o: { x: tree.x + 10, y: 10, z: tree.z }, d: { x: 0, y: -1, z: 0 } }),
      null,
    );
  }
});
test('near/far transitions retain valid old geometry until replacement publishes; growth uses effective time', () => {
  const t = { ...world.trees[0], plantedAt: 0, readyAt: 30000 };
  const f = fixture({ ...world, trees: [t] });
  f.expected = 1;
  drain(f);
  const previous = [...f.published.values()][0];
  const b = { minX: t.x - 4, minZ: t.z - 4, maxX: t.x + 4, maxZ: t.z + 4 };
  f.stream.frame(b, { maxTrees: 0 }, () => 0);
  assert.equal([...f.published.values()][0], previous);
  f.stream.frame(b, { maxTrees: 24, maxMilliseconds: 2 }, () => 0);
  assert.notEqual([...f.published.values()][0], previous);
  const mature = new TreeBatchBuilder(
    world.mapSeed,
    [{ id: t.id, x: t.x, z: t.z, stage: 3 }],
    false,
  );
  mature.append();
  assert.deepEqual([...f.published.values()][0].mesh, mature.finish().mesh);
});
test('Cocos controller advances view streaming every frame for v5, v6 and v7 and preserves old renderer branch', () => {
  const controller = fs.readFileSync('assets/scripts/presentation/TownController.ts', 'utf8');
  assert.match(
    controller,
    /streamTownFrame\(this.session.state.terrainVersion, this.map, this.town\)/,
  );
  const stream = fs.readFileSync('assets/scripts/presentation/TownStreamingFrame.ts', 'utf8');
  assert.match(
    stream,
    /version === 5\) town.frame\(map.visibleBounds\(64\), map.visibleBounds\(4\)\)/,
  );
  assert.match(stream, /version === 6 \|\| version === 7/);
  assert.match(stream, /map.maxOverviewError\(\)/);
  const ground = fs.readFileSync('assets/scripts/presentation/GroundObjects.ts', 'utf8');
  assert.match(
    ground.replace(/\s+/g, ' '),
    /state\.terrainVersion === 5 \|\| state\.terrainVersion === 6 \|\| state\.terrainVersion === 7 \? \[\] : state\.trees/,
  );
  assert.match(ground, /new V6TreeView[\s\S]{0,180}heightInCell/);
  assert.match(ground, /if \(this\.v5Trees\) return this\.v5Trees\.pick\(ray\)/);
  const town = fs.readFileSync('assets/scripts/presentation/TownView.ts', 'utf8');
  assert.match(town, /if \(!this\.previous \|\| this\.previous\.terrainVersion < 5\) return/);
  assert.match(town, /this\.resources\.frame\(treeBounds, treeLodSpan\) \|\| changed/);
});
test('camera visible bounds use the actual viewport and elevated tree envelope rather than a fixed chunk count', () => {
  const code = ts.transpileModule(
    fs.readFileSync('assets/scripts/presentation/CameraVisibility.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const m = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => {
      assert.equal(id, 'cc');
      return { screen: { windowSize: { width: 1000, height: 800 } }, geometry: { Ray: class {} } };
    },
    m,
    m.exports,
  );
  const camera = {
    rect: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 },
    screenPointToRay(x, y, ray) {
      ray.o = { x, y: 20, z: y };
      ray.d = { x: 1, y: -1, z: 2 };
    },
  };
  assert.deepEqual(m.exports.cameraVisibleBounds(camera, 4), {
    minX: 116,
    minZ: 192,
    maxX: 720,
    maxZ: 600,
  });
});

test('pending uploads are not pickable and cancelling a staged chunk releases it without publishing', () => {
  const tree = world.trees[0],
    state = { ...world, trees: [tree] },
    cancels = [];
  let ready = false,
    calls = 0;
  const stream = new TreeStreaming(
    () => {
      calls++;
      return ready;
    },
    () => {},
    (key) => cancels.push(key),
  );
  stream.sync(state, state.lastSeenAt);
  stream.frame(whole, { maxUploadBytes: 1000000, maxMilliseconds: 10 }, () => 0);
  assert.ok(calls > 0);
  assert.equal(ids(stream).length, 0);
  stream.frame({ minX: -100, minZ: -100, maxX: -90, maxZ: -90 }, {}, () => 0);
  assert.equal(cancels.length, 1);
  assert.equal(ids(stream).length, 0);
  ready = true;
  stream.frame(whole, { maxUploadBytes: 1000000, maxMilliseconds: 10 }, () => 0);
  assert.deepEqual(ids(stream), [tree.id]);
  stream.dispose();
});

test('production v5 view publishes staged render parts and exact-ID picking together, and disposes hidden work', () => {
  const code = ts.transpileModule(
    fs.readFileSync('assets/scripts/presentation/V5TreeView.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText;
  const staged = [];
  class Node {
    children = [];
    constructor(name) {
      this.name = name;
    }
    addChild(n) {
      this.children.push(n);
      n.parent = this;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  class Uploads {
    steps = 0;
    live = [];
    disposed = false;
    constructor() {
      staged.push(this);
    }
    stage(changes) {
      this.pending = changes;
      this.steps = 0;
    }
    advance(bytes, ms) {
      assert.equal(bytes, 262144);
      assert.equal(ms, 2);
      return ++this.steps >= 2;
    }
    publish() {
      this.live = this.pending.map((p) => p.key);
      this.pending = null;
    }
    keys() {
      return this.live;
    }
    cancel() {
      this.pending = null;
    }
    dispose() {
      this.disposed = true;
      this.live = [];
      this.pending = null;
    }
  }
  const m = { exports: {} };
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id === 'cc') return { Node };
      if (id === './V5ChunkMeshes') return { V5ChunkMeshes: Uploads };
      if (id === './WorldMaterial') return { worldMaterial: () => ({ destroy() {} }) };
      if (id === './TouchPicking') return { nearProjectedBounds: () => true };
      if (id.startsWith('../')) return require('../.domain-build/' + id.slice(3));
      throw Error(id);
    },
    m,
    m.exports,
  );
  const tree = world.trees[0],
    view = new m.exports.V5TreeView(new Node('root'), () => groundReady);
  let groundReady = false;
  view.sync({ ...world, trees: [tree] }, world.lastSeenAt);
  const v = v5TreeVisual(world.mapSeed, tree.x, tree.z),
    ray = {
      o: { x: tree.x + 0.5 + v.offset[0], y: 10, z: tree.z + 0.5 + v.offset[2] },
      d: { x: 0, y: -1, z: 0 },
    };
  view.frame(whole);
  assert.equal(staged.length, 0, 'No trees upload over unpublished ground');
  assert.equal(view.loading, true);
  assert.equal(view.pick(ray), null);
  groundReady = true;
  view.frame(whole);
  assert.equal(view.pick(ray), null);
  assert.equal(staged[0].live.length, 0);
  view.frame(whole);
  assert.equal(view.pick(ray)?.id, tree.id);
  assert.equal(staged[0].live.length, 1);
  assert.equal(view.loading, false);
  view.sync({ ...world, trees: [] }, world.lastSeenAt);
  assert.equal(view.pick(ray), null);
  assert.ok(staged[0].disposed);
  view.sync({ ...world, trees: [tree] }, world.lastSeenAt);
  view.frame(whole);
  assert.equal(staged.at(-1).live.length, 0);
  view.dispose();
  assert.ok(staged.every((s) => s.disposed));
});

test('unchanged saved tree arrays reuse spatial identities until a real growth boundary', () => {
  const f = fixture();
  f.stream.sync(world, world.lastSeenAt);
  const chunks = f.stream.chunks;
  f.stream.sync(world, world.lastSeenAt + 1);
  assert.equal(
    f.stream.chunks,
    chunks,
    'Terrain chunk publication cannot regroup the entire unchanged forest',
  );
  const tree = { ...world.trees[0], plantedAt: 100, readyAt: 400 },
    state = { ...world, trees: [tree], lastSeenAt: 100 };
  f.stream.sync(state, 100);
  const youngChunks = f.stream.chunks;
  f.stream.sync(state, 199);
  assert.equal(f.stream.chunks, youngChunks);
  f.stream.sync(state, 200);
  assert.notEqual(f.stream.chunks, youngChunks);
  assert.equal([...f.stream.chunks.values()][0].trees[0].stage, 1);
});
