# Town Evolution

[中文快速开始](README.zh-CN.md) · [Architecture](docs/architecture.md) · [Verification checklist](docs/verification.md)

A code-first **Cocos Creator 3.8.8 + TypeScript** town-building MVP: grow vegetables, fulfill orders, place modular buildings, expand warehouses, and combine a warehouse with cooling equipment.

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
5. Start the farm, wait 15 seconds, collect four vegetables, then deliver an order. Place a cooler beside an edge of the starting warehouse and combine them; grow more vegetables, cold-process, collect and deliver a chilled order.
6. Test save/load and background return. Reset is confirmation-gated and preserves the previous raw save.

The prototype starts with a farm, a warehouse and 120 coins. Building combination and cold-order rules are provisional gameplay choices for validating the architecture.

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
- `art/exports/`: 18 standalone glTF assets and their manifest.
- `assets/scenes/Main.scene`: engine bootstrap scene.
- `tests/`: automated domain/persistence tests.
- `docs/architecture.md`: authoritative MVP rules and boundaries.
- `docs/verification.md`: verification checklist; update only after running the corresponding checks.

## Asset policy

The low-poly kit uses editable TypeScript recipes and actual indexed meshes, shared by Cocos rendering and 18 standalone glTF exports. `npm run art:export` regenerates them; `npm run art:check` verifies exact agreement with canonical recipes. All 18 exports also passed independent Khronos glTF validation with zero reported issues. See the [asset specification](docs/art/README.md).

No third-party model pack, paid asset, commercial brand or credential is bundled. The generated concept illustration is art direction, not a model extraction or a promise of visual equivalence.
