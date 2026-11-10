# Recipe handbook: actual model captures

Recipe item pictures no longer draw replacement houses, trees, crates, signs or farms with
`Graphics`. `HandbookAssets.ts` maps supported model kinds to the same canonical
asset recipes used by the town. The flat-land and reclaimed-land pictures use the actual continuous coast /
ground compiler. Soil mounds and stone columns use the live continuous-resource compiler,
not illustrated replacements. Soil, stone, mud and the residence reuse canonical town models. Tools reuse the same PNG resources as the live tool tray.
The shop has its own real model rather than the former generic fallback.

`ModelThumbnails.ts` uses the real Cocos `AssetRenderer`, shared wood material, scene sun and
standard materials. It fits actual projected mesh vertices into a transparent 640×800 render
target. The capture layer is excluded from world and HUD cameras. Source meshes do not cast or
receive island shadows. Capture waits for the shared wood texture to finish loading, takes one
warm-up frame plus one capture frame, and then destroys the temporary camera and models.

All visible recipe pictures share this one texture (1.95 MiB RGBA color target). Reopening,
turning pages, dragging and scaling the paper only reuse sprite frames. The source tree and
render target are released when the last handbook instance is disposed. The texture origin and
UV orientation account for GL-like and top-origin native graphics backends.

Discovery gates are unchanged. The five existing soil, stone, mud, reclamation and residence
operations now record their agreed formulas after successful execution. Undiscovered rows and pages remain unknown;
only discovered entries bind their model pictures. UI decorations and arithmetic symbols are
not game-item illustrations. No offline AI concept picture or SVG is substituted for a model.

## Verification

- `tests/handbook-artwork.test.cjs` verifies active recipe coverage, canonical model identity,
  actual ground geometry, all-vertex framing, backend row orientation and the atlas memory bound.
- Existing handbook model and mobile layout tests continue to cover discovery, pagination,
  drag/zoom bounds and saved progress.
- `scripts/preview/handbook-artwork-check.cjs` is a read-only browser check for a discovered page.
  It verifies the real Cocos RenderTexture, nonempty/transparent pixels, shared texture and
  removal of the capture camera. Call it after opening a discovered recipe in the interaction
  suite; it does not inject discoveries or change saves.
- Cocos 3.8.8 API checks pass. On 2026-11-05, local sandboxed Chromium still failed at launch with
  `socket() failed: Operation not permitted` before any page rendering. New screenshot pixels,
  visual appearance and physical-device performance are therefore not claimed as verified.
