const test = require('node:test');
const assert = require('node:assert/strict');
const { attachmentSlot, woodChipPose } = require('../.domain-build/art/FeedbackMath');
test('five mounted tokens fit a one-cell footprint without extending pickup bounds', () => {
  for (let i = 0; i < 5; i++) {
    const slot = attachmentSlot(i);
    // Ground pile base is 0.86 wide, rendered at 0.42 scale.
    assert.ok(Math.abs(slot.x) + (0.86 * 0.42) / 2 < 0.5);
    assert.ok(Math.abs(slot.z) + (0.86 * 0.42) / 2 < 0.5);
  }
});
test('six debris paths stay finite, land above terrain and spread around the cut', () => {
  for (let i = 0; i < 6; i++) {
    for (let t = 0; t <= 1.01; t += 0.01) {
      const pose = woodChipPose(i, t);
      assert.ok(Object.values(pose).every(Number.isFinite));
      assert.ok(pose.y >= 0.079 && pose.y < 0.64);
      assert.ok(Math.hypot(pose.x, pose.z) <= 0.801);
    }
    assert.ok(Math.abs(woodChipPose(i, 1).y - 0.08) < 1e-8);
  }
});
const { attachmentHeight } = require('../.domain-build/art/FeedbackMath');
const { ASSETS } = require('../.domain-build/art/AssetCatalog');
const { compileAsset } = require('../.domain-build/art/MeshCompiler');
test('material tray and tokens clear actual building mesh bounds for every building kind', () => {
  const models = {
    warehouse: 'warehouse-base',
    expandedWarehouse: 'warehouse-expanded',
    coldWarehouse: 'warehouse-cold',
    cooler: 'cooler',
    shop: 'shop',
    orderBoard: 'order-board',
    dock: 'dock',
    farm: 'farm-cell-bed',
  };
  for (const [kind, asset] of Object.entries(models)) {
    const roof = compileAsset(ASSETS[asset]).max[1];
    assert.ok(
      attachmentHeight(kind) - 0.035 > roof,
      `${kind} tray bottom clears all roof vertices`,
    );
    for (let i = 0; i < 5; i++) assert.ok(attachmentHeight(kind) + attachmentSlot(i).y > roof);
  }
  for (const crop of ['vegetable', 'wheat', 'lettuce']) {
    const grown = compileAsset(ASSETS[`crop-cell-${crop}-ready`]).max[1] * 1.2;
    assert.ok(
      attachmentHeight('farm') - 0.035 > grown,
      'farm tray clears mature crop animation envelope',
    );
  }
});
