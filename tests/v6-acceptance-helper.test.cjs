/** Isolated acceptance-script checks, NOT browser, rendering or performance evidence. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {
  relevant,
  sameCamera,
  inspectScene,
  assertExplicitSave,
} = require('../scripts/preview/v6-interactions.cjs');
const { V6_GENERATOR_REVISION } = require('../.domain-build/domain/v6-world');
const { SAVE_KEY } = require('../.domain-build/domain/storage');
const scoped = `town-evolution.v6-preview.${V6_GENERATOR_REVISION}.${SAVE_KEY}`;

function fixture() {
  const state = {
    schemaVersion: 10,
    mapSeed: 42173,
    terrainVersion: 6,
    terrainRevision: V6_GENERATOR_REVISION,
    terrain6: { format: 1, nextOperation: 1, cells: [] },
    inventory: { soil: 0, stone: 0 },
    tools: { diggingTool: 1 },
    coins: 0,
    looseDrops: [],
    naturalResources: [{ x: 10, z: 10, id: 'r1' }],
  };
  const calls = [];
  const session = {
    state,
    statusMessage: '',
    preview(command) {
      calls.push(structuredClone(command));
      // Model each advisory command on its receiver snapshot, as GameSession does.
      const next = structuredClone(this.state);
      if (command.type === 'pickupDrop') {
        const drop = next.looseDrops.find((d) => d.id === command.dropId);
        assert.ok(drop, 'planning must pick up a drop produced by its prior dig');
        next.inventory[drop.item] += drop.amount;
        next.looseDrops = next.looseDrops.filter((d) => d.id !== command.dropId);
      } else {
        assert.equal(command.type, 'editTerrain6');
        next.terrain6.nextOperation++;
        next.terrain6.cells = [{ x: command.x, z: command.z, level: command.level }];
        if (command.kind === 'fill') {
          if (next.inventory[command.material] < 1)
            return { ok: false, state: this.state, error: 'insufficient material' };
          next.inventory[command.material] -= 1;
        } else
          next.looseDrops.push({
            id: 'd1',
            item: 'soil',
            amount: 1.25,
            source: {
              type: 'terrain6',
              x: command.x,
              z: command.z,
              operation: command.expectedOperation,
            },
          });
      }
      return { ok: true, state: next };
    },
    run() {
      throw Error('Inspection must never commit');
    },
    save() {
      throw Error('Inspection must never persist');
    },
  };
  const town = {
    island: { v6: { source: { heightInCell: () => 2, range: () => [1.2, 2.2] } } },
    surfaceStatus: { overviewVisible: true, phase: 'detail', readyChunks: 1, requestedChunks: 12 },
    surfaceProblem: null,
    isGroundReady: () => true,
    pickTerrain: (ray) => ({ x: Math.floor(ray.x / 10), z: Math.floor(ray.y / 10) }),
    pickBuilding: () => null,
    pickTree: () => null,
    pickDrop: () => null,
    pickStack: () => null,
    objectBounds: () => ({ min: [10, 1, 10], max: [11, 2, 11] }),
    dropOrigin: () => ({ x: 10.5, y: 1, z: 10.5 }),
  };
  const map = {
    camera: { orthoHeight: 10 },
    focus: { x: 6, z: 6 },
    project: (p) => ({ x: p.x * 10, y: p.z * 10 }),
    contains: () => true,
    screenRay: (p) => p,
  };
  const boot = {
    flow: { page: 'game', profile: 'v6-preview', storageWarning: '' },
    controller: { session, town, map, ui: { terrainMode: 'dig', terrainMaterial: 'soil' } },
  };
  const context = {
    System: {
      import: async () => ({
        director: { getScene: () => ({ getChildByName: () => ({ getComponent: () => boot }) }) },
      }),
    },
    document: {
      querySelector: () => ({
        width: 2000,
        height: 1600,
        getBoundingClientRect: () => ({ left: 10, top: 20, width: 1000, height: 800 }),
      }),
    },
    window: { __townPreview: { frames: 20 } },
    localStorage: {
      getItem: (key) => {
        assert.equal(key, scoped);
        return JSON.stringify(state);
      },
      setItem: () => {
        throw Error('Inspection must not write storage');
      },
      removeItem: () => {
        throw Error('Inspection must not remove storage');
      },
    },
  };
  const page = {
    evaluate: async (callback, argument) =>
      structuredClone(await vm.runInNewContext(`(${callback.toString()})`, context)(argument)),
  };
  return { page, state, calls, town, map, boot };
}

test('isolated read-only inspection uses published local readiness, not whole-island settlement', async () => {
  const f = fixture();
  const result = await inspectScene(f.page, { snapshot: true });
  assert.equal(result.surface.phase, 'detail');
  assert.equal(result.homeReady, true);
  assert.equal(result.focusReady, true);
  assert.deepEqual(result.live, f.state);
  assert.deepEqual(result.saved, f.state);
  assert.deepEqual(f.calls, []);
});

test('isolated target projection round-trips CSS/device scale and advisory plan leaves state intact', async () => {
  const f = fixture(),
    before = structuredClone(f.state);
  const result = await inspectScene(f.page, { cell: { x: 10, z: 10 }, kind: 'dig', touch: true });
  assert.deepEqual(result.point, { x: 62.5, y: 767.5 });
  assert.equal(result.clear, true);
  assert.equal(result.plan.allowed, true);
  assert.equal(result.plan.command.level, 1);
  assert.equal(result.plan.command.expectedOperation, 1);
  assert.equal(result.plan.yield.soil, 1.25);
  assert.equal(result.plan.drops[0].id, 'd1');
  assert.deepEqual(f.state, before);
});

test('isolated target rejects obstructed and unpublished terrain, rather than trusting projection', async () => {
  const f = fixture();
  f.town.pickBuilding = () => 'visible-building';
  assert.equal((await inspectScene(f.page, { cell: { x: 10, z: 10 } })).clear, false);
  f.town.pickBuilding = () => null;
  f.town.pickTerrain = () => null;
  f.town.isGroundReady = () => false;
  const result = await inspectScene(f.page, { cell: { x: 10, z: 10 } });
  assert.equal(result.clear, false);
  assert.equal(result.groundReady, false);
});

test('isolated local candidate search is bounded and never previews remote resources', async () => {
  const f = fixture();
  f.state.naturalResources = Array.from({ length: 100 }, (_, i) => ({
    x: 10 + (i % 10),
    z: 10 + Math.floor(i / 10),
  }));
  f.state.naturalResources.push({ x: 100, z: 100 });
  const result = await inspectScene(f.page, { candidates: true });
  assert.equal(result.candidates.length, 8);
  assert.ok(f.calls.length <= 48);
  const edits = f.calls.filter((c) => c.type === 'editTerrain6');
  assert.ok(edits.length > 0);
  assert.ok(edits.every((c) => Math.hypot(c.x - 6, c.z - 6) <= 32));
  assert.ok(
    f.calls.every(
      (c) => c.type === 'editTerrain6' || (c.type === 'pickupDrop' && c.dropId === 'd1'),
    ),
  );
  assert.equal(f.state.terrain6.nextOperation, 1);
  assert.equal(f.state.inventory.soil, 0);
});

test('isolated drop inspector requires the exact visible drop ID', async () => {
  const f = fixture();
  f.town.pickDrop = () => 'other-drop';
  assert.equal((await inspectScene(f.page, { drop: 'd1', touch: true })).dropPoint, null);
  f.town.pickDrop = () => 'd1';
  assert.deepEqual((await inspectScene(f.page, { drop: 'd1', touch: true })).dropPoint, {
    x: 62.5,
    y: 767.5,
  });
});

test('persisted-state comparator ignores only irrelevant clocks and retains consequential fields', () => {
  const { state } = fixture();
  assert.deepEqual(relevant({ ...state, lastSeenAt: 1 }), relevant({ ...state, lastSeenAt: 999 }));
  for (const key of ['terrain6', 'inventory', 'tools', 'looseDrops', 'naturalResources', 'coins']) {
    assert.notDeepEqual(relevant(state), relevant({ ...state, [key]: 'changed' }), key);
  }
  sameCamera({ height: 10, focus: { x: 6, y: 6 } }, { height: 10, focus: { x: 6, y: 6 } }, 'equal');
  assert.throws(() =>
    sameCamera(
      { height: 10, focus: { x: 96, y: 96 } },
      { height: 10, focus: { x: 6, y: 6 } },
      'unexpected overview',
    ),
  );
});

test('script source requires real fill and failure evidence without state injection or global-ready gate', () => {
  const source = fs.readFileSync('scripts/preview/v6-interactions.cjs', 'utf8');
  assert.doesNotMatch(source, /localStorage\.(?:setItem|removeItem|clear)\s*\(/);
  assert.doesNotMatch(source, /(?:session|flow)\.(?:run|save|start|reset)\s*\(/);
  assert.doesNotMatch(source, /phase\s*===\s*['"]ready['"]/);
  assert.match(source, /assert\.ok\(\s*fillPlan,/);
  assert.match(source, /report\.failure/);
  assert.match(source, /report\.passed = true/);
  assert.match(source, /await drag\(page, await showTool\(\), fill\.point, touch\)/);
});

test('isolated flow feedback remains distinct from the session status', async () => {
  const f = fixture();
  f.boot.flow.message = '自动存档已更新。';
  f.boot.controller.session.statusMessage = 'earlier gameplay feedback';
  const result = await inspectScene(f.page, { snapshot: true });
  assert.equal(result.flowMessage, '自动存档已更新。');
  assert.equal(result.message, 'earlier gameplay feedback');
});

test('explicit save proof rejects no-op, false feedback and gameplay changes', () => {
  const before = { ...fixture().state, lastSeenAt: 1000 };
  const saved = { ...before, lastSeenAt: 1001 };
  const snapshot = { flowMessage: '自动存档已更新。', saved, live: saved };
  assertExplicitSave(before, snapshot);
  assert.throws(
    () => assertExplicitSave(before, { ...snapshot, saved: before }),
    /persisted clock/,
  );
  assert.throws(
    () => assertExplicitSave(before, { ...snapshot, flowMessage: '' }),
    /reports successful/,
  );
  assert.throws(
    () => assertExplicitSave(before, { ...snapshot, saved: { ...saved, coins: 1 } }),
    /preserves gameplay/,
  );
  assert.throws(
    () => assertExplicitSave(before, { ...snapshot, live: { ...saved, coins: 1 } }),
    /matches live/,
  );
});
