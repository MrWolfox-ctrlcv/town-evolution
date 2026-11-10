const test = require('node:test');
const assert = require('node:assert/strict');
const { capturePlan, SUITES } = require('../scripts/preview/capture-plan.cjs');
const { runScenario } = require('../scripts/preview/scenario-runner.cjs');
test('default plan includes every independent scene on both devices; selection is explicit', () => {
  const plan = capturePlan();
  assert.equal(plan.length, 10);
  for (const suite of SUITES)
    assert.deepEqual(
      plan.filter((s) => s.suite === suite).map((s) => s.device),
      ['desktop', 'mobile'],
    );
  assert.deepEqual(capturePlan(['--suite', 'checkpoint', '--device', 'mobile']), [
    { suite: 'checkpoint', device: 'mobile', width: 390, height: 844 },
  ]);
  assert.deepEqual(capturePlan(['--suite=title', '--device=desktop']), [
    { suite: 'title', device: 'desktop', width: 1280, height: 800 },
  ]);
  assert.equal(capturePlan(['--suite', 'legacy']).length, 8);
  for (const args of [
    ['--suite', 'missing'],
    ['--device', 'phone'],
    ['--suite'],
    ['--skip', 'title'],
  ])
    assert.throws(() => capturePlan(args));
});
function fixture() {
  const events = [];
  const page = {};
  const options = {
    trace: async (_label, run) => run(),
    deadline: async (run, milliseconds) => {
      assert.equal(milliseconds, 360000);
      return run();
    },
    controls: {
      button: async (name) => events.push(name),
      townActions: async () => events.push('townActions'),
    },
    until: async (actual, predicate, message) => {
      if (message === 'normal save ready') {
        assert.equal(
          predicate({ profile: 'normal', save: {}, panel: { page: 'game', menuVisible: false } }),
          true,
        );
        events.push(message);
        return;
      }
      assert.equal(actual, page);
      assert.equal(
        predicate({
          profile: 'demo',
          save: { coins: 1000 },
          panel: { page: 'game', menuVisible: false },
        }),
        true,
      );
      assert.equal(
        predicate({
          profile: 'demo',
          save: { coins: 1000 },
          panel: { page: 'game', menuVisible: true },
        }),
        false,
      );
      events.push('demo ready');
    },
    run: async (name, suffix) => {
      events.push([name, suffix]);
      return name;
    },
  };
  return { events, page, options };
}
test('title/profiles/v6 preserve entire original scene without injected setup', async () => {
  for (const [suite, module] of [
    ['title', 'title'],
    ['profiles', 'demo'],
    ['v6', 'v6'],
  ]) {
    const f = fixture();
    await runScenario(suite, f.page, '', 'case', false, f.options);
    assert.deepEqual(f.events, [[module, undefined]]);
  }
});
test('settings enters a fresh demo via visible UI and runs all original settings checks', async () => {
  const f = fixture();
  await runScenario('settings', f.page, '', 'case', false, f.options);
  assert.deepEqual(f.events, [
    '开始游戏',
    'normal save ready',
    'townActions',
    '退出到标题',
    '确认',
    '游览演示岛',
    'demo ready',
    ['settings', undefined],
  ]);
});
test('checkpoint keeps three complete rounds sequentially in the same page, with real reset UI between', async () => {
  const f = fixture();
  const result = await runScenario('checkpoint', f.page, '', 'case', true, f.options);
  assert.deepEqual(result, ['checkpoint', 'checkpoint', 'checkpoint']);
  assert.deepEqual(f.events, [
    '游览演示岛',
    'demo ready',
    ['checkpoint', 'case-round1'],
    'townActions',
    '存档',
    '重置演示岛',
    '确认',
    ['checkpoint', 'case-round2'],
    'townActions',
    '存档',
    '重置演示岛',
    '确认',
    ['checkpoint', 'case-round3'],
  ]);
});

test('round deadline includes reset and aborts later rounds on failure', async () => {
  const f = fixture(),
    budgets = [];
  let active = false;
  const original = f.options.controls.townActions;
  f.options.controls.townActions = async () => {
    assert.equal(active, true);
    await original();
  };
  f.options.deadline = async (run, milliseconds, label) => {
    budgets.push({ milliseconds, label });
    active = true;
    try {
      return await run();
    } finally {
      active = false;
    }
  };
  const error = new Error('round two timed out');
  f.options.run = async (_module, suffix) => {
    assert.equal(active, true);
    if (suffix.endsWith('round2')) throw error;
    return 'round one';
  };
  await assert.rejects(
    runScenario('checkpoint', f.page, '', 'case', false, f.options),
    (actual) => actual === error,
  );
  assert.deepEqual(budgets, [
    { milliseconds: 360000, label: 'case checkpoint round 1' },
    { milliseconds: 360000, label: 'case checkpoint round 2' },
  ]);
  assert.equal(f.events.filter((event) => event === '重置演示岛').length, 1);
});
