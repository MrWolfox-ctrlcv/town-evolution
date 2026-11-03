# Crop modeling reference and implementation

The original ImageGen sheet `wheat-carrot-imagegen-reference.png` remains the visual reference (2026-11-03). It is not shipped as a runtime texture.

Following review of the jagged in-game result, the main agent rebuilt the plant surfaces directly, without delegation. `PlantShapes.ts` defines rounded grain cross-sections, curved ribbons and lobed fern contours. `MeshCompiler.ts` computes continuous normals and shares indexed plant vertices; existing buildings retain their original faceted shading. `CropGeometry.ts` places slender stems, paired rounded kernels, fine awns, arcing blades and branched carrot fronds.

Growth is now seedling → young → ready. `CropGrowth.ts` derives the young phase at 35% of each saved job's duration. Existing maturity deadlines, yields and saves are unchanged. Wheat youth is green and has no grain; carrots expose shoulders only when mature. Lettuce also has a distinct intermediate size. Each cell still grows and can be harvested independently.

After the user's Hay Day comparison, mature wheat was rebuilt as 64 narrow-leaf cereal plants per cell (576 per complete field), with slender two-row ears instead of thick bead clusters. `CerealShapes.ts` supplies shared low-polygon kernels, straw and leaves. Mature wheat: 5,760 triangles, 5,376 indexed vertices, 284,160 shared buffer bytes. Mature carrot remains 2,816 triangles, 2,136 vertices, 119,232 bytes. Crop ceilings are 6,500 wheat / 3,000 carrot / 500 lettuce triangles per cell. Sixteen complete wheat fields have 841,856 triangles and 160 mesh submissions. These are geometry counts, not measured device performance.

`crop-visual.cjs` captures actual seedling, young and mature Cocos views using isolated real UI purchase and planting. With `HARVEST_CHECK=1`, it also tests immature attempts, a sweep over all nine visible crop heads, exact yield/durability, and full-storage preservation. `HARVEST_TOUCH=1` switches the harvest gestures to actual touch events.
