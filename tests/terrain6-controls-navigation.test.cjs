const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const moduleObject = { exports: {} };
new Function(
  'module',
  'exports',
  ts.transpileModule(
    fs.readFileSync(path.join(root, 'assets/scripts/application/V6ViewNavigation.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText,
)(moduleObject, moduleObject.exports);
const { V6ViewNavigation } = moduleObject.exports;
function fixture() {
  const calls = [];
  const navigation = new V6ViewNavigation({
    cancelInput: () => calls.push('cancel'),
    closeDetails: () => calls.push('close'),
    home: () => calls.push('home'),
    overview: () => calls.push('overview'),
    zoom: (delta) => calls.push(['zoom', delta]),
  });
  return { navigation, calls };
}
test('initial overview waits for real display readiness and activates only once', () => {
  const { navigation, calls } = fixture();
  for (let i = 0; i < 100; i++) navigation.update(false);
  assert.deepEqual(calls, []);
  assert.equal(navigation.awaitingOverview, true);
  navigation.update(true);
  assert.deepEqual(calls, ['cancel', 'close', 'overview']);
  navigation.update(true);
  navigation.update(false);
  navigation.update(true);
  assert.equal(calls.filter((value) => value === 'overview').length, 1);
});
test('home and zoom cancel pending overview and active gestures before changing the camera', () => {
  for (const action of ['home', 'zoom']) {
    const { navigation, calls } = fixture();
    if (action === 'home') navigation.home();
    else navigation.zoom(-1);
    assert.deepEqual(calls, ['cancel', 'close', action === 'home' ? 'home' : ['zoom', -1]]);
    navigation.update(true);
    assert.equal(navigation.awaitingOverview, false);
    assert.equal(calls.length, 3);
  }
});
test('map or tool interaction prevents a later automatic jump to the overview', () => {
  const { navigation, calls } = fixture();
  navigation.update(false, true);
  navigation.update(true);
  assert.deepEqual(calls, []);
  navigation.overview();
  assert.equal(calls.at(-1), 'overview');
});
test('manual overview remains pending while unavailable, then recovery honors the latest intent', () => {
  const { navigation, calls } = fixture();
  navigation.home();
  navigation.overview();
  navigation.update(false);
  assert.equal(calls.includes('overview'), false);
  navigation.home();
  navigation.update(true);
  assert.equal(calls.includes('overview'), false);
  navigation.overview();
  assert.equal(calls.at(-1), 'overview');
});
test('disposed navigation ignores stale readiness and old button callbacks', () => {
  const { navigation, calls } = fixture();
  navigation.dispose();
  navigation.update(true);
  navigation.home();
  navigation.overview();
  navigation.zoom(1);
  assert.deepEqual(calls, []);
  assert.equal(navigation.awaitingOverview, false);
});
function presentation(name, dependencies = {}) {
  const m = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(
      fs.readFileSync(path.join(root, `assets/scripts/presentation/${name}.ts`), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
    ).outputText,
  )(
    (id) =>
      dependencies[id] ?? (id === '../application/V6ViewNavigation' ? { V6ViewNavigation } : {}),
    m,
    m.exports,
  );
  return m.exports;
}
test('v6 navigation presents truthful persistent stages and cancels when detail becomes distant or blocked', () => {
  const { V6TownNavigation } = presentation('V6TownNavigation');
  const calls = [],
    messages = [];
  let handlers;
  const hud = {
    setTerrainNavigation: (value) => (handlers = value),
    closeDetails: () => calls.push('close'),
    terrainStatus: (text) => messages.push(text),
  };
  const map = {
    interacting: false,
    reset: (version) => calls.push(['home', version]),
    overview: () => calls.push('overview'),
    zoomBy: (delta) => calls.push(['zoom', delta]),
  };
  const town = {
    surfaceProblem: null,
    surfaceStatus: {
      overviewReady: false,
      phase: 'overview',
      readyChunks: 0,
      requestedChunks: 196,
    },
  };
  const nav = new V6TownNavigation(
    hud,
    map,
    town,
    () => calls.push('cancel'),
    () => false,
  );
  nav.tick();
  assert.equal(calls.includes('overview'), false);
  assert.match(messages.at(-1), /正在准备真实全岛远景/);
  town.surfaceStatus.overviewReady = true;
  nav.tick();
  assert.equal(calls.at(-1), 'overview');
  handlers.home();
  assert.deepEqual(calls.slice(-3), ['cancel', 'close', ['home', 6]]);
  town.surfaceStatus = { overviewReady: true, phase: 'detail', readyChunks: 3, requestedChunks: 8 };
  nav.tick();
  assert.match(messages.at(-1), /3\/8 块已就绪/);
  town.surfaceStatus.phase = 'ready';
  nav.tick();
  assert.match(messages.at(-1), /当前区域已就绪/);
  const before = calls.length;
  town.surfaceStatus.phase = 'overview';
  nav.tick();
  assert.deepEqual(calls.slice(before), ['cancel']);
  town.surfaceProblem = '地形细节过多';
  nav.tick();
  assert.equal(calls.at(-1), 'cancel');
  assert.match(messages.at(-1), /暂不可操作/);
  const blocked = calls.length;
  nav.tick();
  assert.equal(calls.length, blocked, 'a persistent warning must not repeatedly cancel gestures');
  town.surfaceProblem = null;
  town.surfaceStatus.phase = 'ready';
  nav.tick();
  assert.match(messages.at(-1), /当前区域已就绪/);
  handlers.zoom(-1);
  assert.deepEqual(calls.slice(-3), ['cancel', 'close', ['zoom', -1]]);
  nav.dispose();
  const disposed = calls.length;
  handlers.home();
  handlers.overview();
  assert.equal(calls.length, disposed);
});
function geometryModel() {
  return {
    AABB: class {
      constructor(x, y, z, hx, hy, hz) {
        this.center = { x, y, z };
        this.halfExtents = { x: hx, y: hy, z: hz };
      }
    },
    intersect: {
      aabbFrustum(box, frustum) {
        // The pinned Cocos inward-plane rejection rule, used only as a CPU collaborator.
        for (const { n, d } of frustum.planes) {
          const p = box.center,
            h = box.halfExtents;
          const center = n.x * p.x + n.y * p.y + n.z * p.z,
            r = Math.abs(n.x) * h.x + Math.abs(n.y) * h.y + Math.abs(n.z) * h.z;
          if (center + r < d) return 0;
        }
        return 1;
      },
    },
  };
}
test('real-height AABBs preserve high hills, edited platforms and tree/roof edges while rejecting off-frustum lowland', () => {
  const { cameraBoxVisible } = presentation('CameraVisibility', {
    cc: { geometry: geometryModel() },
  });
  const { cameraDepth, V6_VIEW_TOP } = require('../.domain-build/application/CameraFraming');
  const l = Math.hypot(15, 20, 18),
    p = Math.hypot(15, 18),
    forward = { x: 15 / l, y: 20 / l, z: 18 / l },
    right = { x: 18 / p, y: 0, z: -15 / p },
    up = { x: -300 / (l * p), y: p / l, z: -360 / (l * p) };
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
    scale = (v, n) => ({ x: v.x * n, y: v.y * n, z: v.z * n }),
    add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
  for (const aspect of [390 / 844, 844 / 390]) {
    const focus = { x: 96, y: 0, z: 96 },
      halfHeight = 6,
      halfWidth = halfHeight * aspect,
      depth = cameraDepth(192, halfHeight, V6_VIEW_TOP),
      eye = add(focus, depth);
    const planes = [];
    for (const [axis, radius] of [
      [right, halfWidth],
      [up, halfHeight],
    ])
      for (const sign of [-1, 1]) {
        const n = scale(axis, sign);
        planes.push({ n, d: dot(n, focus) - radius });
      }
    const near = add(eye, scale(forward, -depth.near)),
      far = add(eye, scale(forward, -depth.far));
    planes.push(
      { n: scale(forward, -1), d: dot(scale(forward, -1), near) },
      { n: forward, d: dot(forward, far) },
    );
    const camera = { camera: { frustum: { planes } } };
    for (const height of [46, 64.015, 68.015, 72.015])
      for (const corner of [-1, 1]) {
        const origin = add(
            eye,
            add(scale(right, corner * halfWidth * 0.99), scale(up, corner * halfHeight * 0.99)),
          ),
          t = (origin.y - height) / forward.y,
          point = add(origin, scale(forward, -t));
        const min = { x: point.x - 0.1, y: height - 0.1, z: point.z - 0.1 },
          max = { x: point.x + 0.1, y: height + 0.1, z: point.z + 0.1 };
        assert.equal(cameraBoxVisible(camera, min, max), true, `visible elevated edge ${height}`);
        assert.equal(
          cameraBoxVisible(camera, { ...min, y: 0 }, { ...max, y: 1 }),
          false,
          'the same XZ lowland is genuinely outside, not automatically loaded by a global height envelope',
        );
      }
    assert.equal(
      cameraBoxVisible(camera, { x: NaN, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }),
      true,
      'unknown bounds must be retained',
    );
    assert.equal(
      cameraBoxVisible({}, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }),
      true,
      'no real frustum must retain the box',
    );
  }
});
test('far-error certification uses actual framebuffer viewport pixels including DPR and partial viewports', () => {
  const { cameraTerrainError } = presentation('CameraVisibility', { cc: {} });
  for (const dpr of [1, 2, 3])
    for (const fraction of [1, 0.5]) {
      const camera = {
        orthoHeight: 120,
        rect: { height: 1 },
        camera: { window: { height: 844 * dpr }, viewport: { height: fraction } },
      };
      assert.equal(
        cameraTerrainError(camera),
        Math.min(0.25, (0.75 * 240) / (844 * dpr * fraction)),
      );
    }
  assert.equal(
    cameraTerrainError({ orthoHeight: 120 }),
    0,
    'unknown framebuffer cannot certify any far approximation',
  );
  assert.equal(
    cameraTerrainError({
      orthoHeight: 120,
      camera: { window: { height: 0 }, viewport: { height: 1 } },
    }),
    0,
  );
});
test('off-screen tall casters remain requested when their real sun-direction shadow enters the viewport', () => {
  const { cameraBoxVisible, cameraSceneBoxVisible } = presentation('CameraVisibility', {
    cc: { geometry: geometryModel(), DirectionalLight: class {} },
  });
  const planes = [
    { n: { x: 1, y: 0, z: 0 }, d: 0 },
    { n: { x: -1, y: 0, z: 0 }, d: -10 },
    { n: { x: 0, y: 0, z: 1 }, d: 0 },
    { n: { x: 0, y: 0, z: -1 }, d: -10 },
    { n: { x: 0, y: 1, z: 0 }, d: -4 },
    { n: { x: 0, y: -1, z: 0 }, d: -72.015 },
  ];
  const sun = { shadowEnabled: true, node: { forward: { x: 30, y: -50, z: -25 } } };
  const camera = {
    camera: { frustum: { planes } },
    node: { scene: { getChildByName: () => ({ getComponent: () => sun }) } },
  };
  const min = { x: -34, y: 0, z: 30 },
    max = { x: -33, y: 64.015, z: 31 };
  assert.equal(
    cameraBoxVisible(camera, min, max),
    false,
    'caster itself is outside the eye frustum',
  );
  assert.equal(
    cameraSceneBoxVisible(camera, min, max),
    true,
    'the same 64-high caster projects onto the visible region',
  );
  assert.equal(
    cameraSceneBoxVisible(camera, min, { ...max, y: 1 }),
    false,
    'short off-screen terrain does not inherit a fictitious 72-high shadow',
  );
  sun.shadowEnabled = false;
  assert.equal(cameraSceneBoxVisible(camera, min, max), false);
  sun.shadowEnabled = true;
  sun.node.forward = { x: 1, y: 0, z: 0 };
  assert.equal(
    cameraSceneBoxVisible(camera, min, max),
    true,
    'unknown/horizontal shadow extent is retained',
  );
});
