const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { quantiles, summarizeCPU, profileDevice } = require('../scripts/preview/profile-stats.cjs');
const { sampleFrames } = require('../scripts/preview/profile-sample.cjs');
test('frame percentiles use nearest rank and never mutate evidence', () => {
  const values = [30, 10, 20, NaN, Infinity];
  assert.deepEqual(quantiles(values), { count: 3, p50: 20, p95: 30, max: 30 });
  assert.deepEqual(values, [30, 10, 20, NaN, Infinity]);
  assert.deepEqual(quantiles([]), { count: 0, p50: null, p95: null, max: null });
  assert.equal(quantiles(Array.from({ length: 60 }, (_, i) => i + 1)).p95, 57);
});
test('CPU summary attributes only valid leaf samples, does not mistake hitCount for time', () => {
  const profile = {
    nodes: [
      {
        id: 1,
        callFrame: { functionName: 'work', url: 'app.js', lineNumber: 1, columnNumber: 2 },
        hitCount: 999,
      },
      { id: 2, callFrame: { functionName: '(idle)', url: '', lineNumber: -1, columnNumber: -1 } },
    ],
    samples: [1, 2, 1, 99, 1],
    timeDeltas: [100, 300, 200, 100, -1],
  };
  const before = JSON.stringify(profile);
  const summary = summarizeCPU(profile);
  assert.equal(summary.totalUs, 600);
  assert.equal(summary.top.find((r) => r.functionName === 'work').selfUs, 300);
  assert.equal(summary.top.find((r) => r.functionName === 'work').samples, 2);
  assert.match(summary.unit, /not GPU time/);
  assert.equal(JSON.stringify(profile), before);
});
test('browser sampling is serializable and takes exact engine frame counters without mutating game', async () => {
  let listener,
    detached = false;
  const device = {
    numDrawCalls: 5,
    numTris: 100,
    numInstances: 2,
    memoryStatus: { bufferSize: 123, textureSize: 456 },
    renderer: 'test',
    vendor: 'test',
  };
  const controller = {
    map: { camera: { orthoHeight: 12 }, focus: { x: 6, z: 6 } },
    town: { surfaceStatus: { phase: 'detail' } },
  };
  const scene = {
    getChildByName: () => ({ getComponent: () => ({ controller }) }),
    getComponentsInChildren: () => [
      { enabledInHierarchy: true, node: { activeInHierarchy: true } },
      { enabledInHierarchy: false, node: { activeInHierarchy: true } },
    ],
  };
  const cc = {
    MeshRenderer: class {},
    Director: { EVENT_AFTER_DRAW: 'after' },
    director: {
      root: { device },
      getScene: () => scene,
      on: (_event, fn) => (listener = fn),
      off: (_event, fn) => {
        assert.equal(fn, listener);
        detached = true;
      },
    },
  };
  const fn = new Function(
    'System',
    'document',
    'performance',
    'devicePixelRatio',
    `return (${sampleFrames.toString()})(3)`,
  );
  let now = 0;
  const promise = fn(
    { import: async () => cc },
    { querySelector: () => ({ width: 1280, height: 800, clientWidth: 1280, clientHeight: 800 }) },
    { now: () => (now += 16) },
    1,
  );
  await Promise.resolve();
  for (let i = 0; i < 4; i++) listener();
  const result = await promise;
  assert.equal(result.samples.length, 3);
  assert.equal(detached, true);
  assert.deepEqual(result.samples[0], {
    intervalMs: 16,
    drawCalls: 5,
    triangles: 100,
    instances: 2,
  });
  assert.equal(result.activeMeshRenderers, 1);
  assert.equal(result.memory.textureSize, 456);
  assert.equal(controller.map.focus.x, 6);
});
test('independent profile enforces release/git-clean provenance, verified bytes and unchanged budgets', () => {
  const source = fs.readFileSync('scripts/preview/profile.cjs', 'utf8').replace(/\s+/g, ' ');
  assert.match(source, /verifyPackage\(root, out/);
  assert.match(source, /sourceSnapshot, false/);
  assert.match(source, /sourceTrackedChanges, ''/);
  assert.match(source, /buildMode,\s*'release'/);
  assert.match(source, /checked\.files\.get\(path\.relative/);
  assert.match(source, /withDeadline\(main, 180000/);
  assert.match(source, /Profiler.start/);
  assert.match(source, /Profiler.stop/);
  assert.doesNotMatch(source, /setContent\(|addInitScript\(|localStorage\.setItem|\.state\s*=/);
});

test('profile accepts explicit matrix device flags and rejects ambiguous selections', () => {
  assert.equal(profileDevice([]), 'desktop');
  for (const device of ['desktop', 'mobile']) {
    assert.equal(profileDevice([device]), device);
    assert.equal(profileDevice([`--device=${device}`]), device);
  }
  for (const args of [['tablet'], ['--device='], ['--other=mobile'], ['desktop', 'mobile']])
    assert.throws(() => profileDevice(args));
});
test('home profiling matches the actual MapCamera Vec3 XZ focus, not the report XY projection', () => {
  const camera = fs.readFileSync('assets/scripts/presentation/MapCamera.ts', 'utf8');
  assert.match(camera, /focus = new Vec3\(6, 0, 6\)/);
  assert.match(camera, /this\.focus\.set\(frame\.x, 0, frame\.z\)/);
  const profile = fs.readFileSync('scripts/preview/profile-scene.cjs', 'utf8');
  assert.match(profile, /z: c\.map\.focus\.z/);
  assert.doesNotMatch(profile, /c\.map\.focus\.y/);
});

test('Node scene polling does not click through preparing or a still-visible menu', async () => {
  const { entered, homeReady, pollScene } = require('../scripts/preview/profile-scene.cjs');
  const good = {
    page: 'game',
    profile: 'v6-preview',
    menuVisible: false,
    surface: { overviewVisible: true },
    awaitingOverview: false,
    focus: { x: 6, z: 6 },
    homeReady: true,
  };
  const states = [
    { ...good, page: 'preparing' },
    { ...good, menuVisible: true },
    { ...good, surface: { overviewVisible: false } },
    good,
  ];
  let index = 0,
    clock = 0;
  const seen = [];
  const result = await pollScene(
    async () => states[index++],
    entered,
    1000,
    (s) => seen.push(s),
    async (ms) => (clock += ms),
    () => clock,
  );
  assert.equal(result, good);
  assert.equal(seen.length, 4);
  assert.equal(homeReady(good), true);
  assert.equal(homeReady({ ...good, focus: { x: 6, z: 0 } }), false);
  await assert.rejects(
    pollScene(
      async () => ({ ...good, page: 'preparing' }),
      entered,
      400,
      () => {},
      async (ms) => (clock += ms),
      () => clock,
    ),
    /deadline/,
  );
});
