/** Tests the read-only browser inspection/paging helper, not a WebGL or gameplay pass. */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { inspect, driver } = require('../scripts/preview/ui-driver.cjs');
const { SAVE_KEY } = require('../.domain-build/domain/storage');
const { PROFILE_KEY, profileStorage } = require('../.domain-build/application/TownProfiles');
const profiles = ['normal', 'demo', 'v5-preview', 'v5-bridge-demo', 'v6-preview'];
const keys = Object.fromEntries(
  profiles.map((profile) => [
    profile,
    profileStorage({ getItem: (key) => key }, profile).getItem(SAVE_KEY),
  ]),
);
function fixture(profile = 'demo', pages = [['测试']], nodes = []) {
  const data = new Map(profiles.map((p) => [keys[p], JSON.stringify({ marker: p })]));
  if (profile !== null) data.set(PROFILE_KEY, profile);
  const reads = [],
    clicks = [];
  let pageIndex = 0;
  const point = { x: 40, y: 40, z: 0 };
  const node = (name) => ({ name, children: [], activeInHierarchy: true, worldPosition: point });
  const cc = {
    Camera: 'camera',
    Label: 'label',
    UITransform: 'ui',
    Sprite: 'sprite',
    Vec3: class {
      constructor(x, y, z) {
        Object.assign(this, { x, y, z });
      }
    },
  };
  const labels = () =>
    pages[pageIndex].map((text, index) => ({
      string: text,
      node: {
        ...node('Label'),
        parent: {
          ...node(text === '回家' ? 'TerrainView:回家' : 'Action'),
          worldPosition: { x: 40 + index * 60, y: 40, z: 0 },
        },
      },
    }));
  const camera = (name) => ({ node: node(name), orthoHeight: 8, worldToScreen: (p) => p });
  const scene = {
    ...node('Scene'),
    getChildByName: (name) =>
      name === 'Town'
        ? {
            getComponent: (type) =>
              type === 'TownBootstrap'
                ? {
                    flow: { page: 'game' },
                    menu: { root: { activeInHierarchy: false } },
                    controller: {
                      hud: { bottom: { context: { activeInHierarchy: true } } },
                      ui: { tab: 'tools' },
                    },
                  }
                : null,
          }
        : null,
    getComponentsInChildren: (kind) =>
      ({
        camera: [camera('UICamera'), camera('WorldCamera')],
        label: labels(),
        ui: nodes.map((name) => ({ node: node(name) })),
        sprite: [],
      })[kind],
  };
  cc.director = { getScene: () => scene };
  const sandbox = {
    System: { import: async () => cc },
    document: {
      querySelector: () => ({
        width: 1280,
        height: 800,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
      }),
    },
    localStorage: {
      getItem: (key) => {
        reads.push(key);
        return data.get(key) ?? null;
      },
    },
    requestAnimationFrame: (fn) => fn(),
  };
  const click = async (x) => {
    const text = pages[pageIndex][Math.round((x - 40) / 60)];
    clicks.push(text);
    if (/^更多 \d+\/\d+$/.test(text)) pageIndex = (pageIndex + 1) % pages.length;
  };
  const page = {
    evaluate: (fn, arg) =>
      vm.runInNewContext(`(${fn.toString()})(argument)`, { ...sandbox, argument: arg }),
    mouse: { click },
    touchscreen: { tap: click },
  };
  return { page, data, reads, clicks };
}
for (const profile of profiles) {
  test(`preview inspection reads actual ${profile} primary without another profile fallback`, async () => {
    const f = fixture(profile),
      view = await inspect(f.page);
    assert.equal(view.profile, profile);
    assert.equal(view.saveKey, keys[profile]);
    assert.equal(view.save.marker, profile);
    assert.deepEqual(f.reads, [PROFILE_KEY, keys[profile]]);
  });
}
test('unset or unknown active profile retains the production demo fallback', async () => {
  for (const profile of [null, 'obsolete']) {
    const f = fixture(profile),
      view = await inspect(f.page);
    assert.equal(view.profile, 'demo');
    assert.equal(view.saveKey, keys.demo);
    assert.equal(view.save.marker, 'demo');
  }
});
test('missing or malformed v6 primary never silently returns a valid demo save', async () => {
  const f = fixture('v6-preview');
  f.data.delete(keys['v6-preview']);
  assert.equal((await inspect(f.page)).save, null);
  f.data.set(keys['v6-preview'], '{invalid');
  await assert.rejects(() => inspect(f.page), /JSON|property name/);
  assert.ok(!f.reads.includes(keys.demo));
});
test('actual v6 navigation and digging tray names are discoverable', async () => {
  const names = [
    'diggingToolTool',
    'TerrainView:回家',
    'TerrainView:全岛',
    'ContextClose',
    'ToolsLeftNext',
    'ProductsRightNext',
  ];
  const view = await inspect(fixture('v6-preview', [['回家']], names).page);
  assert.equal(view.labels[0].action, true);
  assert.ok(view.tools.some((tool) => tool.name === 'diggingToolTool'));
  for (const name of names.slice(1))
    assert.ok(
      view.targets.some((target) => target.name === name),
      name,
    );
});
for (const touch of [false, true]) {
  test(`paged button calls the ${touch ? 'touch' : 'mouse'} driver to reach a later rendered action`, async () => {
    const f = fixture('v6-preview', [
      ['开田', '更多 1/2'],
      ['购买作物', '更多 2/2'],
    ]);
    await driver(f.page, touch).pagedButton('购买作物');
    assert.deepEqual(f.clicks, ['更多 1/2', '购买作物']);
  });
}
test('paged lookup fails boundedly after a complete cycle without selecting unrelated actions', async () => {
  const f = fixture('v6-preview', [
    ['开田', '更多 1/2'],
    ['挖地', '更多 2/2'],
  ]);
  await assert.rejects(() => driver(f.page, false).pagedButton('不存在'), /full page cycle/);
  assert.deepEqual(f.clicks, ['更多 1/2', '更多 2/2']);
});
test('paged lookup preserves the unique rendered-action assertion', async () => {
  const f = fixture('v6-preview', [['填地', '填地']]);
  await assert.rejects(() => driver(f.page, false).pagedButton('填地'), /Unique rendered button/);
  assert.deepEqual(f.clicks, []);
});
