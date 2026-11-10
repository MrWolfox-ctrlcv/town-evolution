const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = process.env.V6_SURFACE_BUILD || path.join(__dirname, '..', '.domain-build');
const { V6SurfaceBudget, V6SurfaceBudgetError } = require(path.join(root, 'art/V6SurfaceBudget'));
function presentation(name, overrides = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(
    path.join(__dirname, '../assets/scripts/presentation', name + '.ts'),
    'utf8',
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(
    (id) => {
      if (id in overrides) return overrides[id];
      if (id.startsWith('../art/') || id.startsWith('../application/'))
        return require(path.join(root, id.slice(3)));
      return {};
    },
    module,
    module.exports,
  );
  return module.exports;
}
test('v6 resident accounting rejects live plus hidden staging, cancels and reclaims without touching world data', () => {
  const budget = new V6SurfaceBudget(1000);
  budget.reserve(400);
  budget.publish('a', 400);
  budget.cancel();
  budget.reserve(500);
  assert.throws(() => budget.reserve(101), V6SurfaceBudgetError);
  assert.deepEqual(budget.usage(), { resident: 400, staging: 500, limit: 1000 });
  budget.cancel();
  budget.publish('a', 0);
  budget.reserve(900);
  assert.deepEqual(budget.usage(), { resident: 0, staging: 900, limit: 1000 });
  budget.clear();
  assert.equal(budget.usage().resident, 0);
});
test('v6 dirty and budget-failed views reject old ground, show persistent failure and recover on changed viewport', () => {
  const { V6IslandView } = presentation('V6IslandView');
  const view = Object.create(V6IslandView.prototype);
  let calls = 0,
    aborted = 0,
    published = 0,
    ready = false,
    fail = true,
    uploadBudget;
  const hit = { x: 8, z: 8, distance: 2 };
  const tx = { chunks: [], commit: () => ({ positions: [], resources: [] }) };
  Object.assign(view, {
    coast: { keys: ['0,0'] },
    failure: null,
    failureView: '',
    pending: null,
    requestedFine: new Set(),
    chunks: {
      cachedMeshes: () => new Set(),
      request() {},
      isCurrent: () => true,
      ready: () => ready,
      isSettled: () => ready,
      advance: () => {
        calls++;
        if (fail) throw new V6SurfaceBudgetError(1100, 1000);
        return tx;
      },
      abort: () => aborted++,
      resident: () => new Map(),
    },
    meshes: {
      retain() {},
      cancel() {},
      stage() {},
      advance: (bytes) => {
        uploadBudget = bytes;
        return true;
      },
      publish: () => published++,
    },
    picker: { pick: () => hit, sync() {} },
    support: { setNaturalChunks() {} },
  });
  assert.equal(view.pickTerrain({}), null);
  assert.equal(view.terrainDistance({}), 2);
  const bounds = { minX: 0, minZ: 0, maxX: 20, maxZ: 20 };
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(view.frame(bounds, {}, undefined, undefined, 0.25, 0.25), false);
  } finally {
    console.warn = warn;
  }
  assert.equal(aborted, 1);
  assert.match(view.surfaceProblem(), /地形细节过多/);
  ready = true;
  assert.equal(view.pickTerrain({}), null);
  assert.equal(view.frame(bounds, {}, undefined, undefined, 0.25, 0.25), false);
  assert.equal(calls, 1);
  fail = false;
  assert.equal(
    view.frame({ ...bounds, maxX: 10 }, { maxUploadBytes: 8 }, undefined, undefined, 0.25, 0.25),
    true,
  );
  assert.equal(uploadBudget, 8);
  assert.equal(published, 1);
  assert.equal(view.surfaceProblem(), null);
  assert.equal(view.pickTerrain({}), hit);
});
test('v6 natural touch and direct picks reject the first blocked owner without selecting through it; v5 unchanged', () => {
  const { GroundObjects } = presentation('GroundObjects', {
    '../art/TreeKit': {},
    './V6TreeView': { V6TreeView: class {} },
  });
  const objects = Object.create(GroundObjects.prototype);
  let ready = false,
    picks = 0;
  const hit = { id: 'n8_8', distance: 1, point: { x: 8.5, y: 5, z: 8.5 } };
  const picker = {
    pick: () => {
      picks++;
      return hit;
    },
    origin: () => ({ x: 8.5, y: 5, z: 8.5 }),
    subset() {
      return this;
    },
  };
  Object.assign(objects, {
    treeVersion: 6,
    groundReady: (x, z) => x === 8 && z === 8 && ready,
    natural: picker,
    trees: [],
    piles: [],
    drops: null,
    v5Trees: null,
  });
  assert.equal(objects.pickNatural({}), null);
  assert.equal(picks, 1);
  assert.equal(objects.touchCandidates({})[0].pick({}), null);
  assert.equal(picks, 2);
  ready = true;
  assert.equal(objects.pickNatural({}), hit);
  ready = false;
  objects.treeVersion = 5;
  assert.equal(objects.pickNatural({}), hit);
});

function streamingFixture(options = {}) {
  const { V6IslandView } = presentation('V6IslandView');
  const view = Object.create(V6IslandView.prototype),
    requests = [],
    builds = [],
    uploads = [],
    published = [];
  let transaction = 0;
  const live = new Map(options.initial ? [] : [['0,0', { detail: false, mesh: { indices: [0] } }]]);
  Object.assign(view, {
    coast: { keys: options.keys || ['0,0', '5,5', '10,10'] },
    failure: null,
    failureView: '',
    pending: null,
    requestedFine: new Set(),
    chunks: {
      cachedMeshes: () => new Set(),
      lastAdvanceSteps: 0,
      request: (keys, fine) => requests.push({ keys, fine }),
      isCurrent: () => true,
      isSettled: () => false,
      advance(steps, ms) {
        builds.push([steps, ms]);
        this.lastAdvanceSteps = Math.min(steps, 7);
        if (options.noBuild || steps < 7) return null;
        return {
          chunks: [],
          commit: () => ({ positions: [], resources: [], version: ++transaction }),
        };
      },
      abort() {},
      resident: () => live,
    },
    meshes: {
      retain() {},
      lastAdvanceBytes: 0,
      cancel() {},
      stage() {},
      advance(bytes, ms) {
        uploads.push([bytes, ms]);
        this.lastAdvanceBytes = 0;
        if (bytes < 13) return false;
        this.lastAdvanceBytes = 13;
        return true;
      },
      publish: () => published.push(transaction),
    },
    picker: { sync() {} },
    support: { setNaturalChunks() {} },
  });
  return { view, requests, builds, uploads, published };
}
test('v6 starts at the actual viewport, then prioritizes requested detail over background overview', () => {
  const bounds = { minX: 155, minZ: 155, maxX: 180, maxZ: 180 };
  const initial = streamingFixture({ initial: true, noBuild: true });
  initial.view.frame(bounds, {}, undefined, undefined, 0, 0.25);
  assert.equal(initial.requests[0].keys[0], '10,10');
  const detail = streamingFixture({ noBuild: true });
  detail.view.frame(bounds, {}, undefined, undefined, 0, 0.25);
  assert.deepEqual(detail.requests[0].fine, ['10,10']);
  assert.equal(detail.requests[0].keys[0], '10,10');
});
test('v6 frame batches at most four atomic groups with shared step and upload byte limits', () => {
  const bounds = { minX: 0, minZ: 0, maxX: 20, maxZ: 20 };
  const batch = streamingFixture();
  assert.equal(
    batch.view.frame(
      bounds,
      { maxMilliseconds: 100, maxPatchBuilds: 100, maxUploadBytes: 100 },
      undefined,
      undefined,
      0.25,
      0.25,
    ),
    true,
  );
  assert.deepEqual(batch.published, [1, 2, 3, 4]);
  assert.deepEqual(
    batch.builds.map((b) => b[0]),
    [100, 93, 86, 79],
  );
  assert.deepEqual(
    batch.uploads.map((b) => b[0]),
    [100, 87, 74, 61],
  );
  const bytes = streamingFixture();
  assert.equal(
    bytes.view.frame(
      bounds,
      { maxMilliseconds: 100, maxUploadBytes: 13 },
      undefined,
      undefined,
      0.25,
      0.25,
    ),
    true,
  );
  assert.deepEqual(bytes.published, [1]);
  assert.equal(bytes.uploads[1][0], 0);
  assert.ok(bytes.view.pending, 'incomplete second upload remains hidden');
  const steps = streamingFixture();
  assert.equal(
    steps.view.frame(
      bounds,
      { maxMilliseconds: 100, maxPatchBuilds: 7 },
      undefined,
      undefined,
      0.25,
      0.25,
    ),
    true,
  );
  assert.deepEqual(steps.published, [1]);
  assert.equal(steps.builds[1][0], 0);
});
test('v6 coast sample cache is exact, source-local and bounded with FIFO eviction', () => {
  const { cachedV6CoastSamples } = require(path.join(root, 'art/V6CoastSamples'));
  let calls = 0;
  const sample = (x, z) => ({ height: x + z, color: [x, z, -0] });
  const cached = cachedV6CoastSamples({
    sample: (x, z) => {
      calls++;
      return sample(x, z);
    },
  });
  for (let i = 0; i < 4096; i++) assert.deepEqual(cached.sample(i, 0), sample(i, 0));
  assert.equal(calls, 4096);
  cached.sample(0, 0);
  assert.equal(calls, 4096, 'hit does not recompute');
  cached.sample(4096, 0);
  cached.sample(0, 0);
  assert.equal(calls, 4098, '4097th coordinate evicts the oldest');
  assert.notEqual(cached.sample(-0, 0), cached.sample(0, 0), 'signed zero identity is retained');
  const other = cachedV6CoastSamples({ sample: () => ({ height: 42, color: [1, 0, 0] }) });
  assert.equal(other.sample(0, 0).height, 42);
});

test('v6 batch shares the millisecond allowances and keeps earlier commits when the next group stalls', () => {
  const batch = streamingFixture(),
    bounds = { minX: 0, minZ: 0, maxX: 20, maxZ: 20 },
    descriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  let time = 0;
  const build = batch.view.chunks.advance.bind(batch.view.chunks),
    upload = batch.view.meshes.advance.bind(batch.view.meshes);
  batch.view.chunks.advance = (steps, ms) => {
    if (ms <= 0) return null;
    time += 2;
    return build(steps, ms);
  };
  batch.view.meshes.advance = (bytes, ms) => {
    time += 1;
    return upload(bytes, ms);
  };
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: () => time },
  });
  try {
    assert.equal(
      batch.view.frame(bounds, { maxMilliseconds: 3 }, undefined, undefined, 0.25, 0.25),
      true,
    );
  } finally {
    Object.defineProperty(globalThis, 'performance', descriptor);
  }
  assert.deepEqual(
    batch.builds.map((b) => b[1]),
    [3, 1],
  );
  assert.deepEqual(
    batch.uploads.map((b) => b[1]),
    [3, 2],
  );
  assert.deepEqual(batch.published, [1, 2]);
  assert.equal(time, 6, 'does not reset the 3ms build/3ms upload allowances per group');
});

test('oblique raised-terrain bounds do not displace ground-view streaming priority', () => {
  const bounds = { minX: 0, minZ: 0, maxX: 96, maxZ: 96 };
  const keys = ['0,0', '1,1', '2,2', '3,3', '4,4', '5,5'];
  const midpoint = streamingFixture({ keys, noBuild: true });
  midpoint.view.frame(bounds, {}, undefined, undefined, 0, 0.25);
  assert.notEqual(midpoint.requests[0].keys[0], '0,0');
  const grounded = streamingFixture({ keys, noBuild: true });
  grounded.view.frame(bounds, {}, undefined, undefined, 0, 0.25, { x: 6, z: 6 });
  assert.equal(grounded.requests[0].keys[0], '0,0');
  assert.deepEqual(new Set(grounded.requests[0].keys), new Set(keys));
  assert.deepEqual(grounded.requests[0].fine, midpoint.requests[0].fine);
  assert.deepEqual(bounds, { minX: 0, minZ: 0, maxX: 96, maxZ: 96 });
});

test('streaming transports the actual ground viewport center without narrowing raised visibility', () => {
  const { streamTownFrame } = presentation('TownStreamingFrame');
  const flat = { minX: 2, minZ: 3, maxX: 10, maxZ: 9 };
  const raised = { minX: 2, minZ: 3, maxX: 98, maxZ: 99 };
  const calls = [];
  const map = {
    visibleBounds: (height) => (height === 0 ? flat : raised),
    maxTerrainError: () => 0.01,
    maxOverviewError: () => 0.25,
    boxVisible: () => true,
  };
  streamTownFrame(6, map, { frame: (...args) => calls.push(args) });
  assert.equal(calls[0][0], raised);
  assert.deepEqual(calls[0][6], { x: 6, z: 6 });
  streamTownFrame(5, map, { frame: (...args) => calls.push(args) });
  assert.equal(calls[1].length, 2, 'legacy streaming remains unchanged');
});

test('ground frame publishes support before object refresh and reports either source of picking invalidation', () => {
  const { townGroundFrame } = presentation('TownGroundFrame');
  const state = { lastSeenAt: Date.now() + 100000 };
  for (const terrainChanged of [false, true]) {
    for (const objectsChanged of [false, true]) {
      const calls = [];
      const island = {
        naturalSurface: {},
        dropSupport: {},
        frame: (...args) => {
          calls.push(['terrain', args]);
          return terrainChanged;
        },
      };
      const resources = {
        sync: (...args) => calls.push(['sync', args]),
        frame: (...args) => {
          calls.push(['objects', args]);
          return objectsChanged;
        },
      };
      const terrain = [{ minX: 0, minZ: 0, maxX: 16, maxZ: 16 }, {}];
      assert.equal(
        townGroundFrame(state, island, resources, terrain, terrain[0], 16),
        terrainChanged || objectsChanged,
      );
      assert.deepEqual(
        calls.map((c) => c[0]),
        terrainChanged ? ['terrain', 'sync', 'objects'] : ['terrain', 'objects'],
      );
      assert.deepEqual(calls[0][1], terrain);
      if (terrainChanged)
        assert.deepEqual(calls[1][1], [
          state,
          island.naturalSurface,
          state.lastSeenAt,
          island.dropSupport,
        ]);
    }
  }
});
