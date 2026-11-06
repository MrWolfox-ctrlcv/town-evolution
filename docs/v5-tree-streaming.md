# Terrain v5 tree streaming

This experimental path runs only when `terrainVersion === 5`. New towns still
use the retained default, and terrain v1–v4 keep their original tree renderer,
mesh transforms, picking and chop effects. No saved tree IDs or gameplay state
are generated, removed or changed by loading a view.

- `MapCamera.visibleBounds` derives bounds from the actual viewport rays. Trees
  include the 0–4-unit height envelope; terrain uses 0–64. A two-unit chunk margin
  covers the authored wide crowns. Overview requests all visible spatial chunks,
  never a fixed four-chunk subset.
- `TreeStreaming` groups actual saved trees into 16-unit chunks. It stages at most
  24 tree geometries with a two-millisecond cooperative CPU target per frame.
  One tree build cannot be preempted. At most one completed chunk publishes per
  frame; the seed, quantity-free identity, position and growth stage are stable.
- Near trees reuse the approved generator-v2 lab's deterministic wider scale and
  offset. Far trees retain trunk plus selected canonical crown/tier parts at the
  same real positions, using the existing low-facet gem primitive for distant broad crowns. The low-detail mesh has its own exact triangle picker.
- `V5TreeView` reuses `V5ChunkMeshes` to upload hidden parts of at most 64 KiB,
  with a 256 KiB/two-millisecond submission budget. CPU accounting does not bound
  driver allocation or GPU latency. Render visibility and exact-ID picking publish
  only after the complete chunk is ready.
- A tree chunk waits until its actual trunk anchors have committed rendered ground
  through `IslandView.isGroundReady`, so it cannot appear floating above an
  unpublished coastline. The preview HUD identifies unfinished detail loading.
- Camera changes cancel hidden uploads and recycle offscreen meshes. Chopping
  removes the affected visible chunk and its picks immediately, then queues its
  survivors. Returning to an area never resurrects a removed ID. Near/far changes
  keep valid old geometry visible until its replacement is ready.
- `TownController.tick` advances terrain and trees on actual Cocos frames.
  `TownView` clears shared pick caches on either publication and syncs resource
  picking/support only after the terrain's committed surface changes. Disposing
  a controller releases both published and staged nodes/meshes.

`tests/v5-tree-streaming.test.cjs` checks full-island identity coverage, staged
budgets, camera recycling, real chopping, stale-work cancellation, true triangle
hits, lab-transform goldens, staged-upload atomicity and viewport bounds. These
are CPU/adapter checks, not Cocos pixel, browser, phone or GPU performance evidence.
