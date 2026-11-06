const assert = require('node:assert/strict');

// Node 22.23.4 / V8 12.4 and Node 24.22.1 / V8 13.6 differ only in
// surfaceHeight's last bits for the six frozen seeds. Measured bounds:
// 3 ULP and 2^-46 absolute error. Do not apply this to stock or other fields.
const MAX_HEIGHT_ULPS = 3n;
const MAX_HEIGHT_ABSOLUTE_ERROR = 2 ** -46;
const bits = new DataView(new ArrayBuffer(8));
function orderedBits(value) {
  bits.setFloat64(0, value);
  const raw = bits.getBigUint64(0);
  return raw >> 63n ? ~raw : raw | (1n << 63n);
}
function assertV5Reference(actual, expected, path = '') {
  if (Object.is(actual, expected)) return;
  if (/^cells\[\d+\]\.surfaceHeight$/.test(path)) {
    assert.ok(
      typeof actual === 'number' && Number.isFinite(actual) && Number.isFinite(expected),
      `${path}: finite height`,
    );
    // Preserve exact zeros/signs, including flat land and the coast.
    assert.ok(actual !== 0 && expected !== 0 && Math.sign(actual) === Math.sign(expected), path);
    const distance = orderedBits(actual) - orderedBits(expected);
    const ulps = distance < 0n ? -distance : distance;
    assert.ok(
      ulps <= MAX_HEIGHT_ULPS && Math.abs(actual - expected) <= MAX_HEIGHT_ABSOLUTE_ERROR,
      `${path}: ${actual} != ${expected} (${ulps} ULP)`,
    );
    return;
  }
  assert.equal(typeof actual, typeof expected, `${path}: type`);
  if (actual === null || expected === null || typeof expected !== 'object') {
    assert.deepEqual(actual, expected, path);
    return;
  }
  assert.equal(Array.isArray(actual), Array.isArray(expected), `${path}: array shape`);
  assert.deepEqual(Object.keys(actual), Object.keys(expected), `${path}: keys/order`);
  for (const key of Object.keys(expected)) {
    const next = Array.isArray(expected) ? `${path}[${key}]` : path ? `${path}.${key}` : key;
    assertV5Reference(actual[key], expected[key], next);
  }
}
module.exports = { assertV5Reference };
