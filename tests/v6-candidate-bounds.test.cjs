const test = require('node:test');
const assert = require('node:assert/strict');
const { V6CandidateBounds } = require('../.domain-build/art/V6CandidateBounds');
const { V6Terrain } = require('../.domain-build/domain/v6-terrain');
const { cameraDepth } = require('../.domain-build/application/CameraFraming');
const state = () => ({ trees: [], buildings: [], groundStacks: [] });
test('dry cell metadata includes lattice peak instead of center and missing coast stays below land plane', () => {
  const cells = Array(192 * 192).fill(null);
  cells[0] = { groundRange: [1, 9], naturalHeight: 2 };
  const world = new V6Terrain(
    1,
    { hydrology: {}, starter: {} },
    { grounds: [], stones: [], soils: [] },
    { cells, deposits: new Map([['0,0', { ceiling: 43 }]]), trees: [] },
  );
  assert.equal(world.cellUpperBound(0, 0), 43);
  assert.equal(world.cellUpperBound(-1, -1), 0.015);
  assert.equal(world.cellUpperBound(40, 40), 0.015);
});
test('candidate bounds cache existing metadata, include halo, edits and coast without sampling', () => {
  let reads = 0;
  const source = {
    world: {
      cellUpperBound: (x, z) => {
        reads++;
        return x === 16 && z === 8 ? 42 : 0.015;
      },
    },
    editAt: (x, z) => (x === 10 && z === 10 ? { level: 50, fills: [{ level: 51 }] } : null),
  };
  const bounds = new V6CandidateBounds(source, state());
  const first = bounds.get('0,0');
  assert.ok(first.max.y > 51);
  assert.equal(first.min.y, -4);
  assert.equal(reads, 18 * 18);
  assert.deepEqual(bounds.get('0,0'), first);
  assert.equal(reads, 18 * 18);
  const natural = new V6CandidateBounds({ ...source, editAt: () => null }, state());
  assert.ok(natural.get('0,0').max.y > 42);
  assert.ok(bounds.get('-1,-1').max.y >= Math.fround(0.015));
});
test('tree, building footprint, ground items and missing metadata remain conservative', () => {
  const source = { world: { cellUpperBound: () => 0.015 }, editAt: () => null };
  const s = state();
  s.trees.push({ x: 1, z: 1 });
  s.buildings.push({ x: 16, z: 16, kind: 'house', rotation: 0 });
  s.groundStacks.push({ x: 32, z: 32 });
  const bounds = new V6CandidateBounds(source, s);
  assert.equal(bounds.get('0,0'), null);
  assert.equal(bounds.get('1,1'), null);
  assert.equal(bounds.get('2,2'), null);
  assert.ok(bounds.get('3,3'));
  assert.equal(new V6CandidateBounds({ world: {}, editAt: () => null }, state()).get('0,0'), null);
});
test('unknown meshes pass conservative bounds to existing shadow-aware visibility, not a lower camera ceiling', () => {
  const fs = require('node:fs');
  const view = fs.readFileSync('assets/scripts/presentation/V6IslandView.ts', 'utf8');
  assert.match(view, /return !bounds \|\| visible\(bounds.min, bounds.max\)/);
  const frame = fs.readFileSync('assets/scripts/presentation/TownStreamingFrame.ts', 'utf8');
  assert.match(frame, /map.boxVisible\(min, max\)/);
  const map = fs.readFileSync('assets/scripts/presentation/MapCamera.ts', 'utf8');
  assert.match(map, /cameraSceneBoxVisible/);
  assert.ok(cameraDepth(192, 8.3, 72.015).far > 100);
});
