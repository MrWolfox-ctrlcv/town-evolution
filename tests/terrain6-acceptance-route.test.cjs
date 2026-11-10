/** Pure advisory route regression, not a claim of browser interaction passing. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { V6WorldPreparation } = require('../.domain-build/domain/v6-preparation');
const { createGame, dispatch } = require('../.domain-build/domain/game');
const { getV6EditSurface } = require('../.domain-build/domain/v6-edit-surface');
const { v6EditPlane, V6_EDIT_MAX_LEVEL } = require('../.domain-build/domain/v6-material-volume');
test('bounded browser advisory selector rejects the exhausted shallow cap and plans a funded route', () => {
  const prep = new V6WorldPreparation(42173);
  for (let i = 0; i < 200 && prep.progress.status === 'building'; i++) prep.step(50000);
  assert.equal(prep.progress.status, 'ready');
  prep.takeResult();
  const state = createGame(1000, 42173, 6);
  const before = JSON.stringify(state);
  const session = {
    state,
    preview(command) {
      return dispatch(this.state, command, 1000);
    },
  };
  const code = fs.readFileSync('scripts/preview/v6-interactions.cjs', 'utf8');
  const source = code.slice(
    code.indexOf('      const advisory ='),
    code.indexOf('      if (request.cell)'),
  );
  const choose = new Function('control', 'state', 'surface', 'planes', 'request', 'status', source);
  const result = choose(
    { session },
    state,
    getV6EditSurface(state),
    Array.from({ length: V6_EDIT_MAX_LEVEL + 1 }, (_, i) => v6EditPlane(i)),
    { candidates: true },
    {},
  );
  assert.ok(result.candidates.length > 0, 'at least one fully funded route exists');
  assert.ok(
    !result.candidates.some((c) => c.x === 11 && c.z === 11),
    'thin exhausted cap is not a complete route',
  );
  assert.equal(JSON.stringify(state), before, 'planning never mutates the live snapshot');
  assert.equal(session.state, state);
});
