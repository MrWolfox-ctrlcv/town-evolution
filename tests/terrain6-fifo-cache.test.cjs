const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.env.V6_FIFO_BUILD || path.join(__dirname, '..', '.domain-build');
const { V6FifoCache } = require(path.join(root, 'domain/v6-fifo-cache'));
const { V6BaseHydrology } = require(path.join(root, 'domain/v6-hydrology-base'));
const { V5BaseHydrology } = require(path.join(root, 'domain/v5-hydrology-base'));
const { V6Hydrology } = require(path.join(root, 'domain/v6-hydrology'));
const { naturalLayerQuanta } = require(path.join(root, 'domain/v6-material-volume'));

class OriginalFifo {
  values = new Map();
  constructor(capacity) {
    this.capacity = capacity;
  }
  set(key, value) {
    if (!this.values.has(key) && this.values.size >= this.capacity)
      this.values.delete(this.values.keys().next().value);
    this.values.set(key, value);
  }
}

test('v6 FIFO rejects invalid capacities and retains Map key semantics', () => {
  for (const capacity of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => new V6FifoCache(capacity));
  const fifo = new V6FifoCache(4);
  const object = {};
  fifo.set(NaN, 1);
  fifo.set(-0, 2);
  fifo.set(object, 3);
  fifo.set(undefined, 4);
  fifo.set(NaN, 5);
  assert.equal(fifo.size, 4, 'Updating the oldest key cannot evict another key');
  assert.equal(fifo.get(NaN), 5);
  assert.equal(fifo.get(0), 2);
  assert.equal(fifo.get(object), 3);
  assert.equal(fifo.get(undefined), 4);
  fifo.set('new', 6);
  assert.equal(fifo.get(NaN), undefined, 'Hits and replacements never promote the oldest key');
  assert.equal(fifo.get(0), 2);
});

for (const capacity of [1, 3, 512, 4096, 8192])
  test(`v6 FIFO matches the old eviction order through repeated Map growth, capacity ${capacity}`, () => {
    const fifo = new V6FifoCache(capacity);
    const old = new OriginalFifo(capacity);
    const compare = () => {
      assert.equal(fifo.size, old.values.size);
      assert.ok(fifo.size <= capacity);
      for (const [key, value] of old.values) assert.equal(fifo.get(key), value);
    };
    for (let i = 0; i < capacity * 5 + 100; i++) {
      if (i % 7 === 0 && old.values.size) {
        const first = old.values.keys().next().value;
        assert.equal(fifo.get(first), old.values.get(first));
        fifo.set(first, -i);
        old.set(first, -i);
      }
      const evicted = old.values.size === capacity ? old.values.keys().next().value : null;
      fifo.set(i, i);
      old.set(i, i);
      if (evicted !== null) assert.equal(fifo.get(evicted), undefined);
      if (i % 257 === 0) compare();
    }
    compare();
    // Reinsert an evicted key, then rotate again. The persistent cursor must never exhaust.
    for (let i = 0; i < capacity * 2; i++) {
      fifo.set(i, i + 1);
      old.set(i, i + 1);
    }
    compare();
  });

for (const seed of [1, 7, 42173])
  test(`v6 base hydrology preserves original sample/cell bytes and limits, seed ${seed}`, () => {
    const old = new V5BaseHydrology(seed);
    const next = new V6BaseHydrology(seed);
    for (let i = 0; i < 17000; i++) {
      const x = (i % 769) / 4;
      const z = Math.floor(i / 769) / 4;
      const before = old.sample(x, z);
      const after = next.sample(x, z);
      assert.deepEqual(after, before);
      assert.equal(JSON.stringify(after), JSON.stringify(before));
      assert.equal(next.sample(x, z), after, 'A cache hit preserves the original frozen object');
    }
    for (let i = 0; i < 9000; i++) {
      const x = i % 192;
      const z = Math.floor(i / 192);
      assert.equal(JSON.stringify(next.classifyCell(x, z)), JSON.stringify(old.classifyCell(x, z)));
    }
    assert.deepEqual(next.cacheSizes(), { samples: 8192, cells: 4096 });
    assert.deepEqual(next.cacheSizes(), old.cacheSizes());
    assert.deepEqual(next.sample(0, 0), old.sample(0, 0), 'Evicted samples reproduce exact values');
    assert.deepEqual(next.classifyCell(0, 0), old.classifyCell(0, 0));
    for (const [x, z] of [
      [NaN, 0],
      [Infinity, 0],
      [1000001, 0],
    ])
      assert.throws(() => next.sample(x, z));
    for (const [x, z] of [
      [0.5, 0],
      [NaN, 0],
      [1000001, 0],
    ])
      assert.throws(() => next.classifyCell(x, z));
  });

test('v6 hydrology cell cache remains FIFO with exactly 4096 entries', () => {
  let calls = 0;
  const coast = {
    classifyCell: (x, z) => {
      calls++;
      return { x, z, state: 'dryBuildable', certificate: {} };
    },
  };
  const hydro = new V6Hydrology(1, new V6BaseHydrology(1), coast);
  const first = hydro.classifyCell(0, 0);
  for (let i = 1; i < 4096; i++) hydro.classifyCell(i, 0);
  assert.equal(hydro.classifyCell(0, 0), first);
  assert.equal(calls, 4096);
  hydro.classifyCell(4096, 0);
  assert.deepEqual(hydro.cacheSizes(), { samples: 0, cells: 4096 });
  assert.notEqual(hydro.classifyCell(0, 0), first, 'A hit must not turn FIFO into LRU');
  assert.equal(calls, 4098);
  assert.deepEqual(hydro.classifyCell(0, 0), first, 'Recomputed cell data remains equal');
});

test('v6 material cache keeps 512 cell keys, distinct initial amounts and layer maps', () => {
  let vertices = 0;
  const world = {
    resourceAt: () => ({ amount: 2, kind: 'stone' }),
    occupiedLevels: () => [1, 2],
    vertex: () => {
      vertices++;
      return { ground: 0.015, soil: 0, stone: 1.75 };
    },
  };
  const cell = { x: 0, z: 0, initialResourceAmount: 2 };
  const first = naturalLayerQuanta(world, cell, 1);
  const secondLayer = naturalLayerQuanta(world, cell, 2);
  const partial = naturalLayerQuanta(world, { ...cell, initialResourceAmount: 1 }, 1);
  assert.notEqual(partial, first, 'The original resource amount stays part of the cache key');
  for (let x = 1; x < 511; x++) naturalLayerQuanta(world, { ...cell, x }, 1);
  const beforeHit = vertices;
  assert.equal(naturalLayerQuanta(world, cell, 1), first);
  assert.equal(naturalLayerQuanta(world, cell, 2), secondLayer);
  assert.equal(vertices, beforeHit);
  naturalLayerQuanta(world, { ...cell, x: 511 }, 1);
  const afterEviction = naturalLayerQuanta(world, cell, 1);
  assert.notEqual(afterEviction, first);
  assert.deepEqual(afterEviction, first);
  assert.ok(Object.isFrozen(afterEviction));
  const other = { ...world };
  assert.notEqual(naturalLayerQuanta(other, cell, 1), afterEviction, 'World caches stay isolated');
});
