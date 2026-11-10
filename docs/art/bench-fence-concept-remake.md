# Fence and bench: concept-first corrective remake

This is a corrective art remake on 2026-11-08. The previous bench/fence checkpoint had working recipes and tests, but its models preceded its offline review images. Those images were not ImageGen concepts, so that checkpoint did not satisfy the requested concept-first art workflow. Its functional checkpoint remains preserved separately. This document does not retroactively approve that workflow.

## Ordered source evidence

1. The user requested Image-generated designs before building models, and visible inheritance from earlier components (2026-11-05). The existing building-evolution concept was inspected only for the established warm timber style.
2. Two fresh built-in ImageGen calls generated `art/references/bench-fence/fence-imagegen-concept.png` and `bench-imagegen-concept.png`, each 1536×1024. Neither call used a previous bench/fence render or any image-edit input. The exact prompts and actual tool-provided source paths are retained in `imagegen-prompts.json` beside them. The PNGs were copied byte-for-byte, not repainted, resized or recompressed.
3. Both originals were verified readable before any model edit. An independent pre-model snapshot at 19:42:27 UTC found that all existing source files still matched the functional checkpoint; only the new concept evidence files differed. The first successful model edit began at 19:43:49 UTC (`evidence/model-remake-started.utc` in the delivery evidence).
4. The two models were then rebuilt from those concepts as editable canonical component recipes, exported through the existing glTF pipeline, and imported into Blender for actual geometry review. This is authored construction from a concept, not automatic image-to-3D.

Original hashes:

- Fence: `45c3d7aeb7b2849c1bdee43fd7c732d0345d61c36ba5852654ec83e26864fac1`.
- Bench: `1ff3fe7ff11d22e8a106fe409cbd342a9aecf5dad5b321ca2387c3d7bc11bb53`.

## Concept-to-model mapping and explicit interpretations

### Crafted fence

`CraftedFenceKit.ts` implements two chamfered square posts, two inset horizontal rails, wide open gaps and four wooden dowel heads. Posts and rails reuse the established generated wood albedo and canonical lengthwise UV projection. There is no metal, independent cap, plant, gate or additional gameplay.

The generated sheet's annotations conflict: 0.14 + 0.66 + 0.14 equals 0.94, not the shown total 0.96. The implementation uses the consistent overall width 0.96, posts 0.16 square centered at ±0.40, and height 0.80. Rails are 0.68 long, including a hidden 0.02 overlap at each end; the visible gap is 0.64. Body depth is 0.16; wooden dowels extend the complete bounds to 0.17. These are deliberate production dimensions, not a claim that every generated annotation was reliable.

The new canonical ID is `crafted-fence`. Both the live building and handbook map the unchanged domain kind `fence` to this model. `EnvironmentKit.ts` and the old `fence.gltf` remain byte-for-byte unchanged, so legacy set dressing is not unexpectedly replaced.

### Bench

`BenchKit.ts` implements three separated seat slats, two separated backrest slats, four legs with the rear pair extending continuously to the top, two seat-side supports, one front apron, a low horizontal stretcher and four wooden dowels. The silhouette is open, with no armrests, cushions or metal.

Width is 0.94, overall height 0.80, seat top 0.40, and complete depth 0.50. Depth bounds are [-0.245, 0.255], a harmless 0.005 offset inside the same centered 1×1 footprint. Seat gaps are 0.02 and the back gap is 0.04.

The concept's hero/front/parts show a left-right low stretcher, while the SIDE drawing suggests a front-back one. The implementation retains the hero's left-right stretcher and adds two small inset front-back lower side braces for connected construction. They leave the large central opening clear. This is a disclosed interpretation of inconsistent views, not a new recipe component or material cost.

### Shared construction and material

The new `sawnTimber` primitive is a closed flat-shaded chamfered cuboid: 24 vertices, six broad faces, twelve bevel faces and eight corner faces. The original box/log/timber primitives and `MeshCompiler.ts` are unchanged. New parts reuse the same wood helper, generated `warm-wood.png`, UVs, material cache, render partition and picking mesh. Wooden pins use the existing 10-sided log shape.

The exported material uses the existing shared wood image, so its grain is stronger and its orange-brown tone deeper than the softly painted concepts. Cut faces use the same UV wood material rather than a new end-grain texture. No unrelated palette, shader, lighting, exposure, texture or building was changed to imitate concept illustration lighting. Small chamfers are geometric; shadows and highlights in the concept are not baked into the model.

The bench has 19 components and 804 triangles; the crafted fence has 8 components and 320 triangles. Both fit their unchanged 1×1 occupied cells in all four rotations. All surfaces share the existing textured-wood material, with no new texture or extra runtime material introduced.

## Verification and limits

Focused canonical tests cover town/handbook identity, 1×1 bounds, all four factory rotations, actual mesh picking, part counts and gaps, continuous rear legs, complete wood UVs, triangle budgets and finite geometry. New checks lock the original ImageGen hashes, prove the chamfer is closed with outward faces, and reject same-facing coplanar triangle overlaps between parts. Existing compiler equivalence tests cover all 224 assets and 128 material partitions against the prior compiler semantics.

The delivery's `evidence/offline-props-final` contains front three-quarter, back three-quarter, exact side and exact front views of each final glTF, imported and rendered using Blender CPU. They validate exported model shape and material reference. They are not screenshots of the actual Cocos game; Blender color and review-light behavior is not a Cocos rendering claim.

The recipe counts (1 wood + saw for fence, 2 wood + saw for bench), hammer notice-board/crate recipes, 38-entry/10-page handbook, demo/title snapshots, wire11 compatibility, placement, interaction and storage rules are unchanged by this art correction. The evidence bundle records the final source check, domain demo, strict Effect cache checks, matching release build and source/runtime/provenance verification separately. Creator import/export, WebGL appearance, browser gestures, Android and physical-device performance remain unverified. The known Chromium socket boundary was not retried or bypassed for this work.
