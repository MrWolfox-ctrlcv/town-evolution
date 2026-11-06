const test = require('node:test'),
  assert = require('node:assert/strict');
const { createV5CoastSource } = require('../.domain-build/art/V5Coast');
const { V5CoastChunks } = require('../.domain-build/art/V5CoastChunks');
const { find } = require('./helpers/v5-coastal-dock.cjs');
function next(c) {
  for (let i = 0; i < 10000; i++) {
    const tx = c.advance(32, Infinity);
    if (tx) return tx;
  }
  throw Error('No coast transaction');
}
function settle(c) {
  for (let i = 0; i < 10000 && !c.isSettled(); i++) {
    const tx = c.advance(32, Infinity);
    if (tx) tx.commit();
  }
  assert.ok(c.isSettled());
}
test('coast first load publishes one chunk, marine edits retain an atomic local group', () => {
  const seed = 42173,
    plan = find(seed),
    base = createV5CoastSource(seed),
    filled = createV5CoastSource(seed, plan.fill),
    affected = new Set();
  for (const p of plan.fill)
    for (const [dx, dz] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      affected.add(`${Math.floor((p.x + dx) / 16)},${Math.floor((p.z + dz) / 16)}`);
  const untouched = affected.has('5,4') ? '0,0' : '5,4',
    keys = [...affected, untouched],
    c = new V5CoastChunks(base);
  c.request(keys);
  const first = next(c);
  assert.equal(first.chunks.length, 1);
  first.commit();
  assert.equal(c.resident().size, 1);
  assert.ok(!c.isSettled());
  settle(c);
  const old = new Map(c.resident());
  c.update(filled, plan.fill);
  const tx = next(c);
  assert.deepEqual(tx.chunks.map((x) => x.key).sort(), [...affected].sort());
  for (const key of keys) assert.strictEqual(c.resident().get(key), old.get(key));
  tx.commit();
  assert.strictEqual(c.resident().get(untouched), old.get(untouched));
  for (const key of affected) assert.deepEqual(c.resident().get(key), filled.build(key));
  c.update(base, plan.fill);
  const stale = next(c);
  c.update(filled, plan.fill);
  assert.throws(() => stale.commit(), /Stale/);
  next(c).commit();
  c.request([untouched]);
  settle(c);
  assert.equal(c.resident().size, 1);
  c.update(base, plan.fill);
  assert.ok(c.isSettled());
  c.request(keys);
  settle(c);
  for (const key of affected) assert.deepEqual(c.resident().get(key), base.build(key));
  c.dispose();
  assert.equal(c.resident().size, 0);
});
test('synthetic cross-corner edit prepares three chunks and never publishes a partial group', () => {
  const keys = ['5,4', '6,4', '5,5', '6,5'],
    mesh = (key, rev) => ({
      positions: [Number(key[0]), rev, 0],
      indices: [0, 0, 0],
      normals: [0, 1, 0],
      colors: [1, 1, 1, 1],
      min: [0, 0, 0],
      max: [1, 1, 1],
    }),
    source = (rev) => ({
      keys,
      water: mesh('0', rev),
      begin(key) {
        let steps = 0;
        return {
          advance() {
            return ++steps >= 3;
          },
          result() {
            assert.ok(steps >= 3);
            return mesh(key, rev);
          },
        };
      },
    });
  const c = new V5CoastChunks(source(0));
  c.request(keys);
  settle(c);
  const old = new Map(c.resident());
  c.update(source(1), [{ x: 95, z: 79 }]);
  assert.equal(c.advance(3, Infinity), null);
  for (const k of keys) assert.strictEqual(c.resident().get(k), old.get(k));
  const tx = next(c);
  assert.equal(tx.chunks.length, 3);
  tx.commit();
  assert.strictEqual(c.resident().get('6,5'), old.get('6,5'));
  for (const k of ['5,4', '6,4', '5,5']) assert.equal(c.resident().get(k).positions[1], 1);
  c.dispose();
});
