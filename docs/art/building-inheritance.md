# Shared building evolution kit

The reference is `art/references/building-evolution-concept.png`. It was produced with image generation before this implementation. The 3D meshes are authored from reusable components to follow that reference; they are **not** an automatic image-to-3D conversion.

## Visible inheritance

- `house`, `shop`, and all warehouse variants share the established 53-part house: original cream walls, terracotta tiles, narrow offset door, front window, stone step, and chimney. The original dimensions and palette are protected by a regression fixture. The shop removes only the now-covered side window.
- `order-board` is a two-plank wooden board with two posts and four iron pins. The shop mounts that same assembly, rotated 90 degrees and uniformly scaled, above its side counter.
- `crate` is an open, four-sided slatted box with posts, a floor, and pins. Identical crate components appear on the warehouse loading deck; their plank/post language also forms its lean-to, braces, deck, and ramp. Expansion adds another crate and a rail without replacing the house core.
- The shop keeps the original front entrance and adds an orange/cream side awning, the reused sign, two small produce crates, and a counter.
- Occupied footprints and all four gameplay rotations are unchanged. Doors, backs, sides, awnings, and loading structures have real geometry, not camera-facing cutouts.

## Generated material and exports

`assets/resources/buildings/warm-wood.png` is a newly image-generated 1254×1254 RGB albedo, used via UVs on the reusable timber parts. It is an actual runtime material, not merely a concept image. It contains no text or perspective. Strict seamlessness was not measured; UVs stay inside the image and the exporter clamps edges.

- PNG SHA-256: `c18ccb33d7de135616afa50ca7e6baef598fb98ce2b2b558f30b40e7ea8e46bb`
- Concept SHA-256: `5db7425bc9cd4992ff60202e3f92fdf5a09209603131a739b74dbc13176d847e`

The canonical compiler creates positions, normals, vertex colors, UVs, and separate texture indices. Cocos batches palette parts and wood parts separately, sharing one texture/material. The glTF exporter uses the same geometry and UVs with at most two material primitives. Its buffers remain embedded; keep `art/exports/textures/warm-wood.png` alongside the glTF files. `art:check` checks the texture bytes as well as the canonical exports.

The textured shader is enabled when the shared Material is created; a real 1×1 warm-brown texture is bound before any request. A successful request replaces only mainTexture. It never calls Material.recompileShaders, which is unsupported on a shared Material in Cocos 3.8.8. Failed requests keep brown wood instead of the previous erroneous pale fallback. A renderer requests the wood resource only when it creates a textured component. All active renderers share one reference-counted material and GPU texture, rather than uploading the same 1254×1254 image per factory. The last renderer lease releases the image, texture and material; stale asynchronous callbacks do not retain or upload anything. This is a two-draw-call maximum per textured model, not the older one-draw-call claim.

## Review and verification

After `npm run preview:build` and `npm run preview:serve`, open `http://127.0.0.1:4178/?art-review=buildings`. This is an asset review scene using the real Cocos engine and the game's `AssetRenderer`. Drag to rotate the three buildings; scroll to zoom. It loads no player save. The default URL still starts the ordinary game.

`node scripts/preview/building-visual.cjs` tests actual PNG loading and mouse rotation and saves front/back screenshots. Set `CHROMIUM_EXECUTABLE` and `PREVIEW_TOOLS` as required on the graphics-capable machine.

On 2026-11-05, source/asset tests and the official-engine preview compilation passed locally. Sandboxed Chromium failed before opening a page because `socket()` returned `Operation not permitted`; actual WebGL rendering, texture loading in the browser, and pointer rotation remain **unverified** in this environment. No browser sandbox was disabled. Offline front/back mesh inspections in `build/building-review` are explicitly labeled and are **not** Cocos runtime screenshots. Creator editor import, Creator exports, Android packaging, and physical-device performance were not run.

Independent geometry review also passed: Blender imported the actual exported house, warehouse and shop glTF files together with the shared PNG, then rendered front and 180-degree back views. The files `build/building-review/blender-corrected-house-0.png` and `blender-corrected-house-180.png` were visually inspected. These validate exported geometry, backs and material references; Blender lighting/shadows are review settings and do not establish Cocos runtime appearance.

## Correction after screenshot feedback

The earlier implementation changed the house silhouette and raised building ambient brightness without preserving the established house. Both changes were reverted. Original wall/roof values are copied from the pre-change WarehouseKit, and the existing offset home door, window, step and chimney are restored. Attachments retain the requested board/crate inheritance. No camera exposure or unrelated scene colors were lowered to conceal the problem.

The white timber in the screenshot had a specific material bug: Cocos 3.8.8 Material.recompileShaders only warns and does not enable USE_TEXTURE; only MaterialInstance supports recompilation. The fixed material selects USE_TEXTURE at construction and binds a warm-brown texture immediately, then swaps in the generated image. Source regression checks guard the macro and non-white fallback. Browser/WebGL confirmation is still required on a graphics-capable environment.
