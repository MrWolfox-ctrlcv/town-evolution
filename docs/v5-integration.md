# Terrain v5 gradual integration

Status: an explicit, isolated preview, not the default town or a device-qualified release.
New ordinary games and the existing demonstration retain terrain v4. Existing v1–v4 saves are not migrated. The title's **v5 新岛预览** action uses its own `town-evolution.v5-preview.<generator-revision>.` storage prefix, including automatic backups and manual slots. Earlier internal preview bytes remain untouched in their earlier namespace. A reset still requires the normal confirmation and archives the previous raw data. Corrupt preview saves are preserved.

## Authoritative world and saves

- `createGame(now, seed, 5)` selects the new pure generator. `getV5World(seed)` owns the frozen continuous recipe, true initial integer stock, and legal candidate coordinates; only new-world initialization allocates `nX_Z` resources and `tN` trees.
- The starter overlay creates two small asymmetric low resource pockets and 18 real trees. It does not change the mainland outside the 36×36 starter corner. Tests verify unobstructed dry routes to wood, soil and stone in six seeds, and safe candidates in 100 additional deterministic seeds.
- The reference distinguishes continuous uncut height from saved remaining quantity. A mined column has a horizontal cap and axis-aligned vertical cut faces. Loading, camera movement, chunk recreation and returning to the island do not regenerate missing/depleted entities.
- Schema9 stays schema9. Terrain5 requires the exact `terrainRevision`; a missing, older or future revision is rejected before world data is interpreted, preserving the raw save rather than regenerating it. Terrain5 imports validate coordinate IDs, material kind and each cell's exact initial stock with a separate 64-layer guard. Legacy limits and validation paths remain unchanged.
- Independent pre-integration fixtures contain full initial/depleted v1–v4 saves for five seeds each. Their grid, tree, resource and save digests are checked after generating new v5 worlds too, detecting accidental cache contamination.

## Water and expansion

`v5-hydrology` supplies continuous bay/lake/river geometry and whole-cell dry/wet certificates. Its new natural rock bight has a separate piecewise-linear solid/bed certificate. The domain and actual triangles share the same quarter-unit shore segments; the original soft-distance field is retained unchanged as base evidence, never relabeled as a cliff-depth proof. The natural feature changes no freshwater fields and creates no owned objects. Reserved bank cells are not ordinary building or planting land. A river connected to the ocean is still protected freshwater.

`v5-marine` validates both saved and live extensions. Each new cell must be within bounds, adjacent to usable land, marine-influenced, and outside the conservative four-unit freshwater/river-mouth corridor. A flood fill checks remaining one-cell certified deep sea and two-cell-wide boat routes against the same outer-ocean reference. A wall that would seal the actual bay is rejected atomically without spending the mud stack.

The existing exact-nine-mud cost and source-stack command remain unchanged. Success produces ordinary resource-free plain. Rendering replaces the old local bed top, uses a flat 0.015 top and real vertical soil walls; it never spawns natural resources or paints lake water green.

## Rendering and interaction

The new branch uses spatial resource/coast chunks and real saved-tree batches. Canonical Float32 positions and triangle owner IDs are shared by rendering, resource picking and drop support. Changed resource neighborhoods retain a group barrier; stale work cannot publish a partial new geometry/picker snapshot. Cocos uploads are staged invisibly in bounded source-buffer pieces before publication.

Tree near/far geometry remains derived from the real saved tree records. Camera changes load and release spatial batches; exact triangle picking identifies the original tree. Chopping is persistent and does not become a cosmetic tree hiding operation. See `v5-tree-streaming.md`.

Coast mesh generation has a cooperative `begin/advance` interface; synchronous proof/export helpers are not used in the per-frame path. These are actual Cocos-frame cooperative jobs, **not** an implemented browser Worker. Byte counts describe submitted source buffers, not GPU memory or driver latency. Pure-world initialization and other non-preemptible CPU work still require target-device measurement.

## Port boundary

No preplanned lab harbor is added as a building. No excavation/support price has been assigned or silently included in the existing dock recipe. The unchanged three-component dock assembly still requires actual dry foundation, two certified marine outlet rows and a conservative clear side berth/turning box. Its marine connection test excludes the four pier cells rather than treating the bridge and posts as a boat route. Existing docks are rechecked before every new fill and on v5 import; a side-berth fill attack is rejected without spending materials.

The new natural rock bight now provides a valid site with zero reclamation in all six integration seeds. Tests perform the actual existing explicit three-component assembly there, consuming only the selected components under the unchanged hammer policy, and round-trip the resulting save. No boat, inventory, coins or natural resources are granted. The thirteen-cell/117-mud reclamation fixture remains a separate historical route, not a prerequisite or accepted first-port cost. The current boatAttached field is parsed and included in a render signature, but no automatic attached-boat pose or physical sailing route is implemented; offline boat motion checks are proposed geometry contracts only. For v5 only, the original four pier posts now extend to -1.71, below the proven -1.70 global bed lower bound. Both existing pier styles retain their upper geometry and reuse fixed shared mesh/material recipes. The submerged continuation is excluded from model picking, while the visible platform and original upper posts remain selectable. This is a model correction, not extra buildings or invented economy.

## Evidence and remaining gates

CPU tests cover six-seed lifecycle/mining, exact old-save compatibility, real soil-to-mud-to-fill conservation, freshwater protection, bay connectivity, coast winding/seams, resource/picker transactions, tree identity and isolated preview storage. Run `npm run check` and `npm run demo:domain` against the final frozen source; focused passes are not substitutes for the aggregate.

Source-built offline images are in the sibling terrain-v5-lab production-integration-preview directory, with a source-hash manifest. They show high ridges, bare earth hills, real forests and connected lake/river/ocean. They also reveal remaining regular coastline shapes, pointed bay ends and resource-foot scalloping. These images use Blender CPU and approximate lighting, not Cocos screenshots.

Still required: final natural-shore visual review, full Cocos input/render/lifecycle validation, browser/GPU memory and timing, target-phone frame budgets and final terrain art review. The standalone real Cocos-engine preview build does not replace Creator scene import or device validation. No default-game switch, old-save rewrite, publication or deployment is implied by this preview.
