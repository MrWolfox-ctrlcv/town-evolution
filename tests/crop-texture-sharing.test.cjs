const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
// Exercise the real presentation classes with instrumented resource APIs, not WebGL.
function harness(bundle = false) {
  const requests = [],
    textures = [],
    frames = [],
    modules = new Map();
  class ImageAsset {
    refs = 0;
    addRef() {
      this.refs++;
    }
    decRef() {
      this.refs--;
    }
  }
  class Texture2D {
    destroyed = 0;
    constructor() {
      textures.push(this);
    }
    destroy() {
      this.destroyed++;
    }
  }
  class SpriteFrame {
    destroyed = 0;
    rect = { width: 256, height: 256 };
    constructor() {
      frames.push(this);
    }
    destroy() {
      this.destroyed++;
    }
  }
  class Rect {
    constructor(x, y, width, height) {
      Object.assign(this, { x, y, width, height });
    }
  }
  const cc = {
    ImageAsset,
    Texture2D,
    SpriteFrame,
    Rect,
    assetManager: {
      getBundle: () =>
        bundle ? { load: (url, type, done) => requests.push({ url, done }) } : null,
      loadRemote: (url, options, done) => requests.push({ url, done }),
    },
  };
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    vm.runInNewContext(
      source,
      {
        module,
        exports: module.exports,
        require: (name) => {
          if (name === 'cc') return cc;
          if (name === './Widgets') return {};
          return load(path.resolve(path.dirname(file), name + '.ts'));
        },
      },
      { filename: file },
    );
    return module.exports;
  }
  return {
    load: (name) => load('assets/scripts/presentation/' + name + '.ts'),
    requests,
    textures,
    frames,
    ImageAsset,
  };
}
for (const bundle of [false, true])
  test(`shared icon lifetime (${bundle ? 'Creator bundle' : 'remote preview'})`, () => {
    const h = harness(bundle),
      { acquireCropTexture } = h.load('CropTexture');
    const a = acquireCropTexture('soil'),
      b = acquireCropTexture('soil');
    assert.equal(h.requests.length, 1);
    assert.equal(a.value, b.value);
    let aReady = 0,
      bReady = 0;
    const stop = a.value.listen(() => aReady++);
    b.value.listen(() => bReady++);
    stop();
    a.release();
    a.release();
    const image = new h.ImageAsset();
    h.requests[0].done(null, image);
    assert.equal(aReady, 0);
    assert.equal(bReady, 1);
    assert.equal(h.textures.length, 1);
    assert.equal(image.refs, 1);
    assert.equal(b.value.frame.rect.width, 897);
    b.release();
    b.release();
    assert.equal(h.textures[0].destroyed, 1);
    assert.equal(h.frames[0].destroyed, 1);
    assert.equal(image.refs, 0);
    const c = acquireCropTexture('soil');
    assert.equal(h.requests.length, 2);
    c.release();
  });
test('late callback after last release creates no texture and cannot notify new generation', () => {
  const h = harness(),
    { acquireCropTexture } = h.load('CropTexture');
  const a = acquireCropTexture('wood');
  a.release();
  const b = acquireCropTexture('wood');
  let ready = 0;
  b.value.listen(() => ready++);
  const old = new h.ImageAsset();
  h.requests[0].done(null, old);
  assert.equal(h.textures.length, 0);
  assert.equal(old.refs, 0);
  assert.equal(ready, 0);
  const next = new h.ImageAsset();
  h.requests[1].done(null, next);
  assert.equal(ready, 1);
  b.release();
  assert.equal(next.refs, 0);
});
test('failed image load preserves fallback and releases safely', () => {
  const h = harness(),
    { acquireCropTexture } = h.load('CropTexture');
  const a = acquireCropTexture('wood');
  h.requests[0].done(Error('offline'));
  assert.equal(a.value.frame, null);
  a.release();
  assert.equal(h.textures.length, 0);
});
test('tray construction is lazy and two consumers share only requested icons', () => {
  const h = harness(),
    { TrayIcons } = h.load('TrayIcons');
  const a = new TrayIcons(),
    b = new TrayIcons();
  assert.equal(h.requests.length, 0);
  a.artwork('vegetable');
  b.artwork('vegetable');
  assert.equal(h.requests.length, 1);
  assert.match(h.requests[0].url, /carrot/);
  a.artwork('diggingPickaxe');
  assert.equal(h.requests.length, 2);
  a.artwork('chilledVegetable');
  assert.equal(h.requests.length, 2);
  const image = new h.ImageAsset();
  h.requests[0].done(null, image);
  a.dispose();
  assert.equal(image.refs, 1);
  b.dispose();
  assert.equal(image.refs, 0);
  a.artwork('wood');
  assert.equal(h.requests.length, 2);
});
test('paged tray prepares only shown entries once, without changing hit targets or destinations', () => {
  const h = harness(),
    { TrayColumn } = h.load('TrayColumn');
  const column = Object.create(TrayColumn.prototype),
    calls = [];
  const entries = Array.from({ length: 4 }, (_, i) => ({
    kind: 'item' + i,
    node: { active: false, setPosition() {} },
    prepare: () => calls.push(i),
  }));
  Object.assign(column, {
    entries,
    visible: entries,
    slots: 2,
    page: 0,
    pager: { active: false, setPosition() {} },
    pageText: {},
    gesture: { cancel() {} },
  });
  column.render();
  assert.deepEqual(calls, [0, 1]);
  assert.deepEqual(
    entries.map((e) => e.node.active),
    [true, true, false, false],
  );
  column.render();
  assert.deepEqual(calls, [0, 1]);
  column.page = 1;
  column.render();
  assert.deepEqual(calls, [0, 1, 2, 3]);
  column.page = 0;
  column.render();
  assert.deepEqual(calls, [0, 1, 2, 3]);
});
