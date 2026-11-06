/** Canonical CPU soil meshes and production routing, not GPU/device validation. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/demo-campaign-ui.cjs');
const { presentation, SceneNode } = require('./helpers/demo-campaign-scene.cjs');
const { worldSurface } = require('./helpers/resource-picking-ui.cjs');
const { farmCellAt } = require('../.domain-build/application/FarmCells');

// Match MapCamera's actual orthographic viewing direction, before normalization.
const slope = { x: -15, y: -20, z: -18 };
const length = Math.hypot(15, 20, 18);
const unit = { x: -15 / length, y: -20 / length, z: -18 / length };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
function turn(x, z, rotation) {
  return { x: [x, z, -x, -z][rotation], z: [z, -x, -z, x][rotation] };
}
function along(ray, distance) {
  return {
    x: ray.o.x + ray.d.x * distance,
    y: ray.o.y + ray.d.y * distance,
    z: ray.o.z + ray.d.z * distance,
  };
}

function prepare(f, id, rotation) {
  // Start with the untouched demo, then use only legal commands. No live-state patches.
  for (let i = 0; i < rotation; i++)
    assert.equal(
      f.session.run({ type: 'rotateBuilding', buildingId: id }),
      true,
      f.session.message,
    );
  f.advanceTo(f.now());
  return f.state().buildings.find((building) => building.id === id);
}

function fixedBoundaryRay(b) {
  const size = b.farmSize === 6 ? 6 : 3;
  const half = size / 3;
  // Last column's center, 0.006 inside the second/third-row boundary.
  // Large-field ridges cross this boundary; ordinary ridges stop before it.
  const local = turn(
    ((size - 0.5) * 2) / 3 - half,
    4 / 3 + (b.rotation < 2 ? 0.006 : -0.006) - half,
    b.rotation,
  );
  const aimed = { x: b.x + half + local.x, y: 0.1865, z: b.z + half + local.z };
  const toPlane = (0.17 - aimed.y) / slope.y;
  const plane = { x: aimed.x + slope.x * toPlane, z: aimed.z + slope.z * toPlane };
  const origin = { x: plane.x + 15, y: 20.17, z: plane.z + 18 };
  return {
    point: { x: plane.x, y: plane.z },
    plane,
    raw: { o: origin, d: slope },
    normalized: { o: { ...origin }, d: unit },
  };
}

for (const large of [false, true])
  for (const rotation of [0, 1, 2, 3])
    test(`${large ? 'large' : 'ordinary'} rotation ${rotation}: plant the visible soil cell rather than its lower-plane neighbor`, () => {
      const f = fixture('native');
      let tools;
      try {
        const id = f
          .state()
          .buildings.find(
            (b) =>
              b.kind === 'farm' && !b.irrigated && b.id !== 'b2' && (b.farmSize === 6) === large,
          ).id;
        const b = prepare(f, id, rotation);
        const rays = fixedBoundaryRay(b);
        const hit = f.town.farmToolSurface(rays.raw);
        const normalizedHit = f.town.farmToolSurface(rays.normalized);
        assert.equal(hit?.buildingId, id);
        assert.equal(hit.soil, true);
        assert.equal(normalizedHit?.buildingId, id);
        assert.equal(normalizedHit.soil, true);

        // This independently forward-transforms the production ModelFactory mesh.
        // The renderer picker instead inverse-transforms the ray into local space.
        const oracle = worldSurface(f.town.buildings.get(id).node);
        close(hit.distance, oracle.distance(rays.raw));
        close(normalizedHit.distance, oracle.distance(rays.normalized));
        close(normalizedHit.distance, hit.distance * length);
        const actual = along(rays.raw, hit.distance);
        const normalizedActual = along(rays.normalized, normalizedHit.distance);
        for (const axis of ['x', 'y', 'z']) close(actual[axis], normalizedActual[axis]);
        close(actual.y, large ? 0.1865 : 0.17);

        const expected = large ? (rotation < 2 ? 17 : 11) : rotation < 2 ? 5 : 8;
        const projected = large ? (rotation < 2 ? 11 : 17) : expected;
        assert.equal(farmCellAt(b, actual), expected);
        assert.equal(farmCellAt(b, rays.plane), projected);
        assert.equal(b.cropJobs[expected], null);
        assert.equal(b.cropJobs[projected], null);
        for (const ray of [rays.raw, rays.normalized])
          assert.equal(
            f.town.pickCrop(ray, f.state())?.cell,
            expected,
            'Bare-soil harvest fallback keeps the same actual visible cell',
          );

        // Only projection and map containment are adapters. The production tool,
        // scene picking, command dispatch, save validator and reload remain real.
        const map = {
          cancelGesture() {},
          contains: () => true,
          screenRay: (point) => ({
            o: { x: point.x + 15, y: 20.17, z: point.y + 18 },
            d: unit,
          }),
          ground() {
            throw new Error('Use the existing visible-soil hit; do not cast a lower-plane ray');
          },
        };
        const commands = [];
        const run = f.session.run.bind(f.session);
        f.session.run = (command) => {
          commands.push(command);
          return run(command);
        };
        const { FarmTools } = presentation('FarmTools');
        tools = new FarmTools(new SceneNode('SoilBoundary'), f.session, map, f.town, () =>
          f.advanceTo(f.now()),
        );
        const before = structuredClone(f.state());
        tools.begin('plant', 707, rays.point, 'vegetable');
        assert.equal(tools.end(707, rays.point), true);
        assert.deepEqual(commands, [
          { type: 'plantCell', buildingId: id, cell: expected, crop: 'vegetable' },
        ]);
        const after = f.state().buildings.find((building) => building.id === id);
        for (let cell = 0; cell < b.cropJobs.length; cell++)
          if (cell === expected) assert.equal(after.cropJobs[cell]?.crop, 'vegetable');
          else assert.deepEqual(after.cropJobs[cell], b.cropJobs[cell]);
        assert.deepEqual(f.state().inventory, {
          ...before.inventory,
          vegetable: before.inventory.vegetable - 1,
        });
        assert.equal(f.state().coins, before.coins);
        f.persisted();
      } finally {
        tools?.dispose();
        f.dispose();
      }
    });
