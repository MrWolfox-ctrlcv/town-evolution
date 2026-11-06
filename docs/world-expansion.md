# Large island and cubic excavation

New games and the showcase island use terrain version 4 on a 192×192 grid.
Version 1, 2, and 3 worlds keep their 40×40 bounds, coast, buildings, item
identities, inventory, trees, and depleted resources. Import never resets or
upgrades a saved world. The additive save schema remains version 8.

Five checked seeds have about 27,600 actual land cells, 29.5–31.9 times their
version-3 land area, exceeding the requested twentyfold expansion. This is
actual connected, usable land, not only a larger empty coordinate box. The
starter coordinates are unchanged and join the mainland through the original
coastal peninsula. `worldSize(terrainVersion)` is the source of versioned bounds.

New starter-region mountains are twice their earlier generated heights, up to
eight resource layers. Four mainland summits reach approximately fifteen layers;
the generation/validation ceiling is sixteen. Scattered soil hills remain lower.
Resource density is deliberately sparse: roughly 1,300–1,400 columns and 192
real saved trees. Starter woodland receives priority so early wood remains
accessible. New demo trees use the same generation policy.

## Excavation

The natural surface comes exclusively from the immutable seed reference. Its
interpolation passes through original cell-center heights, so sharp summits do
not get averaged below their first mining plane. A
mining command still removes one stone from one saved resource identity. Soil
collection still removes one complete mound for nine soil. Rendering does not
change these rules or write save data.

For a partly mined column, its existing triangles are clipped at the remaining
integer level. The exposed top is flat, with a separate upward normal. Vertical
walls are emitted on exact grid boundaries where the adjacent column is lower
or depleted. Wall triangles belong to the surviving resource, so both vertical
and oblique picking use the same geometry as rendering. No unmined neighbor
height changes. A fully depleted cell has neither a resource patch nor a hit
identity.

Only a changed column and its four direct neighbors need geometry regeneration.
Untouched cells share 25 top vertices. The checked v4 resource mesh has fewer
than 45,000 vertices and 55,000 triangles; these are deterministic geometry
budgets, not GPU frame-rate claims. Its merged upload and picking snapshot are
still rebuilt together after a change. Coast/water and camera budgets are
separate. Repeated excavation duplicates hard-edge vertices and can exceed
65,535 vertices even when a pristine island stays below that threshold. Cocos
3.8.8's static `createMesh` always writes 16-bit indices. Static island meshes
are therefore partitioned into batches of at most 65,535 vertices; every
triangle, normal, color and UV remains identical to the unified picking snapshot.
The additional renderers inherit the same sun/shadow settings and are destroyed
when their batch is replaced. `mesh-chunks.test.cjs` covers the exact boundary,
legal heavily excavated saves, triangle equivalence and replacement/disposal.
The official EmptyDevice smoke separately reads back actual Cocos mesh CPU index
and vertex buffers for a heavily excavated v4 island and its large water mesh.
Neither check is a rendered frame or a GPU performance claim.

## Verification

- `terrain-v4.test.cjs`: actual land-area ratio, full connectivity, border water,
  sparse resources, tall peaks, legacy round trips, untrusted bounds, tall-mountain
  mining, geometry budgets, and five-cell update scope.
- `mined-cut-faces.test.cjs`: planar cut tops, hard normals, exact unit-boundary
  walls, unchanged neighboring heights, picking all four exposed walls, and every multi-layer stone column across
  fifteen old/new seed-version combinations intersecting its first cut.
- Existing v2/v3 fixture tests remain explicit historical-version checks.

Type checks, mesh tests, and save tests do not demonstrate the final Cocos WebGL
appearance. Browser/device visual acceptance, interactive mining and reload,
large-island pan/zoom, shadows, shoreline waves, and mobile timing must be
verified separately against the final build.

The importer rejects text longer than 4,000,000 JavaScript characters before
parsing and validates every list against that version's grid area. Larger input
or invalid coordinates never trigger a reset or overwrite. Building overlap
validation uses a single occupancy pass; reclamation connectivity uses one flood
fill, preserving input order without repeated scans of an untrusted pending
list. Dedicated boundary tests cover the exact text limit, one character over,
overlong arrays, and a reversed array of more than 5,000 reclamation cells.
