/** Prepared real-pointer schema10 routes. No state injection, command execution or time travel. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { inspect, until, worldPoint, driver, ready } = require('./ui-driver.cjs');
const { drag, dragPath } = require('./pointer-input.cjs');
const { farmCellCenter } = require('../../.domain-build/application/FarmCells.js');
const { dropSnapshot } = require('../../.domain-build/application/DropSnapshot.js');
const {
  dropMovePlan,
  stackIntoDropPlan,
  stackLimitFor,
  worldSize,
} = require('../../.domain-build/domain/game.js');
const labels = { vegetable: '胡萝卜', wheat: '小麦', lettuce: '生菜', rice: '稻谷' };
function unchangedInventory(before, after) {
  assert.deepEqual(
    after.inventory,
    before.inventory,
    'Ground/container actions never silently enter town stock',
  );
  assert.equal(after.coins, before.coins, 'Ground/container actions never spend money');
}
module.exports = async (page, evidence, name, touch, { dragTool, showTool }) => {
  const { click, button, townActions } = driver(page, touch);
  await townActions();
  await button('查看全岛');
  let view = await inspect(page);
  const sample = view.save.buildings.find((b) => b.collectionBox);
  assert.ok(sample, 'Independent field-box demonstration exists');
  const samples = view.save.looseDrops.filter(
    (d) => d.source.type === 'crop' && d.source.buildingId === sample.id,
  );
  assert.equal(samples.length, 2, 'Two explicit demonstration drops');
  const [source, target] = samples;
  assert.equal(source.item, target.item);
  const merged = dropMovePlan(view.save, {
    type: 'moveDrop',
    source: dropSnapshot(source),
    target: { type: 'drop', drop: dropSnapshot(target) },
  });
  assert.equal(merged.reason, null);
  const stockBefore = view.save;
  await drag(
    page,
    view.drops.find((d) => d.id === source.id),
    view.drops.find((d) => d.id === target.id),
    touch,
    650,
  );
  view = await until(
    page,
    (s) =>
      s.save.looseDrops.find((d) => d.id === target.id)?.amount ===
      target.amount + merged.transferAmount,
    'loose drops stack directly',
  );
  unchangedInventory(stockBefore, view.save);
  const combined = view.save.looseDrops.find((d) => d.id === target.id);
  assert.equal(combined.x6, target.x6);
  assert.equal(combined.z6, target.z6);
  assert.equal(view.save.looseDrops.find((d) => d.id === source.id)?.amount ?? 0, merged.remaining);
  // The test selects a visible legal empty tile; the game receives only the real release position.
  let destination;
  const viewport = page.viewportSize();
  outer: for (let z = 0; z < worldSize(view.save.terrainVersion); z++)
    for (let x = 0; x < worldSize(view.save.terrainVersion); x++) {
      const plan = dropMovePlan(view.save, {
        type: 'moveDrop',
        source: dropSnapshot(combined),
        target: { type: 'ground', x, z },
      });
      if (plan.reason) continue;
      const point = await worldPoint(page, { x: x + 0.5, z: z + 0.5, y: 0.08 });
      if (
        point.x > 90 &&
        point.x < viewport.width - 90 &&
        point.y > 100 &&
        point.y < viewport.height - 150
      ) {
        destination = { x, z, point };
        break outer;
      }
    }
  assert.ok(destination, 'Visible legal ground destination exists');
  await drag(
    page,
    view.drops.find((d) => d.id === combined.id),
    destination.point,
    touch,
    650,
  );
  view = await until(
    page,
    (s) => !s.save.looseDrops.some((d) => d.id === combined.id),
    'loose drop moved into a ground pile',
  );
  const pile = view.save.groundStacks.find((p) => p.x === destination.x && p.z === destination.z);
  assert.equal(pile?.item, combined.item);
  assert.equal(pile.amount, combined.amount);
  unchangedInventory(stockBefore, view.save);
  // A normal field must create output at the harvested cell before any explicit pickup.
  const farm = view.save.buildings.find((b) => b.id === 'b2');
  const cell = farm.cropJobs.findIndex((job) => job?.crop === pile.item && job.readyAt <= view.now);
  assert.ok(cell >= 0, 'Original ordinary field retains a matching mature crop');
  const job = farm.cropJobs[cell],
    harvestBefore = view.save;
  await dragTool('HarvestTool', await worldPoint(page, { ...farmCellCenter(farm, cell), y: 0.25 }));
  view = await until(
    page,
    (s) => !s.save.buildings.find((b) => b.id === farm.id).cropJobs[cell],
    'manual ordinary-field harvest',
  );
  unchangedInventory(harvestBefore, view.save);
  const cropDrops = view.save.looseDrops.filter(
    (d) => d.source.type === 'crop' && d.source.jobId === job.id,
  );
  assert.equal(
    cropDrops.reduce((n, d) => n + d.amount, 0),
    job.yield,
  );
  assert.ok(cropDrops.length > 0);
  const receiving = cropDrops[0];
  const reverse = stackIntoDropPlan(view.save, {
    type: 'mergeStackIntoDrop',
    source: pile,
    target: dropSnapshot(receiving),
  });
  assert.equal(reverse.reason, null);
  await drag(
    page,
    await worldPoint(page, { x: pile.x + 0.5, z: pile.z + 0.5, y: 0.12 }),
    view.drops.find((d) => d.id === receiving.id),
    touch,
    650,
  );
  view = await until(
    page,
    (s) =>
      s.save.looseDrops.find((d) => d.id === receiving.id)?.amount ===
      receiving.amount + reverse.transferAmount,
    'ground pile merges into exact loose drop',
  );
  unchangedInventory(harvestBefore, view.save);
  assert.equal(
    view.save.groundStacks.find((p) => p.x === pile.x && p.z === pile.z)?.amount ?? 0,
    reverse.remaining,
  );
  assert.ok(
    view.save.looseDrops.find((d) => d.id === receiving.id).amount <= stackLimitFor(receiving.item),
  );
  await page.screenshot({ path: path.join(evidence, `${name}-loose-ground-transfers.png`) });
  const pickupBefore = view.save,
    picked = view.save.looseDrops.find((d) => d.id === receiving.id);
  await click(view.drops.find((d) => d.id === picked.id));
  await button(`拾取 ${labels[picked.item]} ×${picked.amount}`);
  view = await until(
    page,
    (s) => !s.save.looseDrops.some((d) => d.id === picked.id),
    'explicit pickup enters town stock',
  );
  assert.equal(
    view.save.inventory[picked.item],
    pickupBefore.inventory[picked.item] + picked.amount,
  );
  // Manual sickle -> local box, followed by an explicit withdrawal.
  const boxFarm = view.save.buildings.find((b) => b.id === sample.id);
  const boxCell = boxFarm.cropJobs.findIndex((job) => job && job.readyAt <= view.now);
  assert.ok(boxCell >= 0);
  const boxJob = boxFarm.cropJobs[boxCell],
    beforeBoxHarvest = view.save;
  await dragTool(
    'HarvestTool',
    await worldPoint(page, { ...farmCellCenter(boxFarm, boxCell), y: 0.25 }),
  );
  view = await until(
    page,
    (s) => !s.save.buildings.find((b) => b.id === sample.id).cropJobs[boxCell],
    'sickle places output in field box',
  );
  unchangedInventory(beforeBoxHarvest, view.save);
  assert.deepEqual(
    view.save.looseDrops,
    beforeBoxHarvest.looseDrops,
    'Box harvest creates no loose duplicates',
  );
  assert.equal(
    view.save.buildings.find((b) => b.id === sample.id).collectionBox.stock[boxJob.crop],
    boxFarm.collectionBox.stock[boxJob.crop] + boxJob.yield,
  );
  await click(view.buildings.find((b) => b.id === sample.id));
  const beforeWithdraw = view.save;
  await button(`取回${labels[boxJob.crop]} ×1`);
  view = await until(
    page,
    (s) => s.save.inventory[boxJob.crop] === beforeWithdraw.inventory[boxJob.crop] + 1,
    'explicit field-box withdrawal',
  );
  assert.equal(
    view.save.buildings.find((b) => b.id === sample.id).collectionBox.stock[boxJob.crop],
    beforeWithdraw.buildings.find((b) => b.id === sample.id).collectionBox.stock[boxJob.crop] - 1,
  );
  await page.screenshot({ path: path.join(evidence, `${name}-manual-field-box.png`) });
  // Objects require the hammer; a direct house/crate drag cannot silently merge.
  const house = view.save.buildings.find((b) => b.kind === 'house');
  const crate = view.save.buildings.find((b) => b.kind === 'crate');
  const beforeAssembly = view.save;
  await drag(
    page,
    view.buildings.find((b) => b.id === crate.id),
    view.buildings.find((b) => b.id === house.id),
    touch,
    650,
  );
  view = await inspect(page);
  assert.deepEqual(
    view.save,
    beforeAssembly,
    'Direct building/object merge is rejected atomically',
  );
  await showTool('hammerTool', 'ToolsLeftNext');
  view = await inspect(page);
  await dragPath(
    page,
    [
      view.tools.find((tool) => tool.name === 'hammerTool'),
      view.buildings.find((b) => b.id === crate.id),
      view.buildings.find((b) => b.id === house.id),
    ],
    touch,
  );
  view = await until(
    page,
    (s) => s.save.buildings.find((b) => b.id === house.id)?.kind === 'warehouse',
    'explicit hammer entity assembly',
  );
  assert.ok(!view.save.buildings.some((b) => b.id === crate.id));
  unchangedInventory(beforeAssembly, view.save);
  await page.screenshot({ path: path.join(evidence, `${name}-hammer-entity-assembly.png`) });
  const facility = view.save.buildings.find((b) => b.kind === 'stoneMill');
  const secondHouse = view.save.buildings.find((b) => b.kind === 'house');
  const beforeFacility = view.save;
  await drag(
    page,
    view.buildings.find((b) => b.id === facility.id),
    view.buildings.find((b) => b.id === secondHouse.id),
    touch,
    650,
  );
  view = await until(
    page,
    (s) => s.save.buildings.find((b) => b.id === secondHouse.id)?.kind === 'mill',
    'building facilities combine by direct drag',
  );
  assert.ok(!view.save.buildings.some((b) => b.id === facility.id));
  unchangedInventory(beforeFacility, view.save);
  const saved = view.save;
  await page.reload();
  await ready(page);
  await button('游览演示岛');
  view = await until(
    page,
    (s) => s.save?.buildings.find((b) => b.id === secondHouse.id)?.kind === 'mill',
    'new routes survive reload',
  );
  for (const key of ['inventory', 'buildings', 'looseDrops', 'groundStacks', 'commerce'])
    assert.deepEqual(view.save[key], saved[key], `Reload preserves ${key}`);

  return {
    dropToDrop: true,
    dropToGround: true,
    groundToDrop: true,
    ordinaryHarvestStaysOnGround: true,
    explicitPickup: true,
    manualFieldBox: true,
    explicitBoxWithdrawal: true,
    hammerEntityAssembly: true,
    directFacilityMerge: true,
    reloadPreservation: true,
  };
};
