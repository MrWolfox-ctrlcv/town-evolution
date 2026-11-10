/** Driver synchronization unit checks; not a substitute for actual browser acceptance. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { driver, until, gameSceneReady } = require('../scripts/preview/ui-driver.cjs');

test('townActions waits for visible context, not only the flow page or stale settings labels', async () => {
  let stage = 0,
    pendingReads = 0;
  const clicks = [];
  const page = {
    mouse: {
      click: async (x) => {
        clicks.push(x);
        stage++;
      },
    },
    evaluate: async (_fn, args) => {
      if (!args) return;
      const ready = stage === 2 && ++pendingReads > 1;
      return {
        targets: [{ name: 'Menu-settings', x: 10, y: 10 }],
        labels: [{ text: ready ? '存档' : '小镇事务', action: true, x: 20, y: 20 }],
        panel: {
          page: stage === 2 ? 'game' : 'settings',
          menuVisible: !ready,
          contextVisible: ready,
          tab: ready ? 'tools' : 'manage',
        },
      };
    },
  };
  await driver(page, false).townActions();
  assert.deepEqual(clicks, [10, 20], 'open each control once, never reopen to hide a failure');
  assert.equal(pendingReads, 2, 'must wait past page=game while settings still visible');
});

test('exact button matching cannot confuse 存档 with 存档管理', async () => {
  const clicks = [];
  const page = {
    mouse: { click: async (x) => clicks.push(x) },
    evaluate: async (_fn, args) =>
      args
        ? {
            labels: [
              { text: '存档管理', action: true, x: 10, y: 10 },
              { text: '存档', action: true, x: 20, y: 20 },
            ],
          }
        : undefined,
  };
  await driver(page, false).button('存档', { exact: true });
  assert.deepEqual(clicks, [20]);
});

test('scene transition polling awaits inspection and returns the exact snapshot that met readiness', async () => {
  let reads = 0;
  const result = await until(
    null,
    (state) => state.ready,
    'scene transition',
    1000,
    async () => ({ ready: ++reads === 2 }),
  );
  assert.equal(reads, 2);
  assert.equal(result.ready, true);
});

test('persisted upgrade cannot provide title-camera coordinates before the game scene is ready', async () => {
  const saved = { fusion: { discoveries: { 'expand-warehouse': { count: 1 } } } };
  const states = [
    {
      profile: 'demo',
      save: saved,
      panel: { page: 'game', menuVisible: true, gameWorldReady: false },
      buildings: [{ id: 'b6', x: 10, y: 20 }],
    },
    {
      profile: 'demo',
      save: saved,
      panel: { page: 'game', menuVisible: false, gameWorldReady: false },
      buildings: [{ id: 'b6', x: 15, y: 25 }],
    },
    {
      profile: 'demo',
      save: saved,
      panel: { page: 'game', menuVisible: false, gameWorldReady: true },
      buildings: [{ id: 'b6', x: 214, y: 392 }],
    },
  ];
  let reads = 0;
  const state = await until(
    null,
    (view) => gameSceneReady(view, 'demo') && view.save.fusion.discoveries['expand-warehouse'],
    'actual game target',
    1000,
    async () => states[reads++],
  );
  assert.equal(reads, 3);
  assert.deepEqual(state.buildings[0], { id: 'b6', x: 214, y: 392 });
});
