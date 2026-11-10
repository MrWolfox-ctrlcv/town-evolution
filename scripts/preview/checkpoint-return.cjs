/** Resume through visible UI after saving; retained town details may obscure mobile trays. */
const assert = require('node:assert/strict');
const { until, gameSceneReady } = require('./ui-driver.cjs');
const ui = require('./checkpoint-ui.cjs');
async function returnToToolTray(page, click, phase, overrides = {}) {
  const wait = overrides.until ?? until;
  const readUI = overrides.ui ?? ui;
  let state = await wait(page, (s) => gameSceneReady(s, 'demo'), 'saved demo game resumed');
  phase('saved game resumed', { panel: state.panel, tools: state.tools.map((t) => t.name) });
  if (state.panel.contextVisible) {
    const controls = await wait(
      page,
      (s) => Boolean(s.nodes.ContextClose),
      'visible retained context close',
      10000,
      readUI,
    );
    assert.ok(controls.nodes.ContextClose, 'Visible ContextClose before restoring tray');
    await click(controls.nodes.ContextClose);
  }
  state = await wait(
    page,
    (s) => gameSceneReady(s, 'demo') && !s.panel.contextVisible && s.tools.length > 0,
    'game details closed and tool tray visible',
  );
  phase('saved game tray ready', { panel: state.panel, tools: state.tools.map((t) => t.name) });
  return state;
}
module.exports = { returnToToolTray };
