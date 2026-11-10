const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const journal = require('../scripts/preview/v6-progress.cjs');

test('v6 progress persists wait starts and a bounded last observation without full map snapshots', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v6-progress-'));
  try {
    const file = path.join(dir, 'progress.json');
    let now = 1000;
    const progress = journal(file, () => now);
    progress.stage('resume');
    const wait = progress.begin('wait', 'home publication', { timeoutMs: 90000 });
    assert.equal(JSON.parse(fs.readFileSync(file)).activities[0].status, 'entered');
    const huge = { naturalResources: Array(10000).fill({ x: 1, z: 2 }) };
    for (let i = 0; i < 100; i++) {
      now += 10;
      progress.sample(wait, {
        frames: i,
        homeReady: false,
        focusReady: false,
        surface: { phase: 'overview', readyChunks: 3, requestedChunks: 196 },
        camera: { height: 5 },
        live: huge,
        saved: huge,
        candidates: Array(1000).fill({}),
        message: 'x'.repeat(1000),
      });
    }
    const text = fs.readFileSync(file, 'utf8'),
      data = JSON.parse(text);
    assert.ok(text.length < 3000);
    assert.equal(data.activities.length, 1);
    assert.equal(data.activities[0].samples, 100);
    assert.equal(data.activities[0].last.frames, 99);
    assert.equal(data.activities[0].last.message.length, 200);
    assert.equal(data.activities[0].last.live, undefined);
    assert.equal(data.activities[0].last.saved, undefined);
    // Context closure does not require another browser inspection to preserve evidence.
    now += 500;
    progress.end(wait, Error('context closed'));
    const failed = JSON.parse(fs.readFileSync(file)).activities[0];
    assert.equal(failed.status, 'failed');
    assert.equal(failed.durationMs, 1500);
    assert.equal(failed.last.frames, 99);
    progress.stage('failure');
    assert.equal(JSON.parse(fs.readFileSync(file)).stages[0].durationMs, 1500);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('v6 screenshot timing records completion and failure without changing errors', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v6-progress-'));
  try {
    const file = path.join(dir, 'progress.json');
    let now = 100;
    const progress = journal(file, () => now);
    assert.equal(
      await progress.run('screenshot', 'filled', async () => {
        now += 50;
        return 'image';
      }),
      'image',
    );
    const failure = Error('page closed');
    await assert.rejects(
      progress.run('screenshot', 'failed', async () => {
        now += 80;
        throw failure;
      }),
      (error) => error === failure,
    );
    const entries = JSON.parse(fs.readFileSync(file)).activities;
    assert.deepEqual(
      entries.map((e) => [e.status, e.durationMs]),
      [
        ['completed', 50],
        ['failed', 80],
      ],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
