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
