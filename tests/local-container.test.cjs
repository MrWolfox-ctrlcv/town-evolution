const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MAX_VALUE } = require('../.domain-build/domain/config.js');
const { ITEM_KEYS } = require('../.domain-build/domain/crops.js');
const {
  LOCAL_CONTAINER,
  createLocalContainer,
  cloneLocalContainer,
  localContainerTotal,
  localContainerFreeSpace,
  depositLocalContainer,
  withdrawLocalContainer,
} = require('../.domain-build/domain/local-container.js');
const { parseLocalContainer } = require('../.domain-build/domain/local-container-save.js');
const { createGame, getCapacity, getUsedStorage } = require('../.domain-build/domain/state.js');

function frozen(container) {
  Object.freeze(container.stock);
  return Object.freeze(container);
}

test('new local containers have complete isolated stock and bounded capacity', () => {
  const first = createLocalContainer();
  const second = createLocalContainer();
  assert.equal(first.capacity, 16);
  assert.deepEqual(Object.keys(first.stock), ITEM_KEYS);
  assert.equal(localContainerTotal(first), 0);
  assert.equal(localContainerFreeSpace(first), 16);
  assert.notEqual(first, second);
  assert.notEqual(first.stock, second.stock);
  first.stock.wood = 1;
  assert.equal(second.stock.wood, 0);
  assert.equal(createLocalContainer(1).capacity, 1);
  assert.equal(createLocalContainer(MAX_VALUE).capacity, MAX_VALUE);
  for (const capacity of [0, -1, 1.5, NaN, Infinity, MAX_VALUE + 1, '16', null])
    assert.throws(() => createLocalContainer(capacity));
});

test('deposit and withdrawal support every item and return independent snapshots', () => {
  let container = frozen(createLocalContainer(ITEM_KEYS.length));
  for (const item of ITEM_KEYS) {
    const before = container;
    container = depositLocalContainer(before, item, 1);
    assert.notEqual(container, before);
    assert.notEqual(container.stock, before.stock);
    assert.equal(before.stock[item], 0);
    assert.equal(container.stock[item], 1);
    frozen(container);
  }
  assert.equal(localContainerFreeSpace(container), 0);
  const full = container;
  for (const item of ITEM_KEYS) container = withdrawLocalContainer(frozen(container), item, 1);
  assert.equal(localContainerTotal(container), 0);
  assert.equal(localContainerTotal(full), ITEM_KEYS.length);
  assert.deepEqual(container, createLocalContainer(ITEM_KEYS.length));
});

test('over-capacity and over-withdrawal fail atomically without partial transfers', () => {
  const container = frozen(depositLocalContainer(createLocalContainer(4), 'rice', 3));
  const before = JSON.stringify(container);
  assert.throws(() => depositLocalContainer(container, 'wheat', 2), /空间不足/);
  assert.throws(() => withdrawLocalContainer(container, 'rice', 4), /产品不足/);
  assert.throws(() => withdrawLocalContainer(container, 'wheat', 1), /产品不足/);
  assert.equal(JSON.stringify(container), before);
  const full = frozen(depositLocalContainer(container, 'wheat', 1));
  assert.equal(localContainerFreeSpace(full), 0);
  assert.throws(() => depositLocalContainer(full, 'rice', 1), /空间不足/);
  assert.equal(localContainerTotal(full), 4);
});

test('transfers reject invalid amounts and unknown item keys before any input changes', () => {
  const container = frozen(depositLocalContainer(createLocalContainer(), 'rice', 3));
  const before = JSON.stringify(container);
  for (const transfer of [depositLocalContainer, withdrawLocalContainer]) {
    for (const amount of [0, -1, 0.5, NaN, Infinity, MAX_VALUE + 1, '1', undefined])
      assert.throws(() => transfer(container, 'rice', amount));
    for (const item of ['unknown', '__proto__', 'constructor', '', null, undefined, 0])
      assert.throws(() => transfer(container, item, 1));
  }
  assert.equal(JSON.stringify(container), before);
});

test('clone and parser deep-clone complete stock without changing input', () => {
  const container = frozen(depositLocalContainer(createLocalContainer(), 'rice', 3));
  for (const clone of [cloneLocalContainer, parseLocalContainer]) {
    const copied = clone(container);
    assert.deepEqual(copied, container);
    assert.notEqual(copied, container);
    assert.notEqual(copied.stock, container.stock);
    copied.stock.rice = 0;
    assert.equal(container.stock.rice, 3);
  }
  assert.deepEqual(parseLocalContainer(JSON.parse(JSON.stringify(container))), container);
});

test('parser requires complete containers and stock, including every zero item', () => {
  for (const raw of [undefined, null, [], 16, 'box', {}, { capacity: 16 }, { stock: {} }])
    assert.throws(() => parseLocalContainer(raw));
  for (const item of ITEM_KEYS) {
    const container = createLocalContainer();
    delete container.stock[item];
    assert.throws(() => parseLocalContainer(container), item);
  }
  for (const stock of [null, undefined, [], 0, 'stock'])
    assert.throws(() => parseLocalContainer({ capacity: 16, stock }));
});

test('parser rejects unknown, inherited, symbol and accessor fields', () => {
  for (const key of ['extra', 'farmCapacity', '__proto__', 'constructor', 'prototype']) {
    const container = createLocalContainer();
    Object.defineProperty(container, key, { value: 1, enumerable: true });
    assert.throws(() => parseLocalContainer(container));
    const stockContainer = createLocalContainer();
    Object.defineProperty(stockContainer.stock, key, { value: 0, enumerable: true });
    assert.throws(() => parseLocalContainer(stockContainer));
  }
  const symbolField = createLocalContainer();
  symbolField.stock[Symbol('extra')] = 0;
  assert.throws(() => parseLocalContainer(symbolField));
  assert.throws(() => parseLocalContainer(Object.create(createLocalContainer())));
  const inheritedStock = createLocalContainer();
  inheritedStock.stock = Object.create(inheritedStock.stock);
  assert.throws(() => parseLocalContainer(inheritedStock));
  let getterCalls = 0;
  const accessor = createLocalContainer();
  Object.defineProperty(accessor.stock, 'rice', {
    get() {
      getterCalls++;
      return 0;
    },
  });
  assert.throws(() => parseLocalContainer(accessor));
  assert.equal(getterCalls, 0);
  const capacityAccessor = createLocalContainer();
  Object.defineProperty(capacityAccessor, 'capacity', {
    get() {
      getterCalls++;
      return 16;
    },
  });
  assert.throws(() => localContainerFreeSpace(capacityAccessor));
  assert.equal(getterCalls, 0);
});

test('parser rejects invalid numeric snapshots and stock totals larger than capacity', () => {
  for (const capacity of [0, -1, 1.5, NaN, Infinity, MAX_VALUE + 1, '16', null])
    assert.throws(() => parseLocalContainer({ ...createLocalContainer(), capacity }));
  for (const item of ITEM_KEYS)
    for (const amount of [-1, 0.5, NaN, Infinity, MAX_VALUE + 1, '1', undefined, null]) {
      const container = createLocalContainer();
      container.stock[item] = amount;
      assert.throws(() => parseLocalContainer(container));
    }
  const overflow = createLocalContainer();
  overflow.stock.rice = 8;
  overflow.stock.wheat = 9;
  assert.throws(() => parseLocalContainer(overflow), /超出容量/);
  const bound = createLocalContainer(MAX_VALUE);
  bound.stock.wood = MAX_VALUE;
  assert.deepEqual(parseLocalContainer(bound), bound);
  bound.stock.stone = 1;
  assert.throws(() => parseLocalContainer(bound), /超出容量/);
});

test('exact upper-bound transfers preserve a safe capacity total', () => {
  const empty = frozen(createLocalContainer(MAX_VALUE));
  const full = frozen(depositLocalContainer(empty, 'wood', MAX_VALUE));
  assert.equal(localContainerTotal(full), MAX_VALUE);
  assert.equal(localContainerFreeSpace(full), 0);
  assert.throws(() => depositLocalContainer(full, 'stone', 1), /空间不足/);
  assert.deepEqual(withdrawLocalContainer(full, 'wood', MAX_VALUE), empty);
  assert.equal(full.stock.wood, MAX_VALUE);
});

test('transfer and query helpers validate the whole existing container, not only the target item', () => {
  for (const mutate of [
    (c) => (c.stock.stone = NaN),
    (c) => (c.stock.stone = -1),
    (c) => delete c.stock.stone,
    (c) => (c.stock.unknown = 0),
    (c) => (c.stock.stone = c.capacity + 1),
    (c) => (c.capacity = 0),
    (c) => (c.extra = true),
  ]) {
    const container = depositLocalContainer(createLocalContainer(), 'rice', 1);
    mutate(container);
    const before = structuredClone(container);
    for (const read of [cloneLocalContainer, localContainerTotal, localContainerFreeSpace])
      assert.throws(() => read(container));
    for (const transfer of [depositLocalContainer, withdrawLocalContainer])
      assert.throws(() => transfer(container, 'rice', 1));
    assert.deepEqual(container, before);
  }
});

test('saved capacity survives later tuning and only newly created containers use the new value', () => {
  const originalCapacity = LOCAL_CONTAINER.farmCapacity;
  const saved = JSON.stringify(depositLocalContainer(createLocalContainer(), 'rice', 12));
  try {
    LOCAL_CONTAINER.farmCapacity = 4;
    const restored = parseLocalContainer(JSON.parse(saved));
    assert.equal(restored.capacity, originalCapacity);
    assert.equal(restored.stock.rice, 12);
    assert.equal(localContainerFreeSpace(restored), originalCapacity - 12);
    assert.equal(createLocalContainer().capacity, 4);
    assert.equal(depositLocalContainer(restored, 'rice', 4).stock.rice, originalCapacity);
  } finally {
    LOCAL_CONTAINER.farmCapacity = originalCapacity;
  }
});

test('standalone local stock leaves town inventory and warehouse capacity unchanged', () => {
  const state = createGame(0);
  const capacity = getCapacity(state);
  state.inventory.rice = capacity - getUsedStorage(state);
  const before = JSON.stringify(state);
  const full = depositLocalContainer(createLocalContainer(), 'wood', 16);
  assert.equal(localContainerTotal(full), 16);
  assert.equal(getCapacity(state), capacity);
  assert.equal(getUsedStorage(state), capacity);
  assert.equal(JSON.stringify(state), before);
  const noWarehouse = { ...state, buildings: state.buildings.filter((b) => b.kind === 'farm') };
  assert.equal(getCapacity(noWarehouse), 0);
  assert.equal(localContainerTotal(full), 16);
});
