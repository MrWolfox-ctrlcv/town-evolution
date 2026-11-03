/** Execute the actual built Cocos Tween module without graphics; no tween implementation is mocked. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const engine = path.resolve(process.env.COCOS_ENGINE || 'temp/cocos-engine');
const tools = path.resolve(process.env.PREVIEW_TOOLS || engine);
const out = path.resolve(process.env.PREVIEW_OUT || 'build/preview');
const { JSDOM, VirtualConsole } = require(path.join(tools, 'node_modules/jsdom'));
const { System } = require(path.join(engine, 'node_modules/systemjs/dist/system-node.cjs'));
async function main() {
  const domWarnings = [];
  const console = new VirtualConsole();
  console.on('jsdomError', (error) => domWarnings.push(error.message));
  const dom = new JSDOM('<!doctype html><canvas id="GameCanvas"></canvas>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    virtualConsole: console,
  });
  for (const key of [
    'window',
    'document',
    'navigator',
    'HTMLElement',
    'HTMLCanvasElement',
    'HTMLImageElement',
    'Image',
    'XMLHttpRequest',
    'localStorage',
    'screen',
    'location',
  ])
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  try {
    const file = path.join(out, 'engine/cc.js');
    const exportsCheck = require('./verify-engine.cjs')(file, engine);
    const cc = await System.import(pathToFileURL(file).href);
    for (const name of ['tween', 'Tween', 'TweenSystem'])
      assert.equal(typeof cc[name], 'function', name);
    // Trigger the real engine's registration listener, without creating a WebGL device.
    cc.director.emit(cc.Director.EVENT_INIT);
    const system = cc.TweenSystem.instance;
    assert.ok(system && cc.director.getSystem(cc.TweenSystem.ID) === system);
    const clock = { progress: 0 };
    const updates = [];
    let completed = 0;
    cc.tween(clock)
      .to(0.1, { progress: 1 }, { onUpdate: (target) => updates.push(target.progress) })
      .call(() => completed++)
      .start();
    const samples = [];
    for (let i = 0; i < 10; i++) {
      system.update(0.02);
      samples.push(clock.progress);
    }
    assert.ok(
      samples.some((value) => value > 0 && value < 1),
      'Actual tween progresses through intermediate values',
    );
    assert.ok(
      updates.some((value) => value > 0 && value < 1),
      'Actual onUpdate callbacks run',
    );
    assert.equal(clock.progress, 1);
    assert.equal(completed, 1);
    const stopped = { progress: 0 };
    cc.tween(stopped).to(1, { progress: 1 }).start();
    system.update(0.02);
    system.update(0.02);
    assert.ok(stopped.progress > 0);
    cc.Tween.stopAllByTarget(stopped);
    const before = stopped.progress;
    for (let i = 0; i < 10; i++) system.update(0.02);
    assert.equal(stopped.progress, before, 'Stop cleanup removes actual scheduled work');
    const result = {
      passed: true,
      layer:
        'actual compiled Cocos engine under jsdom, deterministic TweenSystem update ticks; no WebGL rendering',
      engineSha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
      exportsCheck,
      registered: true,
      samples,
      onUpdateCallbacks: updates.length,
      completionCallbacks: completed,
      cancellationStopsProgress: true,
      domWarnings,
    };
    fs.mkdirSync('build', { recursive: true });
    fs.writeFileSync('build/tween-smoke.json', JSON.stringify(result, null, 2) + '\n');
    globalThis.console.log(JSON.stringify(result, null, 2));
  } finally {
    dom.window.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
