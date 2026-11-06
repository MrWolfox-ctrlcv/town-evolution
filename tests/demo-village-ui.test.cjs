/** Production coordinator, camera, actions and buttons; CPU collaborators, not GPU QA. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const ts = require('typescript');
const g = require('../.domain-build/domain/game');
const { GameSession } = require('../.domain-build/application/GameSession');
const { demoVillageFrame, homeZoom } = require('../.domain-build/application/CameraFraming');
const { load, Node, tap } = require('./helpers/selection-ui.cjs');
const { ActionButton } = load('Widgets');
const cameraFile = require.resolve('./map-camera.test.cjs');
const cameraSource = fs.readFileSync(cameraFile, 'utf8');
const cameraFixture = new Function(
  'require',
  cameraSource.slice(0, cameraSource.indexOf("test('versioned bounds")) +
    cameraSource.slice(
      cameraSource.indexOf('function fixture('),
      cameraSource.indexOf("test('real wheel"),
    ) +
    '\nreturn fixture;',
)(createRequire(cameraFile));
const baseline = g.createDemoGame(100000);

function fixture(width, height, profile = 'demo', state = baseline) {
  class Hud {
    details = false;
    mapInput = {};
    setToolHandlers() {}
    layout() {
      return { width, height, bottom: 0, right: 0, left: 0 };
    }
    render(data) {
      this.data = data;
      return false;
    }
    projectObject() {}
    openDetails() {
      this.details = true;
    }
    closeDetails() {
      this.details = false;
    }
    cancelTools() {}
    cancelGestures() {}
    clearCollections() {}
    tick() {}
  }
  class Town {
    sync() {}
    objectBounds() {
      return null;
    }
  }
  class Drag {
    clear() {}
  }
  class Tools {
    active = false;
    cancel() {
      this.active = false;
    }
    updateHint() {}
  }
  const deps = {
    cc: { Node },
    './TownHUD': { TownHUD: Hud },
    './TownView': { TownView: Town },
    './ObjectDrag': { ObjectDrag: Drag },
    './ToolRouter': { ToolRouter: Tools },
    './MapCamera': {
      MapCamera: class {
        constructor(_parent, _node, _hooks, version) {
          return cameraFixture(version).map;
        }
      },
    },
    './CollectionBinding': { bindCollections() {} },
  };
  const mod = { exports: {} };
  new Function(
    'require',
    'module',
    'exports',
    ts.transpileModule(fs.readFileSync('assets/scripts/presentation/TownController.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
  )(
    (id) =>
      deps[id] ??
      (id.startsWith('../') ? require(`../.domain-build/${id.slice(3)}`) : load(id.slice(2))),
    mod,
    mod.exports,
  );
  const values = new Map();
  const storage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  const session = new GameSession(
    storage,
    () => 100000,
    () => structuredClone(state),
  );
  session.save();
  const saved = [...values];
  const controller = new mod.exports.TownController(
    new Node('Root'),
    session,
    profile,
    () => {},
    () => {},
  );
  return { controller, session, values, saved };
}

for (const [width, height] of [
  [320, 568],
  [390, 844],
  [844, 390],
  [1280, 720],
])
  test(`real demo startup and full-island button preserve progress at ${width}x${height}`, () => {
    const f = fixture(width, height),
      c = f.controller;
    const frame = demoVillageFrame(f.session.state);
    assert.equal(c.map.zoom, homeZoom(192) * frame.zoomScale);
    assert.equal(c.map.focus.x, frame.x);
    assert.equal(c.map.focus.z, frame.z);
    assert.deepEqual([...f.values], f.saved);
    c.openTownActions();
    assert.ok(c.hud.details);
    assert.equal(c.hud.data.actions.length, 6);
    const action = c.hud.data.actions.find((a) => a.text === '查看全岛');
    const button = new ActionButton(new Node('Canvas'), () => {});
    button.set(action);
    c.map.gesture.begin(12, { x: 400, y: 300 }, { x: 400, y: 300 });
    c.tools.active = true;
    tap(button);
    assert.equal(c.map.interacting, false);
    assert.equal(c.tools.active, false);
    assert.equal(c.hud.details, false);
    assert.equal(c.map.zoom, 1);
    assert.equal(c.map.focus.x, 96);
    const state = g.exportSave(f.session.state);
    c.layout();
    c.resume();
    c.tick(0.5);
    assert.equal(c.map.zoom, 1);
    assert.equal(c.map.focus.x, 96);
    assert.equal(g.exportSave(f.session.state), state);
    assert.deepEqual([...f.values], f.saved);
  });

test('normal and old-world sessions retain their original home, bounds and saved world', () => {
  for (const version of [1, 2, 3, 4]) {
    const state = g.createGame(100000, 1, version);
    const f = fixture(390, 844, 'normal', state),
      c = f.controller;
    assert.equal(c.map.zoom, homeZoom(g.worldSize(version)));
    assert.equal(c.map.focus.x, 6);
    assert.equal(c.map.focus.z, 6);
    c.handlers.overview();
    assert.equal(c.map.focus.x, g.worldSize(version) / 2);
    assert.deepEqual([...f.values], f.saved);
    assert.deepEqual(f.session.state, state);
  }
});

test('old remote demo dock does not drag the landing view away or move stored objects', () => {
  const state = structuredClone(baseline),
    dock = state.buildings.find((b) => b.kind === 'dock');
  // Historical demos had only the original dock, not the additive workshop dock.
  state.buildings = state.buildings.filter((b) => b.dockStyle !== 'simple');
  Object.assign(dock, { x: 43, z: 152, rotation: 0 });
  const f = fixture(390, 844, 'demo', state);
  assert.deepEqual(demoVillageFrame(state), { x: 7, z: 4, zoomScale: 1 });
  assert.equal(f.controller.map.focus.x, 7);
  assert.equal(f.controller.map.focus.z, 4);
  assert.deepEqual(f.session.state, state);
  assert.deepEqual([...f.values], f.saved);
});
