const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const expected = require('./fixtures/terrain6-worker-baseline.json');

test('Worker startup failure generates a complete byte-identical save from a fresh-process cold cache', () => {
  const output = execFileSync(
    process.execPath,
    [path.join(__dirname, 'helpers/v6-worker-cold-fallback.cjs')],
    { encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 },
  );
  const result = JSON.parse(output);
  assert.equal(result.coldBefore, true);
  assert.equal(result.starts, 1);
  assert.ok(result.ticks > 1);
  assert.equal(result.saveHash, expected.saveHash);
});
