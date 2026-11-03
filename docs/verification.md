# Verification status

## Verified snapshot

Results below apply to commit
[`ec7ed6f5edecd3a7784643d15f2fdde311d1ea80`](https://github.com/MrWolfox-ctrlcv/town-evolution/commit/ec7ed6f5edecd3a7784643d15f2fdde311d1ea80),
verified on 2026-11-03. They are not a guarantee for later changes.

- [Source CI 41551677460](https://github.com/MrWolfox-ctrlcv/town-evolution/actions/runs/41551677460): success.
- [Actual Cocos browser preview CI 41551677432](https://github.com/MrWolfox-ctrlcv/town-evolution/actions/runs/41551677432): success.

## Source and asset checks completed

- Strict TypeScript compile of domain, persistence and engine-independent application modules.
- All Cocos scripts typechecked against official `@cocos/creator-types@3.8.8` declarations.
- 55 automated tests covering business rules, storage, session orchestration, layout, camera framing, gestures and asset geometry.
- Repeated 100-cycle production/order/save round-trip simulation.
- Seeded 3000 mixed-command invariant test with save round trips.
- One-pointer gesture tests cover secondary touches, drag thresholds, cancellation and lifecycle reset.
- Session tests cover restart, read-only previews, failed saves and explicit recovery.
- Responsive layout math checked at seven portrait/landscape sizes, including 568×320.
- Import-graph check: no circular imports or domain-to-engine dependencies; source modules capped at 300 lines.
- 18 standalone glTF exports match the canonical TypeScript recipes consumed by the runtime. Geometry checks cover bounds, indices, finite coordinates, normals, nondegenerate triangles, stable building cores and crop stages.
- Independent Khronos `gltf-validator` 2.0.0-dev.3.10 checked all 18 exports with zero errors, warnings, infos or hints. Format validation does not establish rendering quality.

Run `npm run check` for current source validation. Run `npm run art:export` to regenerate assets and `npm run art:check` to check canonical agreement. See the [art specification](art/README.md).

## Actual browser rendering and interaction completed

The preview compiles pinned official Cocos 3.8.8 source and the real project
bootstrap, with official compiled engine effects. Chromium software WebGL renders
actual meshes and native Cocos UI; there is no substitute renderer or fake `cc`.
This programmatically assembled preview does not load the Creator serialized scene.

Desktop 1280×800 (mouse) and mobile viewport 390×844 (touch emulation) each passed
21 actual UI checks. Tests locate rendered nodes and send mouse/touch input; they
do not call game commands, inject saved state or accelerate timers. Coverage includes:

- Select the farm, start production and reject premature/repeated collection.
- Reload during the real crop timer, collect the harvest, fulfill an order and reject duplicate sale.
- Cancel construction and reset without losing progress; reload saved progress.
- Preview adjacent cooler placement without spending, then confirm construction.
- Combine warehouse and cooler, preserving the warehouse ID.
- Complete another real crop cycle, cold-process across reload and deliver a chilled order.
- Reload the cold-warehouse state: 108 coins, two completed orders and two vegetables.
- Confirm a new town, take the alternative one-time expansion branch and reload: 80 coins and 32-unit storage.

Both input paths reported zero runtime errors. Initial, crop-stage, combined,
cold-order and expanded screenshots were produced and visually inspected, including
the new vertex-colored asset kit. The island fits both tested viewports and the
contextual HUD is readable. Phone-sized buildings are small at whole-island zoom;
physical-device touch comfort and performance remain separate acceptance gates.

See [preview reproduction instructions and limitations](../scripts/preview/README.md).
The pipeline is experimental, not a Creator release export or public deployment;
its complete transitive build dependency graph is not yet reproducibly locked.

## Still requires Cocos Creator 3.8.8

- [ ] Import the project in Creator and verify generated engine/project metadata.
- [ ] Open serialized `Main.scene` and confirm bootstrap component resolution.
- [ ] Repeat rendering and interaction checks through the editor preview.
- [ ] Check editor-driven viewport resizing and platform-specific lifecycle behavior.
- [ ] Exercise storage error/recovery UI, not only automated storage-layer tests.
- [ ] Build Web through Creator and smoke-test its HTTP-hosted output.
- [ ] Build Android and install the APK.

## Still requires target phones

- [ ] Real mobile browser and Android APK complete the same domain flow.
- [ ] Sustained frame times and memory, not only initial FPS.
- [ ] Repeated creation/remodeling without retained mesh/material leaks.
- [ ] Touch accuracy near UI, screen edges and buildings.
- [ ] Native safe-area/notch and system navigation insets (not yet automatically inset).
- [ ] Background/foreground, interrupted activity and process restart.
- [ ] Initial loading size/time and thermal behavior.

Browser touch emulation is evidence of input-path correctness, not a physical
phone test. No Creator import/export, Android packaging or device-performance
item above is marked passed by the standalone preview.
