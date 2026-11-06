const test = require('node:test');
const assert = require('node:assert/strict');
const { assertV5Reference } = require('./helpers/assert-v5-reference.cjs');
const original = {
  cells: [{ x: 1, z: 2, biome: 'mountain', elevation: 3, surfaceHeight: 2 }],
  trees: [{ x: 4, z: 5 }],
  resources: [{ id: 'n1_2', x: 1, z: 2, amount: 3 }],
};
function change(mutate) {
  const copy = structuredClone(original);
  mutate(copy);
  return copy;
}
test('v5 reference permits only measured height ULP drift', () => {
  assertV5Reference(structuredClone(original), original);
  assertV5Reference(
    change((p) => (p.cells[0].surfaceHeight += 3 * 2 ** -51)),
    original,
  );
  assert.throws(() =>
    assertV5Reference(
      change((p) => (p.cells[0].surfaceHeight += 4 * 2 ** -51)),
      original,
    ),
  );
  const large = change((p) => (p.cells[0].surfaceHeight = 64));
  const exceedsAbsoluteCap = change((p) => (p.cells[0].surfaceHeight = 64 + 2 * 2 ** -46));
  assert.throws(() => assertV5Reference(exceedsAbsoluteCap, large));
  for (const height of [NaN, Infinity, -Infinity, -2, 0, 2.000000001]) {
    assert.throws(() =>
      assertV5Reference(
        change((p) => (p.cells[0].surfaceHeight = height)),
        original,
      ),
    );
  }
  const zero = change((p) => (p.cells[0].surfaceHeight = 0));
  for (const height of [-0, Number.MIN_VALUE]) {
    assert.throws(() =>
      assertV5Reference(
        change((p) => (p.cells[0].surfaceHeight = height)),
        zero,
      ),
    );
  }
});
test('v5 reference rejects all discrete changes and structural drift', () => {
  const mutations = [
    (p) => (p.cells[0].x += Number.EPSILON),
    (p) => p.cells[0].z++,
    (p) => (p.cells[0].biome = 'plain'),
    (p) => p.cells[0].elevation++,
    (p) => (p.cells[0] = null),
    (p) => p.cells.push(null),
    (p) => delete p.cells[0].surfaceHeight,
    (p) => (p.cells[0].extra = true),
    (p) => p.trees[0].x++,
    (p) => p.trees[0].z++,
    (p) => p.trees.push({ x: 6, z: 7 }),
    (p) => (p.resources[0].id = 'n1_3'),
    (p) => p.resources[0].x++,
    (p) => p.resources[0].z++,
    (p) => (p.resources[0].amount += 2 ** -51),
    (p) => p.resources.reverse().push({ id: 'other' }),
    (p) => delete p.resources,
  ];
  for (const mutate of mutations) assert.throws(() => assertV5Reference(change(mutate), original));
  const ordered = { cells: [], trees: [{ x: 1 }, { x: 2 }], resources: [] };
  assert.throws(() =>
    assertV5Reference({ ...ordered, trees: [...ordered.trees].reverse() }, ordered),
  );
});
