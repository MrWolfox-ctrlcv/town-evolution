const test = require('node:test');
const assert = require('node:assert/strict');
const { returnToToolTray } = require('../scripts/preview/checkpoint-return.cjs');
const game = (contextVisible, tools = []) => ({
  profile: 'demo',
  panel: { page: 'game', menuVisible: false, gameWorldReady: true, contextVisible },
  tools,
});
test('saving resumes retained detail overlay, closes it once and waits for actual tools', async () => {
  const clicks = [],
    phases = [];
  let count = 0;
  const states = [
    game(true),
    { nodes: { ContextClose: { x: 10, y: 20 } } },
    game(false, [{ name: 'WoodStock' }]),
  ];
  const result = await returnToToolTray(
    null,
    async (p) => clicks.push(p),
    (s) => phases.push(s),
    {
      until: async (_page, predicate) => {
        const state = states[count++];
        assert.equal(predicate(state), true);
        return state;
      },
    },
  );
  assert.deepEqual(clicks, [{ x: 10, y: 20 }]);
  assert.equal(result.tools[0].name, 'WoodStock');
  assert.equal(count, 3);
  assert.deepEqual(phases, ['saved game resumed', 'saved game tray ready']);
});
test('already unobscured desktop tray needs no close click or reopening', async () => {
  const state = game(false, [{ name: 'WoodStock' }]);
  let clicks = 0;
  await returnToToolTray(
    null,
    async () => clicks++,
    () => {},
    {
      until: async (_page, predicate) => {
        assert.equal(predicate(state), true);
        return state;
      },
    },
  );
  assert.equal(clicks, 0);
});
test('saved data alone and hidden tray do not satisfy resume readiness', async () => {
  let calls = 0;
  const ready = game(false, [{ name: 'WoodStock' }]);
  await returnToToolTray(
    null,
    async () => assert.fail('no click expected'),
    () => {},
    {
      until: async (_page, predicate) => {
        if (calls++ === 0)
          assert.equal(
            predicate({ ...ready, panel: { ...ready.panel, menuVisible: true } }),
            false,
          );
        else assert.equal(predicate(game(false)), false);
        assert.equal(predicate(ready), true);
        return ready;
      },
    },
  );
});
