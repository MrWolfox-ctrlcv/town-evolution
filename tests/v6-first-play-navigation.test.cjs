/** Production camera listeners and V6 navigation; analytic projection, no renderer claims. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const ts = require('typescript');
const source = fs.readFileSync(require.resolve('./map-camera.test.cjs'), 'utf8');
// Reuse its analytic camera fixture, without registering its unrelated tests.
const cameraFixture = new Function(
  'require',
  source.slice(0, source.indexOf("test('versioned bounds")) +
    source.slice(source.indexOf('function fixture('), source.indexOf("test('real wheel handler")) +
    '\nreturn fixture;',
)(createRequire(require.resolve('./map-camera.test.cjs')));
const mod = { exports: {} };
new Function(
  'require',
  'module',
  'exports',
  ts.transpileModule(fs.readFileSync('assets/scripts/presentation/V6TownNavigation.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
)((id) => require('../.domain-build/' + id.slice(3)), mod, mod.exports);
function fixture() {
  const f = cameraFixture(6);
  let visible = false,
    controls;
  const town = {
    get surfaceStatus() {
      return {
        overviewVisible: visible,
        phase: 'overview',
        readyChunks: visible ? 1 : 0,
        requestedChunks: 196,
      };
    },
    surfaceProblem: null,
  };
  const nav = new mod.exports.V6TownNavigation(
    {
      setTerrainNavigation: (value) => {
        controls = value;
      },
      closeDetails() {},
      terrainStatus() {},
    },
    f.map,
    town,
    () => f.map.cancelGesture(),
    () => false,
  );
  const frame = () => ({ zoom: f.map.zoom, focus: { ...f.map.focus } });
  return {
    ...f,
    nav,
    controls,
    frame,
    publish() {
      visible = true;
      nav.tick();
    },
    wheel(delta = 100, point = { x: 400, y: 300 }) {
      f.input.emit('wheel', { getScrollY: () => delta, getLocation: () => point });
    },
  };
}
for (const action of ['wheel', 'pan', 'pinch']) {
  test(`finished ${action} before the next navigation tick preserves first-load intent`, () => {
    const f = fixture();
    f.nav.tick();
    if (action === 'wheel') f.wheel();
    else {
      f.touch('start', 1, 350, 300);
      if (action === 'pinch') f.touch('start', 2, 450, 300);
      f.touch('move', 1, 300, 320);
      f.touch('end', 1, 300, 320);
      if (action === 'pinch') f.touch('end', 2, 450, 300);
    }
    assert.equal(f.map.interacting, false);
    assert.ok(f.map.navigationRevision > 0);
    const intended = f.frame();
    f.nav.tick();
    f.publish();
    assert.deepEqual(f.frame(), intended);
    f.map.dispose();
  });
}
test('no navigation, invalid/outside/covered wheel, and programmatic updates retain automatic overview', () => {
  for (const action of [
    'none',
    'zero',
    'invalid',
    'outside',
    'covered',
    'layout',
    'reset',
    'clamped',
  ]) {
    const f = fixture();
    f.nav.tick();
    if (action === 'zero') f.wheel(0);
    if (action === 'invalid') f.wheel(NaN);
    if (action === 'outside') f.wheel(100, { x: -10, y: 300 });
    if (action === 'covered') {
      f.map.hooks.covered = () => true;
      f.wheel();
    }
    if (action === 'layout') f.map.layout(800, 600, 20, 10);
    if (action === 'reset') f.map.reset(6);
    if (action === 'clamped') {
      f.map.zoomBy(-100);
      f.wheel(100, { x: 400, y: 300 });
    }
    assert.equal(f.map.navigationRevision, 0, action);
    f.publish();
    assert.equal(f.map.zoom, 1, action);
    assert.equal(f.map.focus.x, 96, action);
    f.map.dispose();
  }
});
test('explicit overview after unticked navigation wins, but a later wheel supersedes it', () => {
  for (const laterWheel of [false, true]) {
    const f = fixture();
    f.nav.tick();
    f.wheel();
    f.controls.overview();
    if (laterWheel) f.wheel();
    const intended = f.frame();
    f.publish();
    if (laterWheel) assert.deepEqual(f.frame(), intended);
    else assert.equal(f.map.zoom, 1);
    f.map.dispose();
  }
});
test('explicit home and HUD zoom still cancel startup overview after prior navigation', () => {
  for (const action of ['home', 'zoom']) {
    const f = fixture();
    f.wheel();
    if (action === 'home') f.controls.home();
    else f.controls.zoom(1);
    const intended = f.frame();
    f.publish();
    assert.deepEqual(f.frame(), intended);
    f.map.dispose();
  }
});
test('reset arms a fresh overview without replaying old navigation intent', () => {
  const f = fixture();
  f.wheel();
  f.nav.reset();
  f.publish();
  assert.equal(f.map.zoom, 1);
  f.map.dispose();
});
