const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NaturalPicking } = require('../.domain-build/application/NaturalPicking');
function mesh() {
  return {
    positions: [
      0, 8, 0, 1, 8, 0, 0, 8, 1, 0, 0.4, 0, 1, 0.4, 0, 0, 0.4, 1, 0, 9, 0, 1, 9, 0, 0, 9, 1,
    ],
    resources: [
      { id: 'high', indices: [0, 2, 1], min: [0, 8, 0], max: [1, 8, 1], center: [0.25, 8, 0.25] },
      {
        id: 'low',
        indices: [3, 5, 4],
        min: [0, 0.4, 0],
        max: [1, 0.4, 1],
        center: [0.25, 0.4, 0.25],
      },
    ],
  };
}
const ray = { o: { x: 0.2, y: 10, z: 0.2 }, d: { x: 0, y: -1, z: 0 } };
test('actual high and low triangles override amount bounds; unowned coast/base/water triangles are ignored', () => {
  const picker = new NaturalPicking();
  const geometry = mesh();
  picker.sync(geometry, [
    { id: 'high', amount: 1 },
    { id: 'low', amount: 9 },
  ]);
  assert.deepEqual(picker.pick(ray), { id: 'high', distance: 2, point: { x: 0.2, y: 8, z: 0.2 } });
  picker.sync(geometry, [{ id: 'low', amount: 9 }]);
  assert.equal(picker.pick(ray).id, 'low');
  assert.equal(picker.pick(ray).distance, 9.6);
  picker.sync(geometry, [{ id: 'low', amount: 0 }]);
  assert.equal(picker.pick(ray), null);
});
test('broadphase hit without an actual triangle is a miss and cannot choose wrong neighboring column', () => {
  const picker = new NaturalPicking();
  picker.sync(mesh(), [
    { id: 'high', amount: 1 },
    { id: 'low', amount: 9 },
  ]);
  assert.equal(picker.pick({ o: { x: 0.9, y: 10, z: 0.9 }, d: ray.d }), null);
  assert.equal(picker.pick({ o: { x: 0.2, y: 10, z: 0.2 }, d: { x: 1, y: 0, z: 0 } }), null);
  assert.equal(picker.pick({ o: { x: 0.2, y: 1, z: 0.2 }, d: ray.d }).id, 'low');
});
test('backfaces below the terrain cannot select an invisible natural resource', () => {
  const picker = new NaturalPicking();
  picker.sync(mesh(), [{ id: 'high', amount: 1 }]);
  assert.equal(picker.pick({ o: { x: 0.2, y: 1, z: 0.2 }, d: { x: 0, y: 1, z: 0 } }), null);
});
