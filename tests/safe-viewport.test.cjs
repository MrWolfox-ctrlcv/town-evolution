const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(
  path.join(__dirname, '../assets/scripts/presentation/SafeViewport.ts'),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
function eventTarget() {
  const handlers = new Map();
  return {
    handlers,
    addEventListener(event, listener, capture) {
      handlers.set(event, { listener, capture });
    },
    removeEventListener(event, listener, capture) {
      assert.deepEqual(handlers.get(event), { listener, capture });
      handlers.delete(event);
    },
    fire(event) {
      handlers.get(event)?.listener();
    },
  };
}
function fixture(options = {}) {
  const bounds = options.bounds ?? { left: 0, top: 0, width: 400, height: 800 };
  const canvas = { getBoundingClientRect: () => bounds };
  // Screen dimensions are engine pixels, independent of the CSS canvas bounds.
  const screen = {
    windowSize: options.windowSize ?? {
      width: options.rotated ? 1600 : 800,
      height: options.rotated ? 800 : 1600,
    },
  };
  const visual = options.visual ? Object.assign(eventTarget(), options.visual) : null;
  const win = Object.assign(eventTarget(), {
    visualViewport: visual,
    getComputedStyle() {
      if (options.cssThrows) throw new Error('unavailable');
      const [left, top, right, bottom] = options.edges ?? [0, 0, 0, 0];
      return {
        paddingLeft: `${left}px`,
        paddingTop: `${top}px`,
        paddingRight: `${right}px`,
        paddingBottom: `${bottom}px`,
      };
    },
  });
  let removed = 0;
  const document = {
    documentElement: {
      clientWidth: options.layoutWidth ?? 400,
      clientHeight: options.layoutHeight ?? 800,
      appendChild() {},
    },
    createElement: () => ({
      style: {},
      remove() {
        removed++;
      },
    }),
  };
  let observer;
  class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
      observer = this;
    }
    observe(target) {
      assert.equal(target, canvas);
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  const cc = {
    game: { canvas: options.noCanvas ? null : canvas },
    sys: {
      isBrowser: options.browser ?? true,
      getSafeAreaRect(symmetric) {
        assert.equal(symmetric, false);
        return options.native ?? { x: 0, y: 0, width: 400, height: 800 };
      },
    },
    view: {
      getViewportRect: () => options.viewport ?? { x: 0, y: 0, width: 800, height: 1600 },
      getScaleX: () => options.scaleX ?? 2,
      getScaleY: () => options.scaleY ?? 2,
      // Clearly labelled Cocos 3.8.8 fixture: cocos/ui/view.ts:568-589.
      // Public conversion owns the capped screenAdapter DPR and frame rotation.
      convertToLocationInView(tx, ty, relatedPos, out = {}) {
        const dpr = Math.min(options.dpr ?? 2, 2);
        const x = dpr * (tx - relatedPos.left);
        const y = dpr * (relatedPos.top + relatedPos.height - ty);
        if (options.rotated) {
          out.x = screen.windowSize.width - y;
          out.y = x;
        } else {
          out.x = x;
          out.y = y;
        }
        return out;
      },
    },
  };
  const exports = {};
  new Function('require', 'exports', 'window', 'document', 'ResizeObserver', compiled)(
    () => cc,
    exports,
    win,
    document,
    ResizeObserver,
  );
  return { ...exports, win, visual, observer: () => observer, removed: () => removed };
}

test('native asymmetric rect is already logical UI units, clipped without symmetric inset growth', () => {
  const f = fixture({ browser: false, native: { x: 11, y: 23, width: 380, height: 740 } });
  assert.deepEqual(f.safeViewport(400, 800), { x: 11, y: 23, width: 380, height: 740 });
  assert.equal(f.removed(), 0);
});
test('desktop default, embedded non-origin canvas, capped DPR and offset engine viewport', () => {
  assert.deepEqual(fixture().safeViewport(400, 800), { x: 0, y: 0, width: 400, height: 800 });
  const f = fixture({ bounds: { left: 50, top: 100, width: 300, height: 500 }, dpr: 3 });
  assert.deepEqual(f.safeViewport(300, 500), { x: 0, y: 0, width: 300, height: 500 });
  assert.deepEqual(
    fixture({ viewport: { x: 20, y: 40, width: 760, height: 1520 } }).safeViewport(380, 760),
    { x: 0, y: 0, width: 380, height: 760 },
  );
});
test('CSS env and visual viewport intersect before canvas coordinate conversion', () => {
  const f = fixture({
    edges: [10, 40, 20, 30],
    visual: { offsetLeft: 5, offsetTop: 100, width: 380, height: 500 },
  });
  assert.deepEqual(f.safeViewport(400, 800), { x: 10, y: 200, width: 370, height: 500 });
  assert.equal(f.removed(), 1);
});
test('forced frame rotation goes through official public conversion', () => {
  const f = fixture({ rotated: true, edges: [10, 40, 20, 30] });
  assert.deepEqual(f.safeViewport(800, 400), { x: 40, y: 10, width: 730, height: 370 });
});
test('invalid/hidden/unavailable measurements fall back, actual disjoint region stays empty', () => {
  for (const options of [
    { noCanvas: true },
    { cssThrows: true },
    { scaleX: NaN },
    { edges: [0, NaN, 0, 0] },
    { bounds: { left: 0, top: 0, width: 0, height: 800 } },
    { browser: false, native: { x: NaN, y: 0, width: 400, height: 800 } },
    { browser: false, native: { x: 0, y: 0, width: -1, height: 800 } },
  ])
    assert.deepEqual(fixture(options).safeViewport(400, 800), {
      x: 0,
      y: 0,
      width: 400,
      height: 800,
    });
  const f = fixture({ visual: { offsetLeft: 500, offsetTop: 0, width: 100, height: 800 } });
  assert.deepEqual(f.safeViewport(400, 800), { x: 400, y: 0, width: 0, height: 800 });
  assert.equal(fixture({ cssThrows: true }).removed(), 0);
  const throwing = fixture({ cssThrows: true });
  throwing.safeViewport(400, 800);
  assert.equal(throwing.removed(), 1);
});
test('browser changes notify and cleanup removes all listeners/observer; native registers none', () => {
  const f = fixture({ visual: { offsetLeft: 0, offsetTop: 0, width: 400, height: 800 } });
  let calls = 0;
  const release = f.bindSafeViewportChanges(() => calls++);
  for (const event of ['resize', 'scroll', 'orientationchange']) f.win.fire(event);
  for (const event of ['resize', 'scroll']) f.visual.fire(event);
  f.observer().callback();
  assert.equal(calls, 6);
  release();
  assert.equal(f.win.handlers.size, 0);
  assert.equal(f.visual.handlers.size, 0);
  assert.equal(f.observer().disconnected, true);
  f.observer().callback();
  assert.equal(calls, 6);
  const native = fixture({ browser: false });
  native.bindSafeViewportChanges(() => assert.fail('native callback'))();
  assert.equal(native.win.handlers.size, 0);
  assert.equal(native.observer(), undefined);
});

test('finite env insets consuming the viewport preserve an empty safe region', () => {
  const options = { layoutHeight: 50, bounds: { left: 0, top: 0, width: 400, height: 50 } };
  assert.deepEqual(fixture({ ...options, edges: [0, 40, 0, 30] }).safeViewport(400, 50), {
    x: 0,
    y: 10,
    width: 400,
    height: 0,
  });
  assert.deepEqual(fixture({ ...options, edges: [250, 0, 200, 0] }).safeViewport(400, 50), {
    x: 250,
    y: 0,
    width: 0,
    height: 50,
  });
  assert.deepEqual(fixture({ ...options, edges: [500, 60, 0, 0] }).safeViewport(400, 50), {
    x: 400,
    y: 0,
    width: 0,
    height: 0,
  });
});
test('rotated public API uses independent screen width, even with extra CSS canvas scaling', () => {
  const f = fixture({
    rotated: true,
    bounds: { left: 0, top: 0, width: 200, height: 400 },
    layoutWidth: 200,
    layoutHeight: 400,
    windowSize: { width: 1600, height: 800 },
    edges: [10, 40, 20, 30],
  });
  assert.deepEqual(f.safeViewport(800, 400), { x: 440, y: 10, width: 330, height: 170 });
});
