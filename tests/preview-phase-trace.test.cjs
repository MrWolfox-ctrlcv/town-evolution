const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const phaseTrace = require('../scripts/preview/phase-trace.cjs');
test('phase trace persists entry before blocked work, then completion or original failure', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'town-phase-'));
  try {
    const trace = phaseTrace(directory, 'test');
    const read = () =>
      JSON.parse(fs.readFileSync(path.join(directory, 'test-phases.json'), 'utf8'));
    let release;
    const pending = trace(
      'blocked renderer',
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    assert.equal(read()[0].status, 'entered');
    release(42);
    assert.equal(await pending, 42);
    assert.equal(read()[1].status, 'completed');
    assert.ok(read()[1].durationMs >= 0);
    const error = new Error('original');
    await assert.rejects(
      trace('failed step', () => {
        throw error;
      }),
      (value) => value === error,
    );
    assert.equal(read()[3].status, 'failed');
    assert.match(read()[3].error, /original/);
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});
