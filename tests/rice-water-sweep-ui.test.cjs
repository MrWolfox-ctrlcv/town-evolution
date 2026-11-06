const { looseAmount, assertCropDrops } = require('./helpers/loose-output.cjs');
/** Real FarmTools, canonical CPU rice meshes and saves; not a browser/device render check. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, game, project, farmCellCenter } = require('./helpers/farm-picking-ui.cjs');
const { SAVE_KEY } = require('../.domain-build/domain/storage');

for (const large of [false, true])
  for (const rotation of [0, 1, 2, 3])
    test(`rice sweeps every crossed water cell and persists one harvest: ${large ? 'large' : 'ordinary'} rotation ${rotation}`, () => {
      const f = fixture({ large, rotation, crop: 'rice', occupied: false });
      for (const item of game.ITEM_KEYS) f.session.state.inventory[item] = 0;
      f.session.state.inventory.rice = 8;
      assert.equal(f.session.save(), true);
      assert.equal(f.farm.irrigated, true);
      const first = farmCellCenter(f.farm, 0);
      const last = farmCellCenter(f.farm, f.size - 1);
      const start = project({ ...first, y: 0.182 });
      const end = project({ ...last, y: 0.182 });
      f.tools.begin('plant', 71, start, 'rice');
      assert.equal(f.tools.end(71, end), true);
      assert.equal(f.session.state.inventory.rice, 8 - f.size);
      assert.equal(f.session.state.buildings[1].cropJobs.filter(Boolean).length, f.size);
      assert.equal(new Set(f.commands.map((c) => c.cell)).size, f.size);
      assert.equal(f.refreshes(), 1, 'coalesced planting refreshes after the complete sweep');
      assert.ok(
        f.session.state.buildings[1].cropJobs.filter(Boolean).every((job) => job.crop === 'rice'),
      );
      assert.deepEqual(game.importSave(f.values.get(SAVE_KEY), f.now), f.session.state);

      f.setNow(f.now + game.CROPS.rice.durationMs);
      f.commands.length = f.commandFrames.length = 0;
      const cutStart = project({ ...first, y: 0.55 });
      const cutEnd = project({ ...last, y: 0.55 });
      f.tools.begin('harvest', 72, cutStart);
      assert.equal(f.tools.end(72, cutEnd), true);
      assert.equal(f.session.state.inventory.rice, 8 - f.size);
      assertCropDrops(
        f.session.state,
        f.farm,
        Array.from({ length: f.size }, (_, i) => i),
        'rice',
      );
      assert.equal(
        f.session.state.inventory.rice + looseAmount(f.session.state, 'rice'),
        8 + f.size,
      );
      assert.equal(f.session.state.buildings[1].cropJobs.filter(Boolean).length, 0);
      assert.equal(new Set(f.commands.map((c) => c.cell)).size, f.size);
      assert.deepEqual(
        f.commandFrames.map((frame) => frame.rendered),
        Array(f.size).fill(f.size),
      );
      assert.deepEqual(game.importSave(f.values.get(SAVE_KEY), f.now), f.session.state);
      const saved = f.values.get(SAVE_KEY);
      const writes = f.writes();
      assert.equal(f.tools.end(72, cutEnd), false);
      f.tools.move(72, cutStart);
      assert.equal(f.values.get(SAVE_KEY), saved);
      assert.equal(f.writes(), writes, 'repeated end/move cannot duplicate the harvest');
    });
