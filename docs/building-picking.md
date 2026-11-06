# Building surface picking

Buildings are selected from their rendered indexed triangles, not a logical-footprint box with a guessed height. This covers palette and generated-wood batches, attached materials, dock pier components, farm beds, and animated crop meshes. Empty roof corners, counter openings, and board/plank gaps stay empty.

`ModelPicking` retains a building's `MeshRenderer` list after the model is assembled. It reads the actual mesh CPU position/index buffers once per shared mesh. `MeshSurface` rejects rays outside those mesh bounds, then returns the nearest front-facing triangle. Bounds never produce a successful hit on their own. Hidden/disabled renderers do not participate.

Every query uses each component's current world transform, including all four building rotations, nonuniform construction scaling, and crop animation. The inverse-transformed direction is deliberately not normalized, so distances remain comparable across models. Building selection and building occlusion of ground piles, trees, natural resources and crop harvesting share this path. Lifted/excluded buildings do not intercept a drag. Mouse-derived and native touch events retain their existing shared ray routing; no separate enlarged touch hit box is introduced.

Placement outlines, occupied cells, merging rules, production and save serialization are unchanged. Crop-cell harvest aiming and ground-resource targeting retain their existing behavior; only buildings' selection and occlusion surfaces change.

## Verification

- `tests/building-picking.test.cjs`: empty footprint corners, sloped-roof air, oblique front/back gap views, solid walls/roof/awning/counter/chimney, board leg/plank gaps, triangle depth order/backface culling, dry/wet small/large farm beds, split material batches, resources in front/behind buildings, hidden drag sources and crop occlusion.
- `tests/crafting-pointer-chain.test.cjs`: existing mouse-derived/native touch command chains still run the real `TownView` and triangle kernel. Scene/rendering collaborators remain isolated, so this is not a browser gesture test.
- `scripts/preview/picking-smoke.cjs`: run after `npm run build:domain` and a real engine preview build, using the same `COCOS_ENGINE`, `PREVIEW_TOOLS` (with jsdom) and `PREVIEW_OUT` conventions as `tween-smoke.cjs`. It uses the compiled official Cocos engine, actual mesh CPU buffers, components and node matrices, without GPU initialization. Checks cover four rotations with nonuniform scaling, current transforms, hidden/disabled geometry, attachments and buffer-cache reuse. The report is `build/picking-smoke.json`.

The CPU smoke passed locally on 2026-11-05 (16 rotated surface checks, 10,000 cached queries in approximately 174 ms). Canvas warnings are retained in its output because jsdom has no WebGL canvas implementation. This is not rendered-pixel validation, a Creator import/export, a real mouse/touch browser test, or physical-device performance acceptance. Browser checks still need a graphics-capable environment: click the visible building edges and empty corners/gaps at several zoom levels and angles, rotate through all four orientations, test a nearer pile and a pile behind a wall, then repeat using touch and long-press drag/cancel.
