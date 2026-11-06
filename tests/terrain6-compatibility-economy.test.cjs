/** New fractional terrain material must never relax legacy world stock validation or yields. */
const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const { SAVE_KEY, loadGame } = require('../.domain-build/domain/storage');

for (const version of [1, 2, 3, 4, 5])
  test(`terrain6 fixed-point material cannot enter a legacy v${version} save`, () => {
    const state = g.createGame(123000, 7, version);
    for (const item of ['soil', 'stone', 'wood', 'mud'])
      for (const amount of [1 / 4096, 0.5, 9 + 1 / 4096]) {
        const raw = structuredClone(state);
        raw.inventory[item] = amount;
        const bytes = JSON.stringify(raw);
        assert.throws(() => g.importSave(bytes, state.lastSeenAt));
        const data = new Map([[SAVE_KEY, bytes]]);
        const store = {
          getItem: (key) => data.get(key) ?? null,
          setItem: (key, value) => data.set(key, value),
          removeItem: (key) => data.delete(key),
        };
        assert.equal(loadGame(store, state.lastSeenAt).status, 'corrupt');
        assert.deepEqual(
          [...data],
          [[SAVE_KEY, bytes]],
          'Rejected old saves keep exact input bytes',
        );
      }
  });

for (const version of [2, 3, 4, 5])
  test(`terrain6 leaves v${version} tall soil mound at nine and stone layer at one`, () => {
    const state = g.createGame(123000, 7, version);
    const soil = state.naturalResources
      .filter((resource) => resource.kind === 'soil')
      .sort((a, b) => b.amount - a.amount)[0];
    const stone = state.naturalResources
      .filter((resource) => resource.kind === 'stone')
      .sort((a, b) => b.amount - a.amount)[0];
    assert.ok(soil.amount > 1 && stone.amount > 1);
    const before = g.exportSave(state);
    for (const resource of [soil, stone]) {
      const result = g.dispatch(
        state,
        { type: 'gatherNatural', resourceId: resource.id },
        state.lastSeenAt,
      );
      assert.equal(result.ok, true, result.error);
      assert.equal(g.exportSave(state), before);
      assert.deepEqual(
        result.state.inventory,
        state.inventory,
        'Gathering leaves output on the ground',
      );
      const drops = result.state.looseDrops.filter(
        (drop) => drop.source.type === 'natural' && drop.source.resourceId === resource.id,
      );
      assert.equal(
        drops.reduce((sum, drop) => sum + drop.amount, 0),
        resource.kind === 'soil' ? 9 : 1,
      );
      const remaining = result.state.naturalResources.find(
        (candidate) => candidate.id === resource.id,
      );
      if (resource.kind === 'soil') assert.equal(remaining, undefined);
      else assert.equal(remaining.amount, resource.amount - 1);
      assert.deepEqual(g.importSave(g.exportSave(result.state), state.lastSeenAt), result.state);
      const forged = structuredClone(result.state);
      forged.looseDrops.find((drop) => drop.id === drops[0].id).amount = 1 / 4096;
      assert.throws(() => g.importSave(JSON.stringify(forged), state.lastSeenAt));
    }
  });
