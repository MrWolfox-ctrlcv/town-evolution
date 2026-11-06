# Natural island art and reusable model categories

## Visual reference

The 2026-11-05 revised concept places the player settlement by the coast, with a
central or near-central rocky mountain and scattered surrounding forest and earth
hills. The renderer does not hard-code biome locations: it reads `terrainAt` and
live saved resources. Waterfalls and rivers in the concept are not implemented
resource features.

## Generator versions and compatibility

New islands and the fresh demonstration/title template now use terrain version 3.
Four unequal, rotated and noise-eroded summits form separated upper ridges near
the center. Small seeded elliptical hills are spaced around them, with forest
noise and the original safe coastal starting apron. Stone/soil amounts remain
integer 1–4 business units, and the logical grid and shoreline are unchanged.
The deterministic 101-seed topology sweep requires at least three separated upper
summits, four distinct soil-hill groups, and no soil group larger than 40 cells.

Version 1 and version 2 saves retain their original generators. Reading them does
not upgrade the version, move an object, change resources, or refill depleted
columns. The golden depleted version-2 save predates this change and is roundtrip
tested byte-for-value. A saved old demonstration continues its saved version;
only a newly created/reset demonstration uses version 3. Reset still requires the
existing explicit in-game confirmation and recovery backup.

## Four model categories

`art/exports/manifest.json` declares four categories and assigns every canonical
asset to one. Each glTF node carries the same `extras.category`. Runtime uses the
same recipes and mesh compiler, so exported art cannot drift from the game.

- **自然植物 / natural-plants:** saved broadleaf and pine trees, harvested timber,
  and acorn tree seeds. Tree seeds are goods, not automatically generated trees.
- **自然无机物 / natural-inorganic:** reusable grass, forest-ground, stone, soil,
  and sand cube meshes; stone and soil product piles.
- **建筑 / buildings:** basic house, crate, warehouses, shop, notice board, dock,
  farm beds, fences, paths, and reusable construction modules.
- **作物 / crops:** carrot, wheat, and lettuce growth stages and harvested or
  chilled agricultural products.

The basic house has a timber door, warm window, and chimney. Its wall/roof core is
shared with warehouse/shop upgrades, while the loading entrance and shop canopy
remain visually distinct.

## Unit cubes and actual resource state

`NaturalBlockKit` and `RockBlockKit` are the common source for terrain and exported
unit blocks. One saved stone unit remains inside its original 1×1×1 envelope;
its identity, amount, occupancy, picking bounds, and collection rule are unchanged.
An angular rock now has eight broad side planes, a clipped shoulder, and four
sloping crown facets. Its top is inset by roughly 0.07–0.14 units, so exposed
outlines are no longer rigid square rooftops. A standalone closed rock uses
96 vertices / 48 triangles. The island omits fully enclosed rock units and renders
a flat bedrock cell below cut feet to prevent holes into the sea.

Low exposed ledges have coherent moss patches. Warm lower strata, cooler middle
stone, and pale upper surfaces separate the mountain's levels without adding
another collectible material. Moss is only a surface color on the same rock unit.
All shape and color fields are seeded, spatial, and static. There are no loose
chips, scattered visual-only ore, or frame-dependent vertex changes.

Grass, soil, forest and sand retain their fixed 4×4 relief grids. Their small
interior relief and fixed boundaries are separately tested against crumpled
surfaces and high-contrast speckling. Stone no longer uses that micro-relief as
its main visual treatment. Old saved mountain footprints and resource heights
remain untouched: changing their silhouettes by relocating/deleting columns
would be a save migration, not an art fix.

Bare base cells use the same small relief grid, but their dents stay below the
0.015 building/road plane. Roads and building feet do not float above random
positive bumps. Seeded resource-column heights still provide whole extra/missing
business blocks; visual subdivisions do not grant more collectible resources,
change occupancy, or rewrite any saved terrain quantities.

A saved `naturalResources` entry is the sole source of a raised stone/soil column.
Each remaining amount adds exactly one unit of height. Harvesting lowers that
column; depletion reveals the level base cell. Initial biome elevation is never
used to restore a depleted or legacy-save resource. Every visible full-size tree
comes from a saved harvestable tree. Short ground tufts, sand ledges, and shoreline
foam are decorative, do not resemble ore deposits, and are never resource targets.

The visible top helper is `naturalResourceHeight(amount) = 0.015 + amount`.
Resource picking, target feedback, and collection origins use the same height.
The exact logical cube is the pick/occupancy unit; shallow surface wear is visual.

## Count-readable crop piles

Carrots, wheat, and lettuce each support one through ten harvested goods per
cell. Carrots and individually tied wheat bundles form separated rows of up to
five; lettuce heads form separated rows of up to four. No badge or text is used
inside a ground model to stand in for missing goods. All units touch the ground,
fit inside their legal cell, and have non-overlapping top-view bounds.

The three raw crop limits are 10. Wood and stone remain 6, mud remains 9, and
soil, tree seeds, and chilled produce remain 5. The domain `stackLimitFor` drives
both inventory operations and the exported model variants. Importing an existing
five-good pile preserves its quantity; the higher limit never grants stock.

Ten carrots use 4,520 triangles / 3,300 vertices; ten wheat bundles use 3,760 /
2,580; ten lettuce heads use 2,800 / 5,880. Shared slim grain profiles and curved
leaf surfaces retain all ten goods within the existing 6,000-vertex model budget.

## Rendering and budgets

Terrain and ground detail are two merged vertex-colored meshes sharing one
material. Moving goods, growing crops, and chopping trees do not rebuild terrain.
Only seed, terrain version, or saved resource changes invalidate it. Resource
hit boxes are updated separately, without recreating tree or product nodes.
The immutable biome/land table is cached by seed, terrain version, and land
extensions, so mining does not repeat the ridge, woodland, and shoreline noise.

Tree types and mesh variations are deterministic, not frame-time randomness.
Model assets use cached shared meshes. Geometry tests enforce fewer than 60,000
terrain vertices and 65,000 triangles across a seed sweep; each standalone cube
has at most 162 triangles. This leaves the terrain within 16-bit index limits.
These are geometry budgets, not a claim of measured frame rate on a device.

Legacy terrain version 1 keeps its original playable shoreline and dock check.
Its imported resource state is rendered as saved, without filling it from the
new world generator.

## Verification

The isolated actual-Cocos inspection routes are `?art-review=terrain`,
`?art-review=terrain&terrain-version=2`, and
`?art-review=terrain&terrain-unit=1`. They generate disposable review state and
never read, replace, or reset a player's saves. Drag rotates; the wheel zooms.

Run `npm run art:export` after changing recipes, then `npm run check` and
`npm run demo:domain`. `tests/island-art.test.cjs` checks exact legal-cell coverage,
resource depletion, seeded face variation, finite outward mesh data, and the four
categories. `tests/art.test.cjs` verifies the export buffers against runtime meshes.
Actual Cocos preview and interactive mining require the separate browser checks;
source and mesh tests alone are not visual/device validation.
