# Warm town visual pass

This pass changes actual game geometry and color shading. Warehouse-family roofs
now have raised overlapping tile rows and timber gable edges; walls have window
mullions and separate foundation blocks. Shop variants reuse the same core.
The largest current export is 796 triangles, still below the 1,500-asset budget.

MeshCompiler keeps editable palette colors in sRGB because the official Cocos
builtin-unlit effect explicitly converts vertex colors with SRGBToLinear.
Directional value contrast is baked into vertex colors, so the mobile renderer
does not need real-time lights or shadow maps. glTF COLOR_0 values, however, are
linear, so the export pipeline now converts them. Previous Blender exports were
washed out because they incorrectly treated sRGB values as linear. Correcting
those previews alone would not improve the running game; the new roof geometry,
shading, paths, contact shadows and meadow tufts do improve runtime visuals.

SceneGroundArt generates a cosmetic connected path network between accessible
building entrances using legal-land BFS and avoiding occupied cells. These are
not player-built road objects, do not consume items and do not block placement.
Ground contact shading is an inexpensive baked-color approximation, not dynamic
cast shadows. Short grass is noninteractive decoration and does not resemble a
harvestable tree. All details are merged into the terrain mesh and material.

IslandView rebuilds only when the seed or building/tree layout changes. Crop
readiness and tool counts do not rebuild terrain. The maintained demo uses 1,905
ground triangles including these details. Geometry checks cover reproducibility,
legal-land placement, occupied-cell avoidance and no mutation of game state.

The supplied full-island and close-up images are Blender renders of the actual
exported models and generated terrain, with correct linear color interpretation.
They are visual QA, not browser screenshots. They omit UI, ground-stack visuals
and the procedural dock pier extension. The approved concept remains an art
direction target, not a claim that a small MVP is a finished commercial game.
