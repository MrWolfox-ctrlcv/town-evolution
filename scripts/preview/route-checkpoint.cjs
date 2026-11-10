/** Prepared real-pointer schema10 routes. No state injection, command execution or time travel. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { focusDropPair, separation } = require('./focus-drop-pair.cjs');
const { focusWorldTargets, projectPoints, visible } = require('./focus-world-targets.cjs');
const { inspect, until, worldPoint, driver, ready } = require('./ui-driver.cjs');
const { drag, dragPath } = require('./pointer-input.cjs');
const { farmCellCenter } = require('../../.domain-build/application/FarmCells.js');
const { dropSnapshot } = require('../../.domain-build/application/DropSnapshot.js');
const {
  dropMovePlan,
  stackIntoDropPlan,
  stackLimitFor,
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
  const overviewHeight = view.cameraHeight;
  view = await focusDropPair(page, source.id, target.id, touch);
  unchangedInventory(stockBefore, view.save);
  assert.deepEqual(
    view.save.looseDrops,
    stockBefore.looseDrops,
    'Zoom never moves or collects drops',
  );
  fs.writeFileSync(
    path.join(evidence, `${name}-drop-focus.json`),
    JSON.stringify(
      {
        overviewHeight,
        focusedHeight: view.cameraHeight,
        separation: separation(
          view.drops.find((d) => d.id === source.id),
          view.drops.find((d) => d.id === target.id),
        ),
      },
      null,
      2,
    ),
  );
  await drag(
    page,
    view.drops.find((d) => d.id === source.id),
    view.drops.find((d) => d.id === target.id),
    touch,
    650,
    require('./drop-drag-trace.cjs')(page, path.join(evidence, `${name}-drop-drag-trace.json`), [
      source.id,
      target.id,
    ]),
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
  // Bounded nearby candidates, one projection batch, never a world-wide RPC scan.
  const origin = { x: Math.floor(combined.x6 / 6), z: Math.floor(combined.z6 / 6) };
  const candidates = [];
  for (let radius = 1; radius <= 4; radius++)
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        const x = origin.x + dx,
          z = origin.z + dz;
        const plan = dropMovePlan(view.save, {
          type: 'moveDrop',
          source: dropSnapshot(combined),
          target: { type: 'ground', x, z },
        });
        if (!plan.reason) candidates.push({ x, z });
      }
  const projected = await projectPoints(
    page,
    candidates.map((p) => ({ x: p.x + 0.5, z: p.z + 0.5, y: 0.08 })),
  );
  const index = projected.findIndex((p) => visible(p, page.viewportSize()));
  assert.ok(index >= 0, 'Visible legal nearby ground destination exists');
  const destination = { ...candidates[index], point: projected[index] };
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
  const ordinary = view.save.buildings
    .filter((b) => !b.collectionBox && b.cropJobs)
    .flatMap((farm) =>
      farm.cropJobs.flatMap((job, cell) =>
        job?.crop === pile.item && job.readyAt <= view.now
          ? [{ farm, cell, point: farmCellCenter(farm, cell) }]
          : [],
      ),
    )
    .sort(
      (a, b) =>
        Math.hypot(a.point.x - pile.x, a.point.z - pile.z) -
        Math.hypot(b.point.x - pile.x, b.point.z - pile.z),
    );
  assert.ok(
    ordinary.length > 0,
    'Ordinary field without a collection box retains a matching mature crop',
  );
  const { farm, cell } = ordinary[0];
  view = await focusWorldTargets(page, [farmCellCenter(farm, cell)], touch);
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
  view = await focusWorldTargets(
    page,
    [{ x: pile.x + 0.5, z: pile.z + 0.5 }, farmCellCenter(farm, cell)],
    touch,
  );
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
  view = await focusWorldTargets(page, [farmCellCenter(boxFarm, boxCell)], touch);
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
  view = await focusWorldTargets(page, [house, crate], touch, { unitPixels: 24 });
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
  view = await focusWorldTargets(page, [facility, secondHouse], touch, { unitPixels: 24 });
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
