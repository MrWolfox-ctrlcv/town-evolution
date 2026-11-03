# Seeded natural island and maintained demo

The world uses a 24×24 coordinate frame. Legal land comes from the domain's
isLandCell(x, z, mapSeed): a rounded, multi-frequency coastline with coves and a
safe starter-town lobe. The saved seed changes actual playable land, not just
its colors. There is no fixed L-shaped bay or old-coordinate preservation rule.
Old test-save reset belongs to the application storage layer, not rendering.

IslandView passes the current persisted seed in a closure to IslandTerrain.
This is essential: passing isLandCell without the seed would render default-seed
land while game actions use another island. Tests compare every grass tile with
the matching domain mask in both directions across multiple seeds, including the
maintained demonstration seed 42173. A broader seed sweep checks finite geometry,
size budgets, nondegenerate triangles and upward winding.

The generator traces that exact legal boundary and builds irregular sand and
shallow-water bands. Broad meadow colors interpolate across vertices, without
permanent graph-paper grid lines. Legal building cells stay flat. A thin grass
fringe softens the edge; sand and water are scenery, not extra building cells.
Dock-facing sand stays narrow so the pier reaches water. Domain dock validity
and model placement use the same saved seed.

The complete sea/grass/coast/foam surface uses one mesh and one vertex-color
material. IslandView rebuilds only when mapSeed changes and releases old meshes.
The terrain budget test caps geometry below 2,000 triangles and 6,000 vertices
across sampled natural islands. No decorative BorderTree nodes remain: visible
trees are harvestable domain resources.

createDemoGame is the source-controlled playable fixture for seed 42173. Its
buildings, crop stages, resources, cargo and tools are real game state. Update the
fixture and its tests when implemented features change. Future recipes and
placeholder tools must not be portrayed as working functionality.

Blender previews import the actual terrain geometry and glTF assets. They are
asset/placement evidence, not captured browser frames or touch-interaction tests.
The seed-42173 preview uses the maintained demo fixture, without extra invented
shoreline test docks.
