const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const g = require('../.domain-build/domain/game');
const { validatePlacement } = require('../.domain-build/domain/geometry');
const {
  demoVillageFrame,
  fittedOrthoHeight,
  homeZoom,
} = require('../.domain-build/application/CameraFraming');
const { load } = require('./helpers/selection-ui.cjs');

function nearestDock(state) {
  const prefix = {
    ...state,
    buildings: state.buildings.slice(0, 4),
    trees: [],
    groundStacks: [],
    landExtensions: [],
  };
  let best = null;
  for (let z = 0; z < g.worldSize(state.terrainVersion); z++)
    for (let x = 0; x < g.worldSize(state.terrainVersion); x++)
      for (let rotation = 0; rotation < 4; rotation++) {
        const b = { id: 'b5', kind: 'dock', x, z, rotation };
        if (!g.isDockShore(b, state.mapSeed, state.terrainVersion, [])) continue;
        try {
          validatePlacement(prefix, b);
        } catch {
          continue;
        }
        const score = (x - 14) ** 2 + (z - 18) ** 2;
        if (!best || score < best.score) best = { b, score };
      }
  return best.b;
}

test('new demo chooses the nearest legal shore across all four dock directions', () => {
  const state = g.createDemoGame(100000);
  const dock = state.buildings.find((b) => b.kind === 'dock');
  assert.deepEqual(dock, nearestDock(state));
  assert.ok(Math.hypot(dock.x - 14, dock.z - 18) < 20);
});

test('entering or explicitly resetting a demo does not force the full-island overview', () => {
  const source = fs.readFileSync('assets/scripts/presentation/TownController.ts', 'utf8');
  assert.doesNotMatch(source, /if \(this\.ui\.profile === 'demo'\) this\.map\.overview\(\)/);
});

test('town actions expose an explicit full-island view without hiding existing actions', () => {
  const { actions } = load('HudActions');
  const { createUiState } = load('UiContracts');
  const state = g.createDemoGame(100000);
  let calls = 0;
  const ui = { ...createUiState(), profile: 'demo', tab: 'tools' };
  const commands = actions({ state, mode: 'normal', reason: () => null }, ui, {
    overview: () => calls++,
    openSaves() {},
    exitToTitle() {},
  });
  const overview = commands.find((action) => action.text === '查看全岛');
  assert.ok(overview);
  overview.run();
  assert.equal(calls, 1);
  assert.ok(commands.length <= 6);
  for (const label of ['种树苗 · 5币', '存档', '购买作物', '进入正常小镇', '退出到标题'])
    assert.ok(
      commands.some((action) => action.text === label),
      label,
    );
});

for (const [width, height] of [
  [320, 568],
  [390, 844],
  [844, 390],
  [1280, 720],
])
  test(`village home keeps the starting farm readable at ${width}x${height}`, () => {
    const h = fittedOrthoHeight(width / height, 192) * homeZoom(192);
    const pixels = height / (2 * h);
    const cellWidth = (pixels * (2 / 3) * 33) / Math.hypot(15, 18);
    assert.ok(cellWidth >= 14, `${cellWidth} logical px per crop cell`);
    const full = fittedOrthoHeight(width / height, 192);
    assert.ok(full / h >= 16);
  });

test('explicit overview remains a real camera operation and returning from menus preserves it', () => {
  const file = require.resolve('./map-camera.test.cjs');
  const source = fs.readFileSync(file, 'utf8');
  const prefix = source.slice(0, source.indexOf("test('versioned bounds"));
  const body = source.slice(
    source.indexOf('function fixture('),
    source.indexOf("test('real wheel"),
  );
  const fixture = new Function('require', prefix + body + '\nreturn fixture;')(createRequire(file));
  const { map } = fixture(4);
  assert.equal(map.zoom, 0.0625);
  map.overview();
  assert.equal(map.zoom, 1);
  assert.equal(map.focus.x, 96);
  map.layout(800, 600, 0, 0);
  assert.equal(map.zoom, 1);
  assert.equal(map.focus.x, 96);
});

for (const seed of [1, 7, 42, 42173, 214748364])
  test(`seed ${seed} has a nearby oriented dock, a clear pier and a stable save`, () => {
    const state = g.createDemoGame(100000, seed);
    const dock = state.buildings.find((b) => b.kind === 'dock');
    assert.equal(state.mapSeed, seed);
    assert.deepEqual(dock, nearestDock(state));
    assert.ok(Math.hypot(dock.x - 14, dock.z - 18) < 20);
    const [dx, dz] = [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ][dock.rotation];
    for (const distance of [1.5, 2.5])
      assert.equal(
        g.isLandCell(
          Math.floor(dock.x + 1 + dx * distance),
          Math.floor(dock.z + 1 + dz * distance),
          seed,
          state.terrainVersion,
          state.landExtensions,
        ),
        false,
      );
    assert.deepEqual(g.importSave(g.exportSave(state), 100000), state);
    for (const kind of ['stone', 'soil']) {
      const resource = state.naturalResources.find((p) => p.kind === kind);
      assert.ok(g.dispatch(state, { type: 'gatherNatural', resourceId: resource.id }, 100000).ok);
    }
    const shipped = g.dispatch(
      state,
      {
        type: 'dockCollect',
        buildingId: dock.id,
        shipmentId: state.commerce.shipments[dock.id].id,
      },
      100000,
    );
    assert.ok(shipped.ok, shipped.error);
    const next = g.dispatch(
      shipped.state,
      { type: 'dockShip', buildingId: dock.id, shipmentId: shipped.state.commerce.shipmentId },
      100000,
    );
    assert.ok(next.ok, next.error);
    assert.deepEqual(g.importSave(g.exportSave(next.state), 100000), next.state);
  });

test('old played demo, backups, normal town and manual slots are byte-preserved until confirmed reset', () => {
  const {
    townSession,
    DEMO_REVISION_KEY,
    DEMO_REVISION,
    profileStorage,
  } = require('../.domain-build/application/TownProfiles');
  const { SAVE_KEY, BACKUP_KEY } = require('../.domain-build/domain/storage');
  const { writeSlot } = require('../.domain-build/application/ManualSaves');
  const { GameStart } = require('../.domain-build/application/GameStart');
  let state = g.createDemoGame(100000);
  const dock = state.buildings.find((b) => b.kind === 'dock');
  state = g.dispatch(
    state,
    { type: 'moveBuilding', buildingId: dock.id, x: 43, z: 152 },
    100000,
  ).state;
  const values = new Map([
    [SAVE_KEY, g.exportSave(g.createGame(100000))],
    [DEMO_REVISION_KEY, '2026-11-05-playable-catalog-4'],
    [`town-evolution.demo.${SAVE_KEY}`, g.exportSave(state)],
    [`town-evolution.demo.${BACKUP_KEY}`, g.exportSave(state)],
  ]);
  const storage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
  writeSlot(profileStorage(storage, 'demo'), 1, state, 100000, null);
  const before = [...values];
  const session = townSession(storage, 'demo', () => 100000);
  assert.deepEqual(session.state, state);
  assert.match(session.message, /模板已更新/);
  demoVillageFrame(session.state);
  assert.deepEqual([...values], before);
  const flow = new GameStart(storage, () => 100000);
  flow.profile = 'demo';
  flow.newGame();
  assert.deepEqual([...values], before);
  flow.back();
  assert.deepEqual([...values], before);
  flow.newGame();
  flow.confirm();
  assert.equal(values.get(DEMO_REVISION_KEY), DEMO_REVISION);
  assert.deepEqual(
    flow.session.state.buildings.find((b) => b.kind === 'dock'),
    g.createDemoGame(100000).buildings.find((b) => b.kind === 'dock'),
  );
  assert.equal(values.get(SAVE_KEY), before.find(([k]) => k === SAVE_KEY)[1]);
  for (const [key, value] of before.filter(([k]) => k.includes('manual')))
    assert.equal(values.get(key), value);
});

for (const [width, height] of [
  [320, 568],
  [390, 844],
  [844, 390],
  [1280, 720],
])
  test(`demo village keeps crops and near dock out of the sidebars at ${width}x${height}`, () => {
    const state = g.createDemoGame(100000),
      before = g.exportSave(state),
      frame = demoVillageFrame(state);
    const pixels =
      height / (2 * fittedOrthoHeight(width / height, 192) * homeZoom(192) * frame.zoomScale);
    const planar = Math.hypot(15, 18),
      length = Math.hypot(15, 20, 18);
    const points = [
      ...state.groundStacks
        .filter((p) => g.isCrop(p.item))
        .map((p) => ({ x: p.x + 0.5, z: p.z + 0.5 })),
      ...state.buildings.filter((b) => b.kind === 'dock').map((b) => ({ x: b.x + 1, z: b.z + 1 })),
    ];
    for (const p of points) {
      const x = width / 2 + (((p.x - frame.x) * 18 - (p.z - frame.z) * 15) / planar) * pixels;
      const y =
        height / 2 -
        ((((p.x - frame.x) * 15 + (p.z - frame.z) * 18) * 20) / (length * planar)) * pixels;
      assert.ok(x > 70 && x < width - 70, `${x} stays clear of the 56px side trays`);
      assert.ok(y > 100 && y < height - 80, `${y} stays clear of fixed navigation`);
    }
    assert.ok(
      (pixels * (2 / 3) * 33) / planar >= 10,
      'crop cells remain at least 10 logical pixels, rather than the one-pixel overview',
    );
    assert.equal(g.exportSave(state), before);
  });
