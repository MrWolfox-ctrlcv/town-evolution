# Meadow kit · MVP art specification

Fence and bench concept-first corrective remake: [source sequence, model mapping and verification limits](bench-fence-concept-remake.md).

Current building implementation and verification limits: [shared building evolution kit](building-inheritance.md). The generated concept and generated wood texture are inputs; the reusable 3D geometry is authored, not automatically extracted from an image.

A small, warm low-poly kit based on the generated concept sheet: cream plaster,
terracotta roofs, the original narrow wooden doors, teal machinery, ochre timber, soft green crops. These
are actual indexed 3D meshes, not image planes. The concept is an art direction
reference, not a promise to reproduce every roof tile or painted shadow.

## Files and reproducibility

- `assets/scripts/art/`: canonical editable TypeScript recipes, palette and mesh compiler.
- `art/exports/`: 224 glTF 2.0 files with embedded buffers and a shared `textures/warm-wood.png` albedo.
- `art/exports/manifest.json`: per-model bounds, footprint, parts, triangle and byte counts.
- `npm run art:export`: compile recipes and regenerate all glTF files.
- `npm run check`: also verifies exports exactly match their source.
- `AssetRenderer`: Cocos consumes the same recipes/compiler directly. The export files
  are reusable interchange assets, **not** an untested Cocos runtime loader.

## Scale, placement and evolution

Y is up; +Z is the front. One world unit is one gameplay grid cell. Placement
origins are at the center of a footprint, ground Y=0. Warehouses and farms occupy
2×2 cells; the cooler occupies 1×1. Expanded and cold warehouses retain the same
2×2 occupied cells; no economic rules or saves change with this artwork.

All warehouse variants retain the same walls, roof, loading deck and door size.
The slightly left-offset core leaves a right-side attachment bay. Named sockets:
`side = [0.61, 0, -0.08]`, `front = [-0.25, 0, 0.74]`. The base warehouse adds a crate-built lean-to and loading deck; expanded adds another crate and reinforcement. Cold retains the wooden door and adds its cooler. This is visual
composition, not a new unconstrained building-combination mechanic.

Module exports preserve assembly coordinates, not automatically centered pivots.
Attach `module-shell`, `module-roof`, `module-door`, `module-deck` and `module-wing`
at the same origin. `module-cooling` is centered for the side socket transform.
Do not place all modules alongside the assembled building: that duplicates faces.

## Inventory

| Family    | Export IDs                                                                                   | Use                                                 |
| --------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Warehouse | `warehouse-base`, `warehouse-expanded`, `warehouse-cold`                                     | Three existing gameplay types                       |
| Machinery | `cooler`                                                                                     | Existing standalone combination ingredient          |
| Crop beds | `farm-empty`, `farm-seedling`, `farm-ready`                                                  | No job / growing / ready to collect                 |
| Props     | `crate`, `fence`, `tree`, `rock`, `path`                                                     | Reusable set dressing; tree and rock used on island |
| Modules   | `module-shell`, `module-roof`, `module-door`, `module-deck`, `module-wing`, `module-cooling` | Editable evolution kit                              |

Farm appearance is derived from job readiness. It never grants harvests, advances
jobs or modifies saved state. Crates, homes, residences, shops, and notice boards now also support the documented construction recipes. Animals and character animation remain outside this kit.

## Rendering and budget

Flat shaded geometry uses vertex colors and baked directional value variation.
Reusable timber parts additionally use one image-generated UV albedo. Each asset
has one palette batch and, where needed, one textured-wood batch, sharing materials
and cached geometry. Transparent surfaces and realtime shadows are absent. glTF
materials use nonmetallic PBR with roughness 1 and vertex-color albedo; retain the shared texture folder when copying exports.

Automated ceilings are 3,000 triangles for buildings, 6,000 for product piles,
6,500 for crop-cell models, and 1,500 for remaining assets; all remain below 6,000
vertices. Current exact counts are in the generated manifest. Tests cover bounds,
indices, UVs, image references, finite values, nondegenerate triangles, unit
normals, palette range, exact shared component geometry, and crop stages.
Individual component solids overlap rather than being boolean-unioned, so these
are game assets, not watertight 3D-printing files.

Key base colors (full palette in `AssetTypes.ts`): plaster `#F5E2BE`, roof
`#D66C42`, dark roof `#A84D31`, wood `#B77E43`, teal `#468B83`, light teal
`#89B9AA`, soil `#956443`, foliage `#8DA644`, path `#E2C397`.

## Review gate

Source checks are not visual QA. Verify the real Cocos Web preview on desktop and
mobile aspect ratios: readable doors/roofs, no invisible backfaces, stable crop
stage changes, side-wing/cooler silhouette, placement preview and selection, and
unchanged mouse/touch gameplay. Android packaging and physical-device profiling
remain separate from this asset delivery.

Independent export validation: Khronos `gltf-validator` 2.0.0-dev.3.10 checked the original 18
exports with zero errors, warnings, infos or hints. This validates the interchange
format, not gameplay rendering.

## Trade and logistics extension

Three additional models follow the second concept reference while retaining the
same grid and canonical mesh compiler, with the shared generated wood material:

| Model         | Footprint | Distinct silhouette                                                              |
| ------------- | --------- | -------------------------------------------------------------------------------- |
| `shop`        | 2×2       | Original house and door, side counter, cream/orange canopy, reused board sign    |
| `order-board` | 1×1       | Two wooden planks, exposed posts and four iron pins                              |
| `dock`        | 2×2       | Low plank quay, four rope-banded bollards, rear dispatch kiosk and stacked cargo |

The dock is an on-grid cargo staging facility, not a water simulation. Its
assembled geometry stays inside the existing occupancy footprint; no boat,
shoreline collision or terrain editing is introduced. Cargo stacks are visual
set dressing, not a live item-count display. `shop` shares the warehouse core;
no residential or expanded-shop gameplay is implied. Domain `orderBoard` maps to
the export ID `order-board`; all other commerce IDs match their export names.

Shop counter socket is `[0.6, 0.55, -0.08]`; dock cargo socket is
`[0.42, 0.29, 0]`, dispatch socket `[-0.37, 0.29, -0.45]`. The historical versions of these three exports
were independently checked with Khronos glTF Validator in addition to the shared
geometry/bounds/buffer tests. Real Cocos screenshots remain a separate review gate.

## Independent nine-cell runtime farms

`FarmCellKit.ts` adds `farm-cell-bed`, `crop-cell-seedling` and `crop-cell-ready`.
The runtime uses one shared bed mesh plus zero to nine independently placed crop
meshes. It does not use the legacy whole-farm stage models to represent cell state.
Cell index is row × 3 + column, with centers at `(column + 0.5) × 2/3 - 1`
and `(row + 0.5) × 2/3 - 1`. The soil top and input hit plane are both Y=0.17.
The FarmGrid parent applies building rotation; each cell keeps its own stage.

Recipes, indexed geometry, per-cell stage changes and input-center alignment pass
local tests. The three new glTF meshes were imported and assembled in Blender;
a mixed-stage bed and the same bed after harvesting one cell were rendered and
visually inspected. This verifies actual mesh composition, not Cocos browser input.
A full farm can use ten mesh primitives, sharing three cached meshes and one material.

Seeded tree-canopy variations and their compatibility/performance constraints are documented in [tree variations](tree-variation.md).
