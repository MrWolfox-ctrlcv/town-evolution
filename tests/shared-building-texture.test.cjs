const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { SharedResource } = require('../.domain-build/application/SharedResource');

test('zero users allocate nothing; seven real users share one resource until the last release', () => {
  let created = 0,
    destroyed = 0;
  const pool = new SharedResource(() => ({ id: ++created, dispose: () => destroyed++ }));
  assert.equal(created, 0);
  const leases = Array.from({ length: 7 }, () => pool.acquire());
  assert.equal(created, 1);
  assert.ok(leases.every((lease) => lease.value === leases[0].value));
  for (const lease of leases.slice(0, 6)) lease.release();
  assert.equal(destroyed, 0);
  leases[6].release();
  assert.equal(destroyed, 1);
  for (const lease of leases) lease.release();
  assert.equal(destroyed, 1, 'repeat disposal does not decrement another owner or destroy twice');
});

test('a later scene acquires a fresh resource and stale leases cannot release it', () => {
  const destroyed = [];
  let created = 0;
  const pool = new SharedResource(() => {
    const id = ++created;
    return { id, dispose: () => destroyed.push(id) };
  });
  const old = pool.acquire();
  old.release();
  const current = pool.acquire();
  old.release();
  assert.equal(current.value.id, 2);
  assert.deepEqual(destroyed, [1]);
  current.release();
  assert.deepEqual(destroyed, [1, 2]);
});

test('resource construction failure leaves no phantom owner', () => {
  let attempts = 0,
    destroyed = 0;
  const pool = new SharedResource(() => {
    if (++attempts === 1) throw new Error('construction failure');
    return { dispose: () => destroyed++ };
  });
  assert.throws(() => pool.acquire(), /construction failure/);
  const lease = pool.acquire();
  lease.release();
  assert.equal(attempts, 2);
  assert.equal(destroyed, 1);
});

test('wood acquisition is lazy and asynchronous disposal guards run before upload or image retention', () => {
  const renderer = fs.readFileSync('assets/scripts/presentation/AssetRenderer.ts', 'utf8');
  const texture = fs.readFileSync('assets/scripts/presentation/BuildingTexture.ts', 'utf8');
  assert.match(renderer, /private wood: ResourceLease<BuildingTexture> \| null = null/);
  assert.ok(!renderer.includes('new BuildingTexture('));
  assert.match(
    renderer,
    /textured\s*\? \(this\.wood \?\?= acquireBuildingTexture\(\)\)\.value\.material\s*: this\.material/,
  );
  assert.match(renderer, /this\.wood\?\.release\(\);\s*this\.wood = null/);
  assert.match(renderer, /if \(this\.disposed\) throw new Error/);
  assert.match(renderer, /dispose\(\): void \{\s*if \(this\.disposed\) return/);
  assert.match(texture, /new SharedResource\(\(\) => new BuildingTexture\(\)\)/);
  const callback = texture.slice(texture.indexOf('const done'));
  assert.ok(
    callback.indexOf('if (this.disposed || this.image) return') <
      callback.indexOf('image.addRef()'),
  );
  assert.ok(
    callback.indexOf('if (this.disposed || this.image) return') <
      callback.indexOf('new Texture2D()'),
  );
  assert.match(texture, /dispose\(\): void \{\s*if \(this\.disposed\) return/);
  assert.match(texture, /this\.image\?\.decRef\(\)/);
});
