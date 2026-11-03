const { test } = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game.js');
const { validatePlacement } = require('../.domain-build/domain/geometry.js');

function result(state, command) {
  return g.dispatch(state, command, state.lastSeenAt);
}
function shoreSites(state) {
  const sites = [];
  for (let z = 0; z < g.CONFIG.gridSize; z++)
    for (let x = 0; x < g.CONFIG.gridSize; x++) {
      const b = { id: 'new', kind: 'dock', x, z, rotation: 0 };
      try {
        validatePlacement(state, b);
      } catch {
        continue;
      }
      const facings = [0, 1, 2, 3].filter((rotation) =>
        g.isDockShore({ ...b, rotation }, state.mapSeed),
      );
      if (facings.length) sites.push({ x, z, facings });
    }
  return sites;
}
function fixture() {
  const state = g.createGame(0, 42173);
  state.trees = [];
  state.coins = 1000;
  return state;
}

test('automatic placement and relocation reach all four shores while preserving cargo and save', () => {
  let state = fixture();
  const sites = shoreSites(state);
  const unique = [0, 1, 2, 3].map((direction) =>
    sites.find((s) => s.facings.length === 1 && s.facings[0] === direction),
  );
  assert.ok(unique.every(Boolean), 'fixture has single-facing shores in every direction');
  let r = result(state, { type: 'place', kind: 'dock', x: unique[0].x, z: unique[0].z });
  assert.equal(r.ok, true, r.error);
  state = r.state;
  const id = state.buildings.at(-1).id;
  r = result(state, {
    type: 'dockTransfer',
    buildingId: id,
    item: 'vegetable',
    quantity: 1,
    direction: 'stage',
  });
  assert.equal(r.ok, true, r.error);
  state = r.state;
  const cargo = structuredClone(state.commerce);
  for (const direction of [1, 2, 3, 0]) {
    r = result(state, {
      type: 'moveBuilding',
      buildingId: id,
      x: unique[direction].x,
      z: unique[direction].z,
    });
    assert.equal(r.ok, true, r.error);
    state = r.state;
    const dock = state.buildings.find((b) => b.id === id);
    assert.equal(dock.rotation, direction);
    assert.ok(g.isDockShore(dock, state.mapSeed));
    assert.deepEqual(state.commerce, cargo);
    assert.deepEqual(g.importSave(g.exportSave(state), 0), state);
  }
  const before = JSON.stringify(state);
  r = result(state, { type: 'moveBuilding', buildingId: id, x: 10, z: 10 });
  assert.equal(r.ok, false);
  assert.equal(r.state, state);
  assert.equal(JSON.stringify(state), before);
});

test('rotation skips blocked directions and explains when no other facing is possible', () => {
  let state = fixture();
  const sites = shoreSites(state);
  const corner = sites.find((s) => s.facings.length === 2);
  const start = corner?.facings.find((f) => !corner.facings.includes((f + 1) % 4));
  const expected = corner?.facings.find((f) => f !== start);
  assert.ok(corner, 'corner requires skipping an invalid next direction');
  let r = result(state, { type: 'place', kind: 'dock', x: corner.x, z: corner.z, rotation: start });
  assert.equal(r.ok, true, r.error);
  state = r.state;
  const id = state.buildings.at(-1).id;
  r = result(state, { type: 'rotateBuilding', buildingId: id });
  assert.equal(r.ok, true, r.error);
  state = r.state;
  assert.equal(state.buildings.at(-1).rotation, expected);
  const straight = sites.find((s) => s.facings.length === 1);
  r = result(state, { type: 'moveBuilding', buildingId: id, x: straight.x, z: straight.z });
  assert.equal(r.ok, true, r.error);
  state = r.state;
  const before = JSON.stringify(state);
  r = result(state, { type: 'rotateBuilding', buildingId: id });
  assert.equal(r.ok, false);
  assert.match(r.error, /长按移动到其他岸边/);
  assert.equal(r.state, state);
  assert.equal(JSON.stringify(state), before);
});

test('explicit invalid facing is rejected and never silently reoriented', () => {
  const state = fixture();
  const shore = shoreSites(state).find((s) => s.facings.length === 1);
  const rotation = (shore.facings[0] + 1) % 4;
  const before = JSON.stringify(state);
  const r = result(state, { type: 'place', kind: 'dock', x: shore.x, z: shore.z, rotation });
  assert.equal(r.ok, false);
  assert.equal(r.state, state);
  assert.equal(JSON.stringify(state), before);
});
