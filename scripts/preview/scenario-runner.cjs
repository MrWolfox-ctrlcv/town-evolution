/** Every setup uses visible UI; no live state/save injection. Rounds stay in one context. */
const { driver, until } = require('./ui-driver.cjs');
const { withDeadline } = require('./acceptance-deadline.cjs');
async function runScenario(suite, page, evidence, name, touch, overrides = {}) {
  const run =
    overrides.run ??
    ((module, suffix = name) =>
      require(`./${module}-interactions.cjs`)(page, evidence, suffix, touch));
  const controls = overrides.controls ?? driver(page, touch);
  const wait = overrides.until ?? until;
  if (suite === 'v6') return run('v6');
  if (suite === 'title') return run('title');
  if (suite === 'profiles') return run('demo');
  if (suite === 'settings') {
    // The settings preservation checks require a real normal save, not undefined===undefined.
    await controls.button('开始游戏', { exact: true });
    await wait(
      page,
      (state) =>
        state.profile === 'normal' &&
        state.save !== null &&
        state.panel.page === 'game' &&
        !state.panel.menuVisible,
      'normal save ready',
    );
    await controls.townActions();
    await controls.button('退出到标题', { exact: true });
    await controls.button('确认', { exact: true });
  }
  // Settings and checkpoint previously consumed a freshly reset demo after profiles.
  // Recreate that same entry state through the real title button, not by editing storage.
  await controls.button('游览演示岛', { exact: true });
  await wait(
    page,
    (state) =>
      state.profile === 'demo' &&
      state.save?.coins === 1000 &&
      state.panel.page === 'game' &&
      !state.panel.menuVisible,
    'fresh demo scene',
  );
  if (suite === 'settings') return run('settings');
  if (suite !== 'checkpoint') throw new Error(`Unknown scenario: ${suite}`);
  const checkpoint = [];
  const trace = overrides.trace ?? require('./phase-trace.cjs')(evidence, `${name}-rounds`);
  const deadline = overrides.deadline ?? withDeadline;
  for (let cycle = 0; cycle < 3; cycle++) {
    const label = `${name} checkpoint round ${cycle + 1}`;
    checkpoint.push(
      await trace(label, () =>
        deadline(
          async () => {
            // Reset belongs to the upcoming round's budget, never an unbounded gap.
            if (cycle) {
              await controls.townActions();
              await controls.button('存档', { exact: true });
              await controls.button('重置演示岛');
              await controls.button('确认');
            }
            return run('checkpoint', `${name}-round${cycle + 1}`);
          },
          360000,
          label,
          () => page.context().close(),
        ),
      ),
    );
  }
  return checkpoint;
}
module.exports = { runScenario };
