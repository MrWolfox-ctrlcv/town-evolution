# Versioned island camera

Gameplay framing reads `state.terrainVersion`, not the latest `CONFIG.gridSize`.
Versions 1–3 retain the 40-cell pan bounds, original camera direction/framing,
closest zoom, button steps and starter focus at (6, 6). Version 4 has 192-cell
bounds but starts at the same physical scale on the populated coast. Camera
state is presentation-only; loading a save never migrates or rewrites its map.

Playable demo sessions land on a close village view, using the first farm and
nearby crop piles/dock as a read-only focus. A distant dock in an older demo is
not moved or used to pull the camera across the island. The initial view leaves
side-tray clearance for the new template's ground crops and dock. Settings →
Town actions → View full island explicitly uses the existing overview camera.
It closes the action shelf and cancels captured gestures, without a game command
or save write. Layout, returning from settings, and resume preserve the current
camera; only a new session or an explicitly confirmed reset chooses a landing view.

The v4 minimum zoom scales with world size, so the initial 0.0625 zoom is valid.
The first wheel or two-finger movement no longer clamps it to 0.15. Wheel and
pinch remain anchored to the ground under the pointer/midpoint. Large-world
buttons use proportional steps to work both near a building and at full-island
scale. The existing long-press drag, cancellation and single-drop route stays
in place. Resetting an old town into a new v4 town refreshes the camera bounds.

Orthographic field of view alone does not move the camera: a close camera can
leave part of a large island behind its near plane. `cameraDepth` retreats the
camera for every terrain version according to the visible height, with room for sixteen terrain layers
and foliage. It updates the far plane together with the position. Bounds also
include the ocean from -size to 2×size and the permitted pan margins. Close-up
views keep a short depth range rather than always using the full-island range.
The active world camera also supplies this depth to the shared sun shadow map;
hidden title and isolated handbook cameras do not override the gameplay range.
The 40-cell worlds also use this depth calculation: their original fixed retreat
could put visible far-coast land behind the near plane after panning an overview
to the map edge. Moving along the same viewing direction preserves the screen
projection, ground anchors, zoom, pan bounds and every saved coordinate.

The title still renders a frozen copy of the real demo town. It uses that
copy's terrain version for center, framing and depth. The small living orbit
stays inside the tested framing allowance; no image replaces the 3D scene.

## Validation boundary

Map input reconciles only contacts whose START it observed, using Cocos'
current `input.getAllTouches()` manager on a new START. A hidden UI target can
miss END/CANCEL; its expired contact must not permanently block later map
gestures. Mouse-derived event snapshots are not authoritative because they
contain only mouse ID 0 even while another real finger remains down. Empty,
duplicate-ID or current-ID-missing snapshots are ignored conservatively.

A missed map release is cancellation, never a synthetic tap or drop. Still-held
partners remain blocked, including duplicate START delivery. Touch object
identity distinguishes a new contact reusing an old ID from a duplicate event.
Focus/reset/disposal clear the observed contacts and their identities; old
manager entries are never added back unless their new START is observed.

`map-contact-lifecycle.test.cjs` runs the exact Cocos 3.8.8 pointer dispatch loop
with production map, handbook, tray, radial and button listeners, transformed
UI hit tests, and real GameSession/save storage. It covers hidden targets,
release orders, cancellation, ID reuse, repeated events, mixed controls,
mouse/native touch snapshot differences, screen sizes and DPR. The vendored
dispatcher includes its engine revision, source checksum and MIT notice.

`tests/map-camera.test.cjs` checks old/new bounds, zoom continuity, wheel/pinch/
pan anchoring, drag completion, title orbit, tall terrain and ocean depth bounds
at portrait/landscape aspects and pan limits. Its input tests execute the real
MapCamera handlers with an analytic orthographic test double, not the engine.
The official Cocos type check validates API usage. Neither is a GPU visual,
Creator import, phone performance, or physical-device interaction test.

Wheel zoom accepts only finite, nonzero vertical deltas. Horizontal-only and
zero/invalid wheel events remain consumed but do not move the camera or cancel
a held pan/building drag. A valid vertical wheel still cancels the old gesture
before applying the anchored zoom. The camera tests cover both cases through
the production listener with the analytic camera collaborator described above.
