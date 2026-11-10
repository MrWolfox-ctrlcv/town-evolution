const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const metrics = require('../scripts/preview/load-metrics.cjs');
test('read-only metrics summarize bytes, duplicate fetches, CPU-gap evidence and redact URL secrets', () => {
  const entries = [
    {
      name: 'http://user:password@localhost:8123/main.js?token=secret#fragment',
      duration: 40,
      startTime: 1,
      responseEnd: 41,
      transferSize: 300,
      encodedBodySize: 200,
      decodedBodySize: 600,
      initiatorType: 'script',
    },
    {
      name: 'http://localhost:8123/main.js?token=other',
      duration: 10,
      startTime: 50,
      responseEnd: 60,
      transferSize: 0,
      encodedBodySize: 200,
      decodedBodySize: 600,
      initiatorType: 'script',
    },
  ];
  const context = {
    URL,
    performance: {
      timeOrigin: 1000,
      now: () => 100,
      memory: { usedJSHeapSize: 123 },
      getEntriesByType: (type) =>
        type === 'resource' ? entries : [{ type: 'reload', domInteractive: 80 }],
    },
    window: { __townPreview: { frames: 15, ready: true } },
    location: { href: 'http://localhost:8123/?key=secret#hash' },
  };
  const result = vm.runInNewContext(`(${metrics.readPerformance.toString()})()`, context);
  assert.equal(result.resources.count, 2);
  assert.equal(result.resources.transferBytes, 300);
  assert.equal(result.resources.encodedBytes, 400);
  assert.equal(result.resources.decodedBytes, 1200);
  assert.equal(result.resources.duplicateUrls[0].count, 2);
  assert.equal(result.resources.slowest[0].duration, 40);
  assert.equal(result.resources.zeroTransferWithBodyCount, 1);
  assert.equal(result.resources.latestResponseEndMs, 60);
  assert.equal(result.elapsedMs, 100);
  assert.equal(result.frames, 15);
  assert.equal(result.heap.usedJSHeapSize, 123);
  assert.equal(result.navigation.type, 'reload');
  assert.doesNotMatch(JSON.stringify(result), /secret|token|password|user:|fragment|key=/);
});
test('metrics journal keeps verified release provenance and previous samples if context closes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-metrics-'));
  try {
    const file = path.join(dir, 'load.json');
    let fail = false;
    const page = {
      evaluate: async () => {
        if (fail) throw Error('context closed?token=secret');
        return { timeOrigin: 1, elapsedMs: 30 };
      },
    };
    metrics.start(page, file, {
      buildMode: 'release',
      debug: false,
      compressed: true,
      provenanceSha256: 'verifiedhash',
      sourceCommit: 'commit',
    });
    await metrics.collect(page, 'ready');
    fail = true;
    await metrics.collect(page, 'end');
    const data = JSON.parse(fs.readFileSync(file));
    assert.equal(data.provenance.buildMode, 'release');
    assert.equal(data.provenance.provenanceSha256, 'verifiedhash');
    assert.deepEqual(
      data.snapshots.map((s) => s.status),
      ['collected', 'unavailable'],
    );
    assert.equal(data.snapshots[0].metrics.timeOrigin, 1);
    assert.doesNotMatch(JSON.stringify(data), /secret/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
