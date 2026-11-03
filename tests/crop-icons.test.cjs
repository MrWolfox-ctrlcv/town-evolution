const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('generated crop icons are portable256px RGBA PNG assets, not missing placeholders', () => {
  for (const id of ['carrot', 'wheat', 'lettuce', 'sickle']) {
    const data = fs.readFileSync(
      path.join(__dirname, '../assets/resources/crop-icons', id + '.png'),
    );
    assert.ok(data.length > 1000, id);
    assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(data.readUInt32BE(16), 256);
    assert.equal(data.readUInt32BE(20), 256);
    assert.equal(data[25], 6, 'RGBA preserves transparency');
  }
});
