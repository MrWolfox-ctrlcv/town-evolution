const { assertCropDrops } = require('./helpers/loose-output.cjs');
/** CPU mesh/affine regression only. This does not execute Cocos, WebGL or a device renderer. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, game, project, ray, surface } = require('./helpers/farm-picking-ui.cjs');
const { pickFarmCrop } = require('../.domain-build/application/FarmPicking');
const { SAVE_KEY } = require('../.domain-build/domain/storage');

function denseFarm(options) {
  const f = fixture({ ...options, occupied: false });
  const b = f.session.state.buildings[1];
  const crops = b.irrigated
    ? ['rice']
    : game.CROP_KEYS.filter((crop) => game.CROPS[crop].field === 'dry');
  b.cropJobs = b.cropJobs.map((_, cell) => ({
    id: `j${cell + 3}`,
    crop: crops[cell % crops.length],
    startedAt: f.now - game.CROPS[crops[cell % crops.length]].durationMs,
    readyAt: f.now,
    durationMs: game.CROPS[crops[cell % crops.length]].durationMs,
    yield: 2,
  }));
  f.session.state.nextId = b.cropJobs.length + 3;
  f.sync();
  assert.equal(f.session.save(), true);
  const span = options.large ? 4 : 2;
  f.bed = surface(
    `${options.large ? 'farm-large-bed' : 'farm-cell-bed'}${b.irrigated ? '-water' : ''}`,
    {
      x: b.x + span / 2,
      z: b.z + span / 2,
    },
    options.rotation,
  ).surface;
  return f;
}

/** Pick expected identity from forward-transformed actual triangles, independently of TownView. */
function visiblePoint(f, item, requireOldMismatch = false) {
  const b = f.session.state.buildings[1];
  for (const crop of f.crops()) {
    if (b.cropJobs[crop.cell].crop !== item) continue;
    const { mesh } = crop.posed;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const p = { x: 0, y: 0, z: 0 };
      for (const vertex of mesh.indices.slice(i, i + 3)) {
        p.x += mesh.positions[vertex * 3] / 3;
        p.y += mesh.positions[vertex * 3 + 1] / 3;
        p.z += mesh.positions[vertex * 3 + 2] / 3;
      }
      if (p.y < 0.3) continue;
      const point = project(p),
        r = ray(point);
      const distance = crop.posed.surface.distance(r);
      if (distance === null || distance > (f.bed.distance(r) ?? Infinity)) continue;
      if (
        f.crops().some((other) => {
          if (other === crop) return false;
          const d = other.posed.surface.distance(r, distance);
          return d !== null && d < distance;
        })
      )
        continue;
      const old = pickFarmCrop(f.session.state.buildings, r, f.now);
      if (requireOldMismatch && old?.cell === crop.cell) continue;
      return { point, r, cell: crop.cell, distance, old };
    }
  }
  assert.fail(
    `No visible posed ${item} triangle${requireOldMismatch ? ' with the old AABB mismatch' : ''}`,
  );
}

for (const large of [false, true])
  test(`old crop volumes misidentify a visible swaying carrot on ${large ? 'large' : 'ordinary'} fields`, () => {
    const f = denseFarm({ large, rotation: 0 });
    f.applyPose(f.now + 300);
    const hit = visiblePoint(f, 'vegetable', true);
    assert.ok(hit.old, 'The original volume picker returns a real, incorrect neighbor');
    assert.notEqual(hit.old.cell, hit.cell, 'Preserves the pre-fix AABB regression evidence');
    assert.equal(f.town.pickCrop(hit.r, f.session.state)?.cell, hit.cell);
  });

for (const large of [false, true])
  for (const rotation of [0, 1, 2, 3])
    for (const item of game.CROP_KEYS)
      test(`current ${item} wind triangles keep identity and saved harvest on ${large ? 'large' : 'ordinary'} rotation ${rotation}`, () => {
        const f = denseFarm({ large, rotation, crop: item });
        assert.equal(Boolean(f.farm.irrigated), game.CROPS[item].field === 'water');
        const picker = f.town.buildings.get('b2').surface;
        const originals = f.crops().map((crop) => {
          const original = {
            node: crop.node,
            mesh: crop.node.renderers[0].mesh,
            positions: crop.mesh.positions,
            values: crop.mesh.positions.slice(),
            attributeReads: 0,
            indexReads: 0,
          };
          const readAttribute = original.mesh.readAttribute,
            readIndices = original.mesh.readIndices;
          original.mesh.readAttribute = (...args) => {
            original.attributeReads++;
            return readAttribute(...args);
          };
          original.mesh.readIndices = (...args) => {
            original.indexReads++;
            return readIndices(...args);
          };
          return original;
        });
        const poses = [],
          matrices = [];
        let hit;
        // Includes ripening stretch and later wind phases, without rebuilding scene or pickers.
        for (const offset of [0, 300, 1300, 3100]) {
          f.applyPose(f.now + offset);
          hit = visiblePoint(f, item);
          const actual = f.town.pickCrop(hit.r, f.session.state);
          assert.equal(actual?.buildingId, 'b2');
          assert.equal(actual.cell, hit.cell, `Current ${item} triangle beats neighboring volumes`);
          assert.ok(
            Math.abs(actual.distance - hit.distance) < 1e-7,
            'Inverse current-matrix picking agrees with independently forward-posed triangles',
          );
          assert.strictEqual(f.town.buildings.get('b2').surface, picker);
          for (let i = 0; i < originals.length; i++) {
            const current = f.crops()[i],
              original = originals[i];
            assert.strictEqual(current.node, original.node);
            assert.strictEqual(current.node.renderers[0].mesh, original.mesh);
            assert.strictEqual(current.mesh.positions, original.positions);
          }
          const animated = f
            .crops()
            .find((crop) => f.session.state.buildings[1].cropJobs[crop.cell].crop === item);
          poses.push(JSON.stringify(animated.pose));
          matrices.push(JSON.stringify(animated.node.world.affine));
          assert.ok(
            animated.node.world.affine.some(
              (value, index) => [1, 2, 4, 6, 8, 9].includes(index) && Math.abs(value) > 1e-8,
            ),
            'The adapter exercises off-diagonal lean, not only scale and translation',
          );
        }
        assert.equal(new Set(poses).size, 4);
        assert.equal(new Set(matrices).size, 4);
        for (const original of originals) {
          assert.deepEqual(original.positions, original.values);
          assert.equal(original.attributeReads, 1, 'Wind never rebuilds the cached mesh surfaces');
          assert.equal(original.indexReads, 1);
        }

        const command = { type: 'harvestCell', buildingId: 'b2', cell: hit.cell };
        const expected = game.dispatch(f.session.state, command, f.now);
        assert.equal(expected.ok, true);
        const inventory = { ...f.session.state.inventory };
        f.tools.begin('harvest', 901, hit.point);
        assert.equal(f.tools.end(901, hit.point), true);
        assert.deepEqual(f.commands, [command]);
        assert.deepEqual(f.session.state, expected.state, 'No adjacent job or inventory changes');
        assert.deepEqual(f.session.state.inventory, inventory);
        assertCropDrops(f.session.state, f.farm, [hit.cell], item);
        assert.deepEqual(game.importSave(f.values.get(SAVE_KEY), f.now), expected.state);
        const saved = [...f.values],
          writes = f.writes();
        assert.equal(f.tools.end(901, hit.point), false);
        f.tools.move(901, hit.point);
        assert.deepEqual([...f.values], saved);
        assert.equal(f.writes(), writes);
      });
