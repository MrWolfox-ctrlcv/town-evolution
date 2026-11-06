# Directional lighting and real mesh shadows

The old ground detail mesh drew a sixteen-segment disc beneath each house, tree,
and pile. It blended guessed grass/road colors into that disc, producing the
yellow-green halo in the supplied house screenshot. Those discs are removed.

The town now uses Cocos Creator 3.8.8's built-in standard material and one
directional sun with a real shadow map. Buildings, wood components, crops, trees,
piles, the coast, and resource terrain cast/receive shadows from their geometry.
Roads receive shadows but do not cast them. Vertex colors are albedo rather than
a second fixed-direction light, and the existing shared wood image remains the
albedo texture. Canonical glTF exports are lit PBR assets using the same colors.

This is a graphics/rendering feature, not a physics-engine feature. Collision and
gravity are neither necessary for shadows nor introduced by this change. It is
not ray tracing, global illumination, or a claim of physically exact daylight.

## Mobile-oriented limits

- One 1024×1024 map, one cascade, four-tap PCF, one directional light.
- Cocos fits the map to each camera's view rather than spending its resolution on
  the entire 192-cell island during a close-up. Island overviews will be coarser.
- Shadow depth follows the active world camera's far plane, including very narrow
  large-island overviews beyond 500 units. Returning to close-up restores its short
  depth range; hidden title and isolated handbook cameras cannot overwrite it.
- No shadow mesh reconstruction or new material allocation every frame.
- Roughness 0.9, metallic 0, restrained specular, and a hemisphere ambient fill.
- Water deliberately retains its own animated unlit palette and does not cast
  or receive shadows. No new image/icon is generated.
- Handbook captures share the sun but disable casting and receiving, so their
  offscreen miniatures do not contaminate the world shadow map.

## Verification and remaining gate

`npm run typecheck:cocos` checks the real published 3.8.8 API declarations.
`tests/lighting.test.cjs` covers albedo independence from normal/rotation, removal
of discs, explicit render configuration, and lit export/material preservation.
These tests are not GPU rendering tests.

Static Cocos meshes do not automatically compute bounding boxes. The initial
lighting implementation omitted them, so Cocos's shadow culling skipped those
models despite their casting flags. `WorldMesh` now supplies each asset material
batch and each 16-bit terrain chunk's own finite `minPos`/`maxPos`.

`COCOS_ENGINE=/path/to/pinned/engine node scripts/preview/shadow-bounds-smoke.cjs`
uses the actual Cocos 3.8.8 EmptyDevice, Mesh, MeshRenderer bounds update and Model,
then executes the complete unmodified official `scene-culling.ts` module with the
same actual Cocos classes/enums. It checks all catalog material batches, a
multi-chunk mined mountain and the coast, verifies transformed vertices are inside
their `worldBounds`, and confirms the real `shadowCulling` retains the casters.
The negative control without bounds reproduces the original rejection. Movement,
rotation, scaling, disabled casting, out-of-frustum and handbook-layer rejection
are covered. The result is saved as `build/shadow-bounds-smoke.json`.
This verifies CPU geometry/culling, not shader execution or rendered shadows.

On 2026-11-05, a fresh sandboxed Chromium capability attempt failed at Linux
`socket()` with `Operation not permitted`, before any page or WebGL context.
No security flags were weakened to bypass this. Actual shader execution,
shadow-map pixels, acne/peter-panning, moving-object shadow alignment, phone
frame times, and Creator editor import remain unverified in this environment.

On a graphics-capable machine, build the actual preview and inspect the house,
trees, piles and the cut mountain at close, normal and overview zooms. Rotate and
lift a building, move a pile, and watch crop sway: shadows must follow the current
mesh pose with a consistent sun direction, without a circular residual halo.
Check roads, cut walls, old/new saves, title/game transitions and the handbook.
Tune bias/filter size only after inspecting those real Cocos pixels.
