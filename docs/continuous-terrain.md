# Continuous natural terrain

The island uses seeded continuous gradient noise and a smooth positive height
field for its mountains and earth hills. Resource cells remain gameplay units;
untouched terrain is not displayed as small cubes. Natural surfaces share
continuous normals; mined cells gain real horizontal and vertical cut faces.

## Compatibility and interaction

- Existing seed, terrain version, resource IDs, quantities, and depleted cells are
  unchanged. Rendering neither migrates nor writes a save. Versions 1, 2, 3, and 4
  use their own immutable `terrainAt` reference. New games and demo islands use
  version 4; importing an old save never upgrades or resets it.
- Removing stone yields one stone per command. Removing a soil column yields
  nine soil. Visual height is not used to redefine either quantity.
- The natural field is immutable and independent of remaining stock. Mining
  clips only the selected cell at its remaining integer resource level. The
  clipped top has hard upward normals, and exposed grid-boundary walls have
  horizontal normals. Neighboring unmined surface heights remain exactly equal.
  Depleted cells have no collectible triangles; their surviving neighbors own
  and expose the new cut walls.
- Rendering and picking share the same vertex snapshot. Each resource triangle
  carries its saved resource ID. AABB checks only reject candidates; final hits
  intersect actual front-facing triangles and respect closer buildings, trees,
  and piles. Feedback uses the current surface height.

## Coast and water

The coastline is curved where doing so is safe. Real building footprints,
including upgraded farms, protect shoreline contacts. The protection margin
also retains dock exits in all four orientations. Concave shoreline ears include
boundary vertices when checking triangulation, preventing triangles from
bridging across protected water.

Dry sand slopes outward from the grass for about two logical tiles, followed
by a darker wet-sand band and submerged shelf. Seeded continuous noise varies
its width and tone. The geometric waterline is the beach/sea-level intersection,
not the grass boundary. Protected dock approaches have zero beach offset, with
a gradual taper into neighboring sand. A captured land mask prevents narrow
coves from gaining sand bridges. Beach colors are albedo; real normals receive
the scene's lighting rather than a second baked directional shade.

Inner water holes and disconnected pieces use exact-mask top strips. Inner
banks remain exact while unambiguous outer contours retain their beaches.
Ambiguous corner contacts use exact edge walls. Gameplay land eligibility and
old saves remain unchanged in every case.

Water has a capped ocean grid plus fine near-shore strips for turquoise shallows
and softly moving, broken foam crests. Coherent long swells avoid fine/coarse
mesh intersections. Nearby-segment spatial buckets replace a full coastline
scan per water vertex. All dynamic indices are explicitly kept below the
65,535-vertex budget; the previous size-times-two grid would overflow at 192.
At v4 seed 42173, the current beach has 12,352 vertices and the complete water
mesh has 33,625 vertices and 63,648 triangles. CPU-only local generation measured
about 113 ms and 76 ms respectively; these are not device frame-rate results.

Only reusable water position/color buffers update, at up to 20 Hz. Explicit
capacities exceed Cocos' default 1,024-entry buffers. Rebuilding a coast keeps
the current wave phase. This is stylized water, not fluid simulation or a
reflection/refraction renderer. Final GPU appearance still requires actual
Cocos browser/device review.

## Cache and validation boundaries

Immutable natural height samples are cached. Mining rebuilds at most the
selected column and four direct neighbors, without rebuilding coastline or water. Building
changes first compare protection coverage on the original shoreline vertices
and final curve vertices. Inland moves/upgrades, same-footprint rotations,
equivalent coverage, and building-list reordering leave coast/water cached;
ground details still refresh. Actual shoreline coverage changes, terrain
version, seed, and land extensions invalidate their affected layers. The stored
coverage signature uses the newly rebuilt curve, including wall-only changes.
The v4 resource mesh shares 25 vertices per untouched cell. Sparse mountain
ranges keep the 192-square world at roughly 1,300–1,400 resource columns rather
than multiplying density by map area. Cut patches duplicate only vertices that
need distinct hard normals. See `world-expansion.md` for scale and compatibility.

`npm run check` covers types, domain/application tests, save compatibility,
incremental geometry, oblique picking, coast holes, concavity, protection, cache
invalidation, and water lifecycle. `npm run preview:build` compiles the actual
pinned Cocos 3.8.8 engine and effect compiler. Neither command is a Creator
editor import, a physical-device test, or proof of rendered UI behavior.

With `COCOS_ENGINE` pointing at that official source checkout,
`node scripts/preview/water-smoke.cjs` separately builds an official headless
engine with `gfx-empty`. It runs production `CoastalWaterMotion` against real
`Mesh` CPU buffers and the engine's `EmptyDevice`, checks default-capacity
rejection, 101 timed uploads, phase continuity, and disposal. It does not replace
the application's WebGL renderer. Cocos' normal asset-destroy debug messages and
jsdom's missing canvas-capability diagnostics are not rendered acceptance.

The 2026-11-05 offline review exported the actual compiled TypeScript meshes for
versions 2 and 3, four camera directions, whole-island coastline, and mined cuts.
Blender CPU images live in the ignored `build/continuous-mesh-review/` evidence
directory. They verify mesh shape and baked colors only, not Cocos screenshots,
real mouse/touch mining, animated-water appearance, or mobile performance.

Before release, run the desktop and mobile browser flows against the final
preview: mining to depletion, nearby actor occlusion, reload, dock rotations,
building moves/upgrades, and repeated title/game transitions. The local browser
environment previously failed before rendering at Chromium's AF_UNIX socket
creation; no sandbox restriction was bypassed and no browser pass is claimed.
