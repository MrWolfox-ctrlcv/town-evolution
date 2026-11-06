const test = require('node:test');
const assert = require('node:assert/strict');
const build = process.env.COMPOST_BUILD || '../.domain-build/domain';
const c = require(`${build}/compost`);
const { parseCompostState } = require(`${build}/compost-save`);
const { ITEM_KEYS, MAX_CROP_DURATION, MAX_CROP_YIELD } = require(`${build}/crops`);
const { MAX_TIME, MAX_VALUE } = require(`${build}/config`);
const clone = (value) => JSON.parse(JSON.stringify(value));
function parse(raw, now = 1000, version = 10) {
  return parseCompostState(
    raw,
    now,
    (id, prefix) => {
      assert.equal(prefix, 'j');
      return id;
    },
    version,
  );
}
function started(amount = 2, now = 1000) {
  return c.compostInputPlan(c.createCompostState(), 'rice', amount, now, 'j1');
}
function unchanged(state, action, pattern) {
  const before = JSON.stringify(state);
  assert.throws(action, pattern);
  assert.equal(JSON.stringify(state), before);
}
function frozen(value) {
  Object.freeze(value.stock);
  if (value.job) {
    value.job.inputs.forEach(Object.freeze);
    Object.freeze(value.job.inputs);
    Object.freeze(value.job);
  }
  return Object.freeze(value);
}

test('new barrel has complete independent inventory and snapshots bounded capacity', () => {
  const first = c.createCompostState(),
    second = c.createCompostState();
  assert.equal(first.capacity, 16);
  assert.deepEqual(Object.keys(first.stock), ITEM_KEYS);
  assert.equal(c.compostOccupied(first), 0);
  assert.equal(c.compostFreeSpace(first), 16);
  assert.equal(c.compostStage(first, 1000), 'idle');
  assert.notEqual(first.stock, second.stock);
  assert.equal(c.createCompostState(1).capacity, 1);
  assert.equal(c.createCompostState(c.MAX_COMPOST_CAPACITY).capacity, c.MAX_COMPOST_CAPACITY);
  for (const capacity of [0, -1, 1.5, NaN, Infinity, c.MAX_COMPOST_CAPACITY + 1, '16', null])
    assert.throws(() => c.createCompostState(capacity));
});

test('one input waits, then two different permitted inputs make one immutable timed promise', () => {
  const first = frozen(c.compostInputPlan(c.createCompostState(), 'treeSeed', 1, 1000));
  assert.equal(first.job, undefined);
  assert.equal(first.stock.treeSeed, 1);
  assert.deepEqual(parse(first), first);
  const second = c.compostInputPlan(first, 'lettuce', 1, 1100, 'j1');
  assert.deepEqual(second.job, {
    id: 'j1',
    startedAt: 1100,
    readyAt: 16100,
    durationMs: 15000,
    inputs: [
      { item: 'lettuce', amount: 1 },
      { item: 'treeSeed', amount: 1 },
    ],
    fertilizerYield: 1,
  });
  assert.equal(second.stock.treeSeed, 0);
  assert.equal(second.stock.lettuce, 0);
  assert.equal(c.compostOccupied(second), 2);
  assert.equal(c.compostStage(second, 16099), 'working');
  assert.equal(c.compostStage(second, 16100), 'ready');
  assert.deepEqual(parse(second, 1100), second);
  assert.deepEqual(parse(second, 50000), second);
});

test('all four crops and tree seeds mix without losing individual stock amounts', () => {
  let state = c.createCompostState();
  for (const item of c.COMPOST_ITEMS)
    state = c.compostInputPlan(frozen(state), item, 3, 1000, 'j1');
  assert.equal(c.compostOccupied(state), 15);
  assert.deepEqual(state.job.inputs, [{ item: 'vegetable', amount: 2 }]);
  assert.deepEqual(
    c.COMPOST_ITEMS.map((item) => state.stock[item]),
    [1, 3, 3, 3, 3],
  );
  const collected = c.compostCollectPlan(frozen(state), 'j1', 16000, 0, 'j2');
  assert.equal(collected.fertilizer, 1);
  assert.equal(c.compostOccupied(collected.compost), 13);
  assert.deepEqual(collected.compost.job.inputs, [
    { item: 'vegetable', amount: 1 },
    { item: 'wheat', amount: 1 },
  ]);
  assert.deepEqual(
    c.COMPOST_ITEMS.map((item) => collected.compost.stock[item]),
    [0, 2, 3, 3, 3],
  );
});

test('active and ready batches count toward capacity; adding fuel never restarts a job', () => {
  const initial = frozen(started());
  const full = frozen(c.compostInputPlan(initial, 'treeSeed', 14, 50000));
  assert.deepEqual(full.job, initial.job);
  assert.equal(c.compostFreeSpace(full), 0);
  unchanged(full, () => c.compostInputPlan(full, 'rice', 1, 50000, 'j2'), /空间不足/);
  assert.deepEqual(c.compostStartPlan(full, 50000, 'j2'), full);
});

test('source-independent deposit is all-or-nothing for invalid kind, amount, ID and time', () => {
  const state = frozen(c.createCompostState());
  for (const item of [
    ...ITEM_KEYS.filter((key) => !c.COMPOST_ITEMS.includes(key)),
    'compost',
    '__proto__',
    'constructor',
    '',
    null,
    undefined,
    0,
  ])
    unchanged(state, () => c.compostInputPlan(state, item, 1, 1000));
  for (const amount of [0, -1, 0.5, NaN, Infinity, MAX_VALUE + 1, '1', null, undefined])
    unchanged(state, () => c.compostInputPlan(state, 'rice', amount, 1000));
  for (const now of [-1, 0.5, NaN, Infinity, MAX_TIME + 1, '1000', undefined])
    unchanged(state, () => c.compostInputPlan(state, 'rice', 1, now));
  for (const id of [undefined, null, '', 'j0', 'b1', 'j1000000000', 'j1x'])
    unchanged(state, () => c.compostInputPlan(state, 'rice', 2, 1000, id));
  unchanged(state, () => c.compostInputPlan(state, 'rice', 2, MAX_TIME - 14999, 'j1'));
});

test('collection requires matching ready job and bounded fertilizer counter, retaining all assets', () => {
  const state = frozen(started());
  unchanged(state, () => c.compostCollectPlan(state, 'j1', 15999, 0));
  unchanged(state, () => c.compostCollectPlan(state, 'j2', 16000, 0));
  for (const fertilizer of [-1, 0.5, NaN, Infinity, MAX_VALUE, MAX_VALUE + 1, '1', undefined])
    unchanged(state, () => c.compostCollectPlan(state, 'j1', 16000, fertilizer));
  const result = c.compostCollectPlan(state, 'j1', 16000, MAX_VALUE - 1);
  assert.equal(result.fertilizer, MAX_VALUE);
  assert.equal(result.compost.job, undefined);
  assert.equal(c.compostOccupied(result.compost), 0);
  unchanged(result.compost, () => c.compostCollectPlan(result.compost, 'j1', 16000, 0));
});

test('one collection starts only one fresh batch at now, not a series of offline batches', () => {
  const state = frozen(started(8));
  const result = c.compostCollectPlan(state, 'j1', 1000000, 10, 'j2');
  assert.equal(result.fertilizer, 11);
  assert.equal(result.compost.stock.rice, 4);
  assert.equal(result.compost.job.startedAt, 1000000);
  assert.equal(result.compost.job.readyAt, 1015000);
  assert.equal(c.compostStage(result.compost, 1000000), 'working');
  unchanged(state, () => c.compostCollectPlan(state, 'j1', 1000000, 10));
  unchanged(state, () => c.compostCollectPlan(state, 'j1', 1000000, 10, 'j1'));
  const late = frozen(started(4, MAX_TIME - 15000));
  unchanged(late, () => c.compostCollectPlan(late, 'j1', MAX_TIME, 0, 'j2'), /时间/);
});

test('changed balance affects only future jobs and barrels, never an existing saved promise', () => {
  const original = { ...c.COMPOST_BALANCE },
    state = frozen(started(6));
  try {
    Object.assign(c.COMPOST_BALANCE, {
      capacity: 1,
      inputAmount: 3,
      durationMs: 250,
      fertilizerYield: 4,
    });
    assert.deepEqual(parse(state), state);
    assert.equal(c.createCompostState().capacity, 1);
    const result = c.compostCollectPlan(state, 'j1', 50000, 10, 'j2');
    assert.equal(result.fertilizer, 11);
    assert.equal(result.compost.capacity, 16);
    assert.equal(result.compost.stock.rice, 1);
    assert.deepEqual(result.compost.job.inputs, [{ item: 'rice', amount: 3 }]);
    assert.equal(result.compost.job.fertilizerYield, 4);
    assert.equal(result.compost.job.durationMs, 250);
    assert.equal(result.compost.job.readyAt, 50250);
    assert.deepEqual(parse(result.compost, 50000), result.compost);
  } finally {
    Object.assign(c.COMPOST_BALANCE, original);
  }
});

test('bad new-job balance fails before deposits change assets', () => {
  const original = { ...c.COMPOST_BALANCE },
    state = frozen(c.createCompostState());
  try {
    for (const [key, values] of [
      ['inputAmount', [0, -1, 1.5, Infinity, MAX_CROP_YIELD + 1]],
      ['durationMs', [0, -1, 1.5, Infinity, MAX_CROP_DURATION + 1]],
      ['fertilizerYield', [0, -1, 1.5, Infinity, MAX_CROP_YIELD + 1]],
    ])
      for (const value of values) {
        Object.assign(c.COMPOST_BALANCE, original, { [key]: value });
        unchanged(state, () => c.compostInputPlan(state, 'rice', 2, 1000, 'j1'));
      }
  } finally {
    Object.assign(c.COMPOST_BALANCE, original);
  }
});

test('parse deep-clones all assets and registers the job ID only after complete validation', () => {
  const state = frozen(started(5)),
    result = parse(state);
  assert.deepEqual(result, state);
  assert.notEqual(result.stock, state.stock);
  assert.notEqual(result.job, state.job);
  assert.notEqual(result.job.inputs, state.job.inputs);
  assert.notEqual(result.job.inputs[0], state.job.inputs[0]);
  result.job.inputs[0].amount = 1;
  result.stock.rice = 0;
  assert.equal(state.job.inputs[0].amount, 2);
  assert.equal(state.stock.rice, 3);
  let calls = 0;
  const invalid = clone(state);
  invalid.stock.rice = 16;
  assert.throws(() =>
    parseCompostState(invalid, 1000, () => {
      calls++;
      return 'j1';
    }),
  );
  assert.equal(calls, 0);
  assert.throws(
    () =>
      parseCompostState(state, 1000, () => {
        throw new Error('duplicate');
      }),
    /duplicate/,
  );
});

test('parser requires complete inventory and permits only compostable nonzero stock', () => {
  for (const raw of [undefined, null, [], 16, 'barrel', {}, { capacity: 16 }, { stock: {} }])
    assert.throws(() => parse(raw));
  for (const item of ITEM_KEYS) {
    const raw = c.createCompostState();
    delete raw.stock[item];
    for (const version of [8, 9, 10]) assert.throws(() => parse(raw, 1000, version));
  }
  for (const item of ITEM_KEYS.filter((key) => !c.COMPOST_ITEMS.includes(key))) {
    const raw = c.createCompostState();
    raw.stock[item] = 1;
    assert.throws(() => parse(raw));
  }
  for (const amount of [-1, 0.5, NaN, Infinity, MAX_VALUE + 1, '1', undefined, null]) {
    const raw = c.createCompostState();
    raw.stock.rice = amount;
    assert.throws(() => parse(raw));
  }
  for (const version of [0, 7, 11, '10', null])
    assert.throws(() => parse(c.createCompostState(), 1000, version));
});

test('parser rejects unknown fields, symbols, inheritance and accessors without executing getters', () => {
  for (const pick of [(s) => s, (s) => s.stock, (s) => s.job, (s) => s.job.inputs[0]]) {
    for (const key of ['extra', '__proto__', 'constructor', Symbol('extra')]) {
      const raw = started();
      Object.defineProperty(pick(raw), key, { value: 0 });
      assert.throws(() => parse(raw));
    }
    let getters = 0;
    const raw = started(),
      object = pick(raw),
      key = Object.keys(object)[0];
    Object.defineProperty(object, key, {
      get() {
        getters++;
        return 0;
      },
    });
    assert.throws(() => parse(raw));
    assert.equal(getters, 0);
  }
  const raw = started();
  raw.stock = Object.create(raw.stock);
  assert.throws(() => parse(raw));
  assert.throws(() => parse(Object.create(started())));
  const arrayExtra = started();
  arrayExtra.job.inputs.extra = 1;
  assert.throws(() => parse(arrayExtra));
  const sparse = started();
  sparse.job.inputs = new Array(1);
  assert.throws(() => parse(sparse));
  let getters = 0;
  const accessor = started();
  Object.defineProperty(accessor.job.inputs, '0', {
    get() {
      getters++;
      return { item: 'rice', amount: 2 };
    },
  });
  assert.throws(() => parse(accessor));
  assert.equal(getters, 0);
});

test('parser rejects malformed input records and total input or occupied capacity overflow', () => {
  for (const inputs of [
    undefined,
    null,
    [],
    {},
    [{ item: 'rice', amount: 0 }],
    [{ item: 'rice', amount: MAX_CROP_YIELD + 1 }],
    [{ item: 'rice', amount: 1.5 }],
    [{ item: 'wood', amount: 1 }],
    [
      { item: 'rice', amount: 1 },
      { item: 'rice', amount: 1 },
    ],
    [{ item: 'rice', amount: 2, unknown: true }],
    [{ item: 'rice' }],
  ]) {
    const raw = started();
    raw.job.inputs = inputs;
    assert.throws(() => parse(raw));
  }
  const capacity = started(16);
  capacity.stock.rice++;
  assert.throws(() => parse(capacity));
  const total = started();
  total.capacity = c.MAX_COMPOST_CAPACITY;
  total.job.inputs = [
    { item: 'rice', amount: MAX_CROP_YIELD },
    { item: 'wheat', amount: 1 },
  ];
  assert.throws(() => parse(total));
  const explicitUndefined = c.createCompostState();
  explicitUndefined.job = undefined;
  assert.throws(() => parse(explicitUndefined));
});

test('parser enforces exact timestamps, positive bounded promises, job IDs and saved time', () => {
  for (const [key, values] of [
    ['id', ['', 'j0', 'j01', 'b1', 'j1000000000', null]],
    ['startedAt', [-1, 1001, 0.5, MAX_TIME + 1, NaN]],
    ['readyAt', [-1, 16001, 0.5, MAX_TIME + 1, Infinity]],
    ['durationMs', [0, -1, 14999, 0.5, MAX_CROP_DURATION + 1]],
    ['fertilizerYield', [0, -1, 0.5, MAX_CROP_YIELD + 1, Infinity]],
  ])
    for (const value of values) {
      const raw = started();
      raw.job[key] = value;
      assert.throws(() => parse(raw), `${key}=${value}`);
    }
  for (const now of [-1, 0.5, Infinity, MAX_TIME + 1, '1000'])
    assert.throws(() => parse(started(), now));
  const max = started(2, MAX_TIME - 15000);
  assert.deepEqual(parse(max, MAX_TIME), max);
  const old = started();
  old.job.inputs[0].amount = 3;
  old.job.fertilizerYield = 2;
  assert.deepEqual(parse(old), old);
});

test('cloning explicit data fields preserves non-enumerable assets rather than silently dropping them', () => {
  const state = started(5),
    expected = clone(state);
  for (const object of [state, state.stock, state.job, state.job.inputs[0]])
    for (const key of Object.keys(object))
      Object.defineProperty(object, key, { enumerable: false });
  assert.deepEqual(parse(state), expected);
  assert.deepEqual(c.cloneCompostState(state), expected);
});

test('many interleaved deposits and collections conserve each material exactly', () => {
  let state = c.createCompostState(),
    now = 1000,
    nextId = 1,
    fertilizer = 0,
    batches = 0;
  const deposited = Object.fromEntries(c.COMPOST_ITEMS.map((item) => [item, 0]));
  const consumed = { ...deposited };
  function collect() {
    const oldJob = state.job;
    now = Math.max(now, oldJob.readyAt) + 100000;
    const result = c.compostCollectPlan(frozen(state), oldJob.id, now, fertilizer, `j${nextId++}`);
    oldJob.inputs.forEach(({ item, amount }) => (consumed[item] += amount));
    state = result.compost;
    fertilizer = result.fertilizer;
    batches++;
  }
  for (let i = 0; i < 150; i++) {
    const item = c.COMPOST_ITEMS[i % c.COMPOST_ITEMS.length],
      amount = (i % 5) + 1;
    while (c.compostFreeSpace(state) < amount) collect();
    state = c.compostInputPlan(frozen(state), item, amount, now, `j${nextId++}`);
    deposited[item] += amount;
    if (i % 3 === 0 && state.job) collect();
    for (const material of c.COMPOST_ITEMS)
      assert.equal(
        deposited[material],
        consumed[material] +
          state.stock[material] +
          (state.job?.inputs.find((entry) => entry.item === material)?.amount ?? 0),
      );
    assert.equal(fertilizer, batches);
    assert.deepEqual(parse(state, now), state);
  }
  while (state.job) collect();
  assert.equal(
    fertilizer * 2 + c.compostOccupied(state),
    Object.values(deposited).reduce((a, b) => a + b, 0),
  );
});
