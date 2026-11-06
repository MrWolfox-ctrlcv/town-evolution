/** Input ownership through actual Cocos source/dispatch bodies, not fabricated simulate flags. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const routeFixture = require('./helpers/cocos-input-route.cjs');
const E = {
  TOUCH_START: 'touch-start',
  TOUCH_MOVE: 'touch-move',
  TOUCH_END: 'touch-end',
  TOUCH_CANCEL: 'touch-cancel',
};
const p = { x: -10, y: 20 };
function fixture(options) {
  const module = { exports: {} };
  const source = fs.readFileSync(
    path.join(__dirname, '../assets/scripts/presentation/InputProvenance.ts'),
    'utf8',
  );
  new Function(
    'exports',
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText,
  )(module.exports);
  const provenance = module.exports;
  const route = routeFixture({ emit() {} }, E, provenance, options);
  return { ...route, provenance };
}

test('nested actual web/native and mouse emissions restore scoped owners and leave no event tagged', () => {
  const f = fixture();
  const seen = [];
  let depth = 0;
  const events = [];
  f.input._emitEvent = (event) => {
    events.push(event);
    const owner = f.provenance.inputOwner(event);
    seen.push(owner);
    if (depth === 0) {
      depth++;
      f.send('mouse', E.TOUCH_START, p, 0, 2);
      assert.equal(f.provenance.inputOwner(event), owner);
      depth--;
    } else if (depth === 1) {
      depth++;
      f.send('native', E.TOUCH_START, p, 7);
      assert.equal(f.provenance.inputOwner(event), owner);
      depth--;
    }
  };
  try {
    f.send('web', E.TOUCH_START, p, 0);
    assert.deepEqual(seen, ['touch', 'mouse:2', 'touch']);
    for (const event of events) {
      assert.equal(f.provenance.inputOwner(event), 'unknown');
      assert.equal(f.provenance.isTouchEvent(event), false);
    }
  } finally {
    f.release();
  }
});

for (const route of ['mouse', 'web', 'native'])
  test(`a throwing ${route} consumer cannot leak source ownership`, () => {
    const f = fixture();
    let captured;
    f.input._emitEvent = (event) => {
      captured = event;
      assert.equal(f.provenance.inputOwner(event), route === 'mouse' ? 'mouse:2' : 'touch');
      throw new Error('consumer failed');
    };
    try {
      assert.throws(() => f.send(route, E.TOUCH_START, p, 0, 2), /consumer failed/);
      assert.equal(f.provenance.inputOwner(captured), 'unknown');
      assert.equal(f.provenance.isTouchEvent(captured), false);
      f.input._emitEvent = (event) => assert.equal(f.provenance.inputOwner(event), 'mouse:0');
      f.send('mouse', E.TOUCH_END, p);
    } finally {
      f.release();
    }
  });

test('binding is shared, reference-counted, idempotently disposed and can be reinstalled', () => {
  const f = fixture();
  const touchWrapped = f.touchTarget.emit,
    mouseWrapped = f.mouseTarget.emit;
  const secondRelease = f.provenance.bindInputProvenance(f.input);
  assert.equal(f.touchTarget.emit, touchWrapped);
  assert.equal(f.mouseTarget.emit, mouseWrapped);
  f.release();
  f.release();
  assert.equal(f.touchTarget.emit, touchWrapped);
  f.input._emitEvent = (event) => assert.equal(f.provenance.inputOwner(event), 'touch');
  f.send('web', E.TOUCH_START, p);
  secondRelease();
  secondRelease();
  assert.equal(f.touchTarget.emit, f.originalTouchEmit);
  assert.equal(f.mouseTarget.emit, f.originalMouseEmit);
  f.input._emitEvent = (event) => assert.equal(f.provenance.inputOwner(event), 'unknown');
  f.send('native', E.TOUCH_END, p);
  const lastRelease = f.provenance.bindInputProvenance(f.input);
  try {
    f.input._emitEvent = (event) => assert.equal(f.provenance.inputOwner(event), 'mouse:2');
    f.send('mouse', E.TOUCH_START, p, 0, 2);
  } finally {
    lastRelease();
  }
  assert.equal(f.touchTarget.emit, f.originalTouchEmit);
  assert.equal(f.mouseTarget.emit, f.originalMouseEmit);
});

for (const adapter of ['absent', 'unknown', 'frozen'])
  test(`${adapter} adapters keep actual source events unknown and exact`, () => {
    const f = fixture({ adapter });
    let count = 0;
    f.input._emitEvent = (event) => {
      count++;
      assert.equal(f.provenance.inputOwner(event), 'unknown');
      assert.equal(f.provenance.isTouchEvent(event), false);
      assert.equal(event.simulate, false);
    };
    try {
      for (const route of ['mouse', 'web', 'native']) {
        f.send(route, E.TOUCH_START, p);
        f.send(route, E.TOUCH_END, p);
      }
      assert.equal(count, 6);
    } finally {
      f.release();
    }
    assert.equal(f.touchTarget.emit, f.originalTouchEmit);
    assert.equal(f.mouseTarget.emit, f.originalMouseEmit);
  });

test('real button and finger source counts detect same-ID mixed contacts and clear on release', () => {
  const f = fixture();
  const samples = [];
  f.input._emitEvent = (event) =>
    samples.push({
      owner: f.provenance.inputOwner(event),
      multiple: f.provenance.hasMultipleContacts(event, f.input),
      conflict: f.provenance.hasInputConflict(f.input),
    });
  try {
    f.send('mouse', E.TOUCH_START, p, 0, 0);
    f.send('mouse', E.TOUCH_START, p, 0, 2);
    assert.deepEqual(samples.at(-1), { owner: 'mouse:2', multiple: true, conflict: true });
    f.send('mouse', E.TOUCH_END, p, 0, 2);
    assert.deepEqual(samples.at(-1), { owner: 'mouse:2', multiple: false, conflict: false });
    f.send('web', E.TOUCH_START, p, 0);
    assert.deepEqual(samples.at(-1), { owner: 'touch', multiple: true, conflict: true });
    f.send('mouse', E.TOUCH_END, p);
    f.send('web', E.TOUCH_END, p);
    assert.equal(f.provenance.hasInputConflict(f.input), false);
    f.send('native', E.TOUCH_START, p, 0);
    assert.deepEqual(samples.at(-1), { owner: 'touch', multiple: false, conflict: false });
  } finally {
    f.release();
  }
});
