# Seeded tree crowns

Resource trees reuse the existing faceted broadleaf crown and pine-tier shapes.
There are 16 broadleaf and 8 pine canopy recipes. Each changes leaf-cluster
position, axis lengths, tilt and restrained green/yellow-green color. Per-tree
size and yaw add variation without creating a mesh or material for each tree.
No new raster texture or hand-drawn image has been added.

`resourceTreeVisual(mapSeed, x, z)` is the common descriptor for standing trees
and the committed chopping animation. It retains the previous species hash,
then uses separate deterministic hash channels for the variant, scale and yaw.
Reordering save entries, harvesting another tree, refreshing the view and
reopening a save cannot reroll surviving trees. There is no frame-time random
number or new saved field. Old trees receive the varied presentation but their
identity, position, amount, species and existing save data stay unchanged.

The axe target now follows the current rendered canopy and trunk triangles,
including each variant's scale and yaw. Mesh bounds reject misses cheaply but
never count as a hit: the air beside a trunk or between canopy lobes cannot steal
a visible pile or chop a tree. All canopy meshes still fit within the historic
radius/height envelope. Ground positions and resource/placement rules are unchanged.

Trees and ground piles share the cached `ModelPicking` surface path with buildings.
Repeated pointer queries reuse the shared CPU mesh data and read current transforms.
Changing one pile or chopping one tree retains the other models and their pickers.
Piles use their actual quantity-specific meshes, including their air gaps; a saw
must touch a visible pile rather than falling back to its underlying map cell.
Real finger events also have [limited screen-space tolerance](../touch-targeting.md)
that samples nearby real triangles; mouse input remains exact.

Each rendered tree still uses one palette mesh and one draw call. A broadleaf
tree has 1,104 vertices / 400 triangles; a pine has 132 / 52. At most 24 varied
meshes are cached per renderer, with a shared material. No per-leaf nodes,
per-tree materials, frame-loop mesh generation or extra leaf geometry is used.
The 24 glTF files and manifest are generated through the same canonical compiler
as the runtime, bringing the catalog to 134 assets.

`tests/tree-variation.test.cjs` covers deterministic identity and shape differences,
legacy save roundtrips, chopping and surviving trees, all vertices across 4,800
seed/coordinate poses inside the original size envelope, repeated render sync,
visible tree surfaces and the chopping pose lifecycle. `resource-picking.test.cjs`
also checks all 24 variants at different yaws/nonuniform scales, every pile quantity,
real occlusion, hidden/lifted models, shared caches and incremental changes.
`crafting-pointer-chain.test.cjs` covers the original tree-air/wood-pile ray through
tray, selection, drag candidate, saw and save routing, plus axe/saw air misses.
These CPU presentation tests are not real Cocos rendering or touch-device tests.

The optional local `build/tree-review/tree-variants.png` was rendered from the
actual compiled meshes with Blender on the CPU and visually reviewed. It verifies
static shape separation only, not Cocos shader output, rendered animation,
physical-device performance or real pointer picking. Those checks still require
a graphics-capable Cocos preview.
