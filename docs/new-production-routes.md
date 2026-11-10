# Production routes and save checkpoints

The original production routes reached the schema-9 verification checkpoint. The next development revision uses schema 10 for the approved compost barrel and roasted carrots; see [the new route specification](compost-roast-bridge-design.md). The separately packaged v5 terrain preview remains unchanged. Rice and the bakery production route remain approved.

This work extends the existing Cocos implementation. Domain commands remain deterministic and atomic. UI code dispatches commands; it does not edit inventory or building state directly. Uncommitted work that existed before these changes was retained.

## Tool recipes

The current tool split is explicit and does not infer a recipe from material count alone:

| Material stack                                       | Tool   | Result       |
| ---------------------------------------------------- | ------ | ------------ |
| Wood 1                                               | Hammer | Notice board |
| Wood 2                                               | Hammer | Crate        |
| Wood 1                                               | Saw    | Fence        |
| Wood 2                                               | Saw    | Bench        |
| Wood 3                                               | Saw    | Handcart     |
| Wood 4                                               | Saw    | Boat         |
| Wood 3                                               | Hammer | Wooden pier  |
| Wood 4                                               | Hammer | Basic house  |
| Stone 2                                              | Hammer | Stone mill   |
| Wood 1 + stone 1, explicitly selected separate piles | Hammer | Stone oven   |

`craft-recipes.ts` is the single-stack tool recipe registry. The mixed-material oven uses `mixedCraftPlan` and `craftMixed`: two explicit full-pile snapshots, one unit consumed from each, and an explicit clear result position. A changed snapshot or unavailable footprint rejects the whole operation. No inventory or nearby substitute is consumed. `toolCraftPlan` serves both preview and commit, checks the complete result footprint, and only consumes the selected ground stack. A failure keeps all materials and IDs. The old house discovery ID remains `build-house`, but its current tool is the hammer.

The stone oven uses the user-selected provisional one wood plus one stone. Stone-mill quantities, production durations, yields and new-product trade values are first-play balance. No additional ingredient such as a wheel, axle, yeast or water inventory item was introduced.

## Lifecycles

- Nursery: crate plus one mud produces an in-place nursery. One tree seed is explicitly loaded, then watered. `nurserySeeded` and a snapshot job derive empty, seeded, growing and ready states. Collecting releases a sapling, with full-storage failures retaining the task. A planted sapling carries a complete growth-time snapshot. Older trees without those fields are mature.
- Rice: `rice` is a water-field crop; existing carrots, wheat and lettuce remain dry-field crops. Old dry-crop tasks already present in water fields keep their promised harvest. Emergency crop recovery chooses carrots for dry or mixed farms and rice for water-only farms, still uses the existing one-time flag, and refuses to award a crop when no farm exists.
- Harvest drops: only soil/stone excavation and sickle crop harvest create persistent `looseDrops`. Tree chopping, nursery collection and processing collection keep their previous inventory paths. Drops have stable IDs, bounded stack amounts, historical sources and absolute sixth-tile coordinates. A deterministic local placement plan splits soil nine into five plus four and rejects the entire harvest if there is not enough room. Moving a producer never moves existing drops. New layouts cannot bury drops. Only explicit `pickupDrop` increases town inventory. `moveDrop` moves an exact drop snapshot directly to a legal regular ground stack or merges into another precise drop; `mergeStackIntoDrop` handles the reverse direction. Same-item merges fill only the available stack capacity and leave excess at the original ID and coordinates. Both source and destination snapshots must still match. No ground-to-ground operation passes through or requires town storage.
- Field boxes: an attached crate retains its reserved ID in `Building.collectionBox`, with its own saved capacity (initially 16) and complete crop stock. The player still uses the sickle; mature crops do not auto-harvest. Full boxes retain mature jobs. Explicit withdrawal checks town capacity and keeps all goods in the box on failure. Moving/rotating preserves the box and its independent outside tile. `farmBoxCell` rotates that tile around the unchanged field body, and all placement/import checks reserve it without changing crop coordinates. Box-bearing field merges and repurposing are blocked until a lossless rule is defined.
- Processing: `Building.processingJob` is separate from the retired cold-production `job`. A single batch snapshots `recipeId`, inputs, outputs, duration and deadline. `startProcessing` explicitly consumes inventory inputs. `collectProcessing` requires the matching `jobId`; repeated or stale receipts cannot collect twice. Ready tasks remain in place if storage is full. Attached construction materials are never silently used as fuel.
- Transport: `transportDeliver` takes a complete cargo manifest and an explicit shop or dock destination. All lines are checked before mutation. Shop deliveries sell at current shop prices without changing shop supply; dock deliveries only stage cargo and do not launch or credit money. Warehouses remain entrances to one shared inventory. No automatic routes, hidden local warehouses or simulated transit escrow were added.
- Shipping: new voyages store duration and per-item price snapshots. Their reward must match the stored price calculation. Existing unsnapshotted voyages use fixed legacy terms, independent of later balance changes. Import rejects partial snapshots, inconsistent prices/rewards and invalid bounds.

Initial processing batches are 2 rice to 1 milled rice in 10 seconds, 2 wheat to 1 flour in 10 seconds, and 2 flour plus 1 wood to 2 bread in 15 seconds. Nursery growth is 15 seconds; planted-tree growth is 30 seconds. These are tuning values, not additional user commitments.

## Entity composition boundary

`merge-recipes.ts` defines explicit two-entity base/addition/result pairs. `buildingMergePlan` retains the base ID, position and orientation. The dock now requires three explicitly identified entities: wooden pier, crate and notice board. `dockAssemblyPlan` retains the pier and previews both consumed IDs, choosing the first legal sea-facing orientation. It verifies combined attachments and future placement before either component is consumed. A newly planned dock needs two rows of actual in-bounds water and never gifts a boat.

The user-defined distinction is semantic, not the TypeScript `BuildingKind`: houses, fields, production facilities (including the stone mill and oven) and warehouses are buildings; crates, notice boards, handcarts and boats are objects. Building-plus-building routes use direct `dragMerge`. Building-plus-object routes use `hammerAssembly` with complete explicit entity snapshots. The three-part dock uses the same hammer confirmation and never searches for missing parts. A crate field can retain already growing crops while a box is attached.

Mud is first explicitly attached to a house or crate, either from selected inventory or an exact ground-pile snapshot. A later hammer action consumes one attached mud and transforms the entity in place. An empty crate hit with the hammer now becomes a compost barrel; a crate with attached mud keeps the nursery route. Other attached materials must be reclaimed before the empty-crate conversion. Old direct nursery/residence/field-box commands reject rather than bypass the required hammer step. Production inputs such as nursery seeds and processing grain do not gain a construction-tool requirement.

Boat attachment and whether it gates new-dock departure remain pending. Existing legacy dock cargo, voyages and recovery remain usable. The rejected cargo-dock upgrade was not added.

## Save safety

Runtime states remain schema 10. Exported saves containing a fence, bench or their discovery records use wire schema 11; all other exports stay schema 10. Schemas 8–11 import into the unchanged internal shape. Wire 11 normalizes to the strict schema-10 parsers, without permitting legacy missing-field defaults. The importer accepts schemas 8 and 9, supplies zero only for product keys introduced after each source version, and retains old jobs, IDs, terrain versions, fields, discoveries and commerce. Current stock records must contain every known key; malformed or unknown values reject rather than reset. Current-version map, foundation, fusion and loose-drop records are mandatory. Only schema 8 may omit additive records. Drop IDs and reserved crate IDs join the global uniqueness check before validating nextId. Historical producer references are checked but need not still exist. Emergency crop recovery includes town inventory, ground stacks, loose drops, field boxes, planted crops and other existing stock owners.

The first successful version-8 upgrade preserves the exact original text in a one-time pre-schema-9 archive as well as the normal rotating backup. Upgrades from versions 8 or 9 also preserve pre-schema-10 bytes, including when adopting a valid old backup after the primary is missing or corrupt. Later autosaves do not replace that migration archive. If archival storage fails, the old primary remains unchanged. Reads do not write. Existing revision checks prevent a second page from overwriting a newer save.

Older schema-8/9 builds reject schema 10 through the existing version-error path instead of reading a stale backup or discarding unknown state. Future unsupported versions receive the same no-overwrite handling in the current build. Manual slots and normal/demo profile isolation remain intact.

No interim same-version build may be released before its schema is finalized; a same-version old parser would not protect unknown fields. New processing snapshots, drop sources and field-box stock are deeply copied. Nursery job timing and planted-tree timing are validated as complete bounded groups. Invalid data is never repaired by treating a young tree as mature or an incomplete production job as empty.

## Presentation and file boundaries

Domain integration owns `assets/scripts/domain`. Independent art modules are `NurseryKit`, `RiceGeometry`, `RiceMillKit`, `BakeryKit`, `TransportKit` and `DockPierKit`. A single presentation integration owner updates the shared catalog, factory, tray, drop routing and handbook.

The source concept artwork comes before assets. Composite assets reuse the actual crate, house core, mill, oven and cart parts, rather than separately drawn approximations. Handbook thumbnails use these live game assets. New product PNG icons require their own image reference workflow.

The demo template adds all new building kinds, all new products in inventory and on the ground, rice stages in the large water field, and 49 free storage units after adding two roasted-carrot units. Small water-field merge practice plots remain empty. A separate field showcases the real outside collection box, its local vegetable/wheat stock, three crop stages and two independently draggable vegetable drops on empty cells. Established starter buildings, fields, dock, practice piles and older-product stock are unchanged. A separate compost barrel and roasted-carrot pile are appended for the new template. Existing saved demos are not automatically reset to the new template.

## Verification checkpoint

Focused tests cover schema migration and failures, nursery growth, crop recovery, processing snapshots, explicit tool recipes, merge previews, batch transport and shipping-price snapshots. Focused domain safety suites, `build:domain`, project structure and the architecture check pass at this checkpoint. The independent review found and closed missing new-stock recovery checks and current-version fallback defaults. A full final aggregate pass, final art exports, browser visual review, touch/GPU performance and publication must be checked separately after the remaining interaction decisions are integrated. No GitHub push or deployment is part of this integration step.

## Decorative saw recipes (2026-11-08)

One wood plus saw creates a fence; two wood plus saw creates a bench. These are the confirmed quantities, not new balance proposals. Each occupies one dry, unoccupied tile and uses existing selection, rotation and movement. Tools retain unlimited durability. There are no resident rest bonuses, enclosure systems, prices or new fusion routes. The bench uses canonical readable wooden parts and the shared warm-wood texture; the fence reuses its existing canonical model.

The current building path has no whole-object inventory. Dropping either finished prop over either sidebar safely cancels the move and preserves it. Only the existing product/loose-drop and attached-material recovery paths are supported; neither prop is dismantled into wood.

The wire-11 version marker makes the unchanged preceding client stop at the primary version gate, before unknown-kind recovery could select a stale backup. It also protects discovery-only saves. Older clients cannot read the new entities. A schema-11 manual slot is rejected read-only. Existing older tabs stop on revision conflict. This is not universal two-way compatibility: if schema 11 exists only in a rotating backup while the primary is schema 10, an old client can rotate that backup away. An explicitly confirmed reset or old-slot restore through the current storage adapter archives the prior primary in before-reset; repeated explicit resets may replace that archive under the existing policy. Preserve an external copy before moving between client versions.

The new demo template adds both props without pre-discovering recipes or moving prior practice objects. Saved demos are not repopulated or reset; only a confirmed reset adopts the template. The title uses the authoritative generated snapshot.
