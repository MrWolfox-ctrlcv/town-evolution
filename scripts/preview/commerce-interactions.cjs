/** Shop, inventory chips and dock transactions through visible UI; no command injection. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { inspect, until, ready, driver } = require('./ui-driver.cjs');
const { select, build, quantity, item, crop } = require('./commerce-driver.cjs');
const stockDrop = require('./stock-input.cjs');
module.exports = async function commerce(page, evidence, name, touch) {
  const { button, townActions } = driver(page, touch);
  await townActions();
  await button('重新开始');
  await button('确认重置进度');
  const initial = await until(page, (state) => state.save?.coins === 120, 'fresh commerce town');
  const farm = initial.save.buildings.find((building) => building.kind === 'farm');
  const shop = await build(page, 'shop', '商店', 1, 7, touch);
  const dock = await build(page, 'dock', '船坞', 9, 8, touch);
  assert.equal((await inspect(page)).save.coins, 40);
  await crop(page, farm.id, touch);
  await crop(page, farm.id, touch);
  const stocked = (await inspect(page)).save;
  assert.equal(stocked.inventory.vegetable, 8);
  await stockDrop(page, 'VegetableStock', shop.id, touch, 'cancel');
  if (touch) await stockDrop(page, 'VegetableStock', shop.id, touch, 'second-finger');
  const invalid = await stockDrop(page, 'VegetableStock', farm.id, touch);
  assert.deepEqual(invalid.save, stocked, 'Dropping stock on a field cancels');
  const soldOne = await stockDrop(page, 'VegetableStock', shop.id, touch);
  assert.equal(soldOne.save.coins, 45);
  assert.equal(
    soldOne.save.inventory.vegetable,
    7,
    'Normal outside-chip release sells exactly one',
  );
  const stagedOne = await stockDrop(page, 'VegetableStock', dock.id, touch);
  assert.equal(stagedOne.save.coins, 45, 'Dock staging is not a sale');
  assert.equal(stagedOne.save.inventory.vegetable, 6);
  assert.equal(stagedOne.save.commerce.dockCargo[dock.id].vegetable, 1);
  await select(page, dock.id, touch);
  await item(page, false, touch);
  await quantity(page, 1, touch);
  await button('取回 1');
  assert.equal((await inspect(page)).save.inventory.vegetable, 7);
  await quantity(page, 4, touch);
  await button('装货 4');
  assert.equal((await inspect(page)).save.commerce.dockCargo[dock.id].vegetable, 4);
  assert.equal((await inspect(page)).save.inventory.vegetable, 3);
  await button('取回 4');
  assert.equal((await inspect(page)).save.inventory.vegetable, 7);
  assert.equal((await inspect(page)).save.commerce.dockCargo[dock.id].vegetable, 0);
  await stockDrop(page, 'VegetableStock', dock.id, touch);
  await select(page, dock.id, touch);
  await button('发船');
  const shipped = await until(
    page,
    (state) => state.save.commerce.shipments[dock.id],
    'actual shipment started',
  );
  assert.equal(shipped.save.coins, 45, 'Dispatch is not immediate payment');
  assert.equal(shipped.save.commerce.dockCargo[dock.id].vegetable, 0);
  assert.equal(shipped.save.commerce.shipments[dock.id].reward, 6);
  await button('领取 6币');
  assert.deepEqual((await inspect(page)).save, shipped.save, 'Early claim cannot pay');
  await page.reload();
  await ready(page);
  await select(page, dock.id, touch);
  await until(
    page,
    (state) => state.now >= state.save.commerce.shipments[dock.id].completeAt + 600,
    'real thirty-second shipping timer survives reload',
    40000,
  );
  await button('领取 6币');
  await until(page, (state) => state.save.coins === 51, 'one-time shipping payment');
  await button('领取 0币');
  assert.equal((await inspect(page)).save.coins, 51);
  assert.ok(!(await inspect(page)).save.commerce.shipments[dock.id]);
  await page.screenshot({ path: path.join(evidence, `${name}-dock-returned.png`) });

  await select(page, shop.id, touch);
  await item(page, false, touch);
  await quantity(page, 4, touch);
  await button('买4');
  let state = (await inspect(page)).save;
  assert.equal(state.coins, 19);
  assert.equal(state.inventory.vegetable, 10);
  assert.equal(state.commerce.shopStock[shop.id].vegetable, 4);
  await button('卖4');
  state = (await inspect(page)).save;
  assert.equal(state.coins, 39);
  assert.equal(state.inventory.vegetable, 6);
  await quantity(page, 'all', touch);
  await button('买4');
  assert.equal((await inspect(page)).save.coins, 7);
  assert.equal((await inspect(page)).save.inventory.vegetable, 10);
  await button('卖10');
  state = (await inspect(page)).save;
  assert.equal(state.coins, 57);
  assert.equal(state.inventory.vegetable, 0);
  assert.equal(state.commerce.shopStock[shop.id].vegetable, 0);
  assert.deepEqual(
    (await stockDrop(page, 'VegetableStock', shop.id, touch)).save,
    state,
    'Zero-quantity chip cannot transfer',
  );

  await select(page, shop.id, touch);
  await item(page, true, touch);
  await quantity(page, 1, touch);
  await button('买1');
  assert.equal((await inspect(page)).save.coins, 41);
  assert.equal((await inspect(page)).save.inventory.chilledVegetable, 1);
  await stockDrop(page, 'ChilledStock', dock.id, touch);
  assert.equal((await inspect(page)).save.coins, 41);
  assert.equal((await inspect(page)).save.commerce.dockCargo[dock.id].chilledVegetable, 1);
  await select(page, dock.id, touch);
  await item(page, true, touch);
  await quantity(page, 1, touch);
  await button('取回 1');
  await stockDrop(page, 'ChilledStock', shop.id, touch);
  const final = (await inspect(page)).save;
  assert.equal(final.coins, 51);
  assert.deepEqual(final.inventory, { vegetable: 0, chilledVegetable: 0 });
  assert.deepEqual(final.commerce.dockCargo[dock.id], { vegetable: 0, chilledVegetable: 0 });
  await page.reload();
  await ready(page);
  assert.equal((await inspect(page)).save.coins, 51);
  await select(page, shop.id, touch);
  await page.screenshot({ path: path.join(evidence, `${name}-shop-completed.png`) });
  fs.writeFileSync(
    path.join(evidence, `${name}-commerce.json`),
    JSON.stringify(
      {
        passed: true,
        input: touch ? 'touch' : 'mouse',
        checks: [
          'shop and dock physically built',
          'hover never transfers',
          'cancel and invalid drop unchanged',
          ...(touch
            ? ['true OS cancel', 'HUD second finger cancels']
            : ['duplicate mouse release ignored']),
          'normal outside chip release sells one',
          'dock drop stages one without payment',
          'stage and return four without loss',
          'real shipping timer and reload',
          'claim once',
          'shop quantity four and all',
          'zero stock refuses transfer',
          'cold stock chip stage return sale',
          'reload persistence',
        ],
        state: final,
      },
      null,
      2,
    ),
  );
};
