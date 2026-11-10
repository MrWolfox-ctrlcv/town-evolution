const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildCoastalWater, coastalWaveHeight } = require('../.domain-build/art/CoastalWater.js');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const effect = read('assets/resources/environment/town-stylized-water.effect');
const shader = effect.replace(/\/\/[^\n]*/g, '');

test('water shading stays opaque and does not displace or require unavailable mesh channels', () => {
  assert.match(shader, /depthTest:\s*true/);
  assert.match(shader, /depthWrite:\s*true/);
  assert.match(shader, /blend:\s*false/);
  assert.match(shader, /vec4\(a_position,\s*1\.0\)/);
  assert.doesNotMatch(shader, /a_position\s*[+*/-]=|a_position\.[xyz]\s*=/);
  assert.doesNotMatch(shader, /\ba_normal\b|\ba_texCoord\b|\bsampler\w*\b|\bdiscard\b/);
  assert.match(shader, /CCFragOutput\(vec4\(color,\s*1\.0\)\)/);
  assert.match(shader, /v_worldPosition\.xz/);
  assert.match(shader, /cc_time\.x/);
  assert.match(shader, /cc_matViewInv\[2\]\.xyz/);
  assert.match(shader, /SRGBToLinear\(/);
});

test('water material preserves a vertex-color fallback when the effect cannot load', () => {
  const source = read('assets/scripts/presentation/WaterMaterial.ts');
  assert.match(source, /EffectAsset\.get\(WATER_EFFECT_NAME\)/);
  assert.match(source, /effectName: 'builtin-unlit'/);
  assert.match(source, /USE_VERTEX_COLOR: true/);
  const meta = JSON.parse(read('assets/resources/environment/town-stylized-water.effect.meta'));
  assert.equal(meta.importer, 'effect');
  assert.match(meta.uuid, /^[a-f0-9-]{36}$/);
  const block = shader.match(/uniform WaterSurface\s*\{([^}]+)\}/)[1];
  assert.equal((block.match(/vec4/g) || []).length, 3);
  assert.doesNotMatch(block, /\bfloat\b|\bvec[23]\b/);
});

test('water shading leaves the navigation and hidden-bed sea-level envelope unchanged', () => {
  const size = 40;
  for (const seed of [0, 1, 42173, 2147483647]) {
    for (const time of [0, 1, 17, 1800]) {
      for (let x = -size; x <= size * 2; x += 7) {
        for (let z = -size; z <= size * 2; z += 11) {
          const height = coastalWaveHeight(x, z, seed, time);
          assert.ok(Number.isFinite(height));
          assert.ok(height >= -0.642 - 1e-12 && height <= -0.598 + 1e-12);
        }
      }
    }
  }
  const water = buildCoastalWater(size, 42173, []);
  assert.equal(water.positions.length / 3, 6561);
  assert.equal(water.indices.length, 38400);
  assert.equal(water.colors.length / 4, water.positions.length / 3);
  assert.ok(water.indices.every((i) => i >= 0 && i <= 65534));
});
