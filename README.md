# Town Evolution

[演示岛与重复测试说明](docs/demo-island.md)：首次进入演示岛，可在工具页切换独立正常小镇。
[中文快速开始](README.zh-CN.md) · [Architecture](docs/architecture.md) · [Verification checklist](docs/verification.md)

A code-first **Cocos Creator 3.8.8 + TypeScript** town-building MVP: grow three crop types, fulfill orders, place modular buildings, expand warehouses, and ship goods from a coastal dock.

## Tools and ground products

Transparent tool and product columns paginate independently. Product drops commit one unit to a ground cell, capped at five matching items. Axe use produces wood in inventory; players must drag wood onto the ground before applying the saw. Successful harvesting/tool use consumes durability. Watering can, fertilizer and hammer are visible inventory foundations, with unapproved recipes intentionally inactive. A compact lower-right recipe folder opens a directory and individual draggable, zoomable recipe papers instead of permanent HUD instructions. The explicitly authorized old prototype test saves are cleared on opening this revision; normal and demo progress use separate storage from here on.

## Current local gameplay

The integrated local version adds transparent floating tools on the left and products on the right, anchored pan and pinch/wheel
zoom, long-press building movement and merging, shops, public order boards and docks.
Inventory-chip drags transfer exactly one unit: a shop sells it; a dock stages it
without paying a reward. Facility panels expose quantity presets and explicit shipment
start/claim actions. Each farm has nine independent cells. Sweeping a vegetable over an empty cell consumes one; sweeping the sickle over a mature cell yields two. New towns start with one vegetable; chilled vegetables cannot be planted.

The transparent right-side tools use generated sickle, carrot, wheat and lettuce icons. All three crops can be purchased, planted and harvested independently; each cell spends one and yields two. New docks must be placed on the southern shoreline. Dock placement follows the generated coastline, rather than a legacy rectangular shore.

Local source checks cover crop-specific planting, trading, shoreline placement and save migration. The historical browser evidence below applies only
to its named commit; the new interaction and commerce flows still await browser validation.
See [commerce rules and recovery](docs/commerce-mvp.md).

## Verified status

At commit [`ec7ed6f5`](https://github.com/MrWolfox-ctrlcv/town-evolution/commit/ec7ed6f5edecd3a7784643d15f2fdde311d1ea80),
[source CI](https://github.com/MrWolfox-ctrlcv/town-evolution/actions/runs/41551677460)
passed 55 unit tests, strict official Cocos API checks and canonical 18-asset export checks.
[Runtime CI](https://github.com/MrWolfox-ctrlcv/town-evolution/actions/runs/41551677432)
rendered the **actual Cocos 3.8.8 engine** at desktop and mobile viewport sizes and
passed 21 real UI checks per mouse/touch path. Screenshots include crop stages,
warehouse combination, cold orders and expansion; see [verification details](docs/verification.md).

This is an experimental standalone browser preview, assembled from the real game
bootstrap and pinned official engine source—not a replacement HTML/Three.js renderer.
It does **not** establish Creator serialized-scene import, Creator Web export,
Android packaging or physical-phone performance. Those remain untested.
[Preview setup and limitations](scripts/preview/README.md) are separate from the Creator workflow below.

## Automated source checks

Requires Node.js 22 or newer and npm.

```sh
npm ci --ignore-scripts
npm run check
npm run demo:domain
```

- `typecheck`: strict TypeScript check of pure domain and persistence modules.
- `typecheck:cocos`: strict check of all game scripts against official `@cocos/creator-types@3.8.8` declarations, not a mocked `cc` module.
- `test`: compiles that layer and runs Node tests, including atomic failures, placement, inventory, repeat collection, combinations, rollback, offline return and invalid-save recovery.
- `check`: domain and official engine-API checks plus Cocos project file/scene structure checks. Structure checks are not engine compilation.
- `demo:domain`: deterministic command-line walkthrough of the shared gameplay rules, without rendering.

GitHub Actions runs these source checks separately from the actual Cocos browser-preview workflow. Neither workflow claims to run the Creator editor or build an APK.

## Open and play in Cocos Creator

1. Install **Cocos Creator 3.8.8** through the official Cocos Dashboard on Windows or macOS.
2. Add this repository folder as an existing project. Let Creator import scripts and generate its `temp`/`library` files.
3. Open `assets/scenes/Main.scene`. It contains the game bootstrap; presentation geometry and UI are generated at runtime.
4. Use Preview to verify the actual Cocos scene. If import or engine compilation reports errors, fix them before treating this as runnable.
5. Sweep a vegetable from the right rail across empty farm cells, wait 15 seconds and sweep the sickle over mature cells. Each cell costs one vegetable and yields two. Vegetables can be purchased directly for 8 coins each; build a free public order board to deliver eight vegetables. Hold a building for about 0.4 seconds to lift and move it. Place docks on the southern shoreline.
6. Test save/load and background return. Reset is confirmation-gated and preserves the previous raw save.

Normal play starts with a farm, a warehouse and 120 coins; the default demonstration has prebuilt facilities and test resources. Existing processed goods remain clearable from old saves; new games do not offer cold production.

## Build Web and Android

From Creator's Build panel, add `Main.scene` as a startup scene and choose Web Mobile (and Web Desktop if desired). Build and serve the generated output over HTTP. Test touch controls in a real mobile browser; desktop preview does not establish mobile compatibility.

For Android, install the SDK/NDK/JDK versions required by the selected Creator release, configure Native Development paths in Creator, select Android and build the generated native project. Begin with a local debug APK. No release signing secrets are included. An APK must be installed on a real phone for lifecycle, frame time, memory and heat checks.

- [Creator install guide](https://docs.cocos.com/creator/3.8/manual/en/getting-started/install/)
- [Publishing Android apps](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/android/index.html)
- [Native development environment](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/setup-native-development.html)

TapTap distribution, platform credentials, SDK integration, release signing, listing review and public deployment are outside this prototype.

## Source map

- `assets/scripts/domain/game.ts`: small public facade; `actions/`, `state`, `config`, `geometry` and `save` isolate cohesive responsibilities.
- `assets/scripts/domain/storage.ts`: versioned saves, backup and explicit recovery.
- `assets/scripts/application/`: engine-independent session orchestration and responsive HUD layout math.
- `assets/scripts/presentation/`: small Cocos scene/controller, camera, HUD, widgets and model modules.
- `assets/scripts/art/`: canonical mesh recipes shared by runtime rendering and glTF export.
- `art/exports/`: 24 standalone glTF assets and their manifest.
- `assets/scenes/Main.scene`: engine bootstrap scene.
- `tests/`: automated domain/persistence tests.
- `docs/architecture.md`: authoritative MVP rules and boundaries.
- `docs/verification.md`: verification checklist; update only after running the corresponding checks.

## Asset policy

The low-poly kit uses editable TypeScript recipes and actual indexed meshes, shared by Cocos rendering and 24 standalone glTF exports. `npm run art:export` regenerates them; `npm run art:check` verifies exact agreement with canonical recipes. Independent format-validation results are recorded in the asset specification. See the [asset specification](docs/art/README.md).

No third-party model pack, paid asset, commercial brand or credential is bundled. The generated concept illustration is art direction, not a model extraction or a promise of visual equivalence.
