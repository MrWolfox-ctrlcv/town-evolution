# Town Evolution

[中文快速开始](README.zh-CN.md) · [Architecture](docs/architecture.md) · [Verification checklist](docs/verification.md)

A code-first **Cocos Creator 3.8.8 + TypeScript** town-building MVP: grow vegetables, fulfill orders, place modular buildings, expand warehouses, and combine a warehouse with cooling equipment.

## Current verification boundary

This repository is source code plus an engine-independent tested business layer. **A passing GitHub workflow is not a passing Cocos editor import or playable game build.** The development workspace is Linux without Cocos Creator. Official Creator installation documentation supplies Windows/macOS workflows; the editor, Web export, Android package, visuals and device performance have not yet been run here.

No replacement HTML/Three.js demo or fake `cc` type declarations are used to conceal that boundary.

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

GitHub Actions runs the same commands on pushes and pull requests. It intentionally does not display a green “Cocos build” job without an installed editor.

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
- `assets/scenes/Main.scene`: engine bootstrap scene.
- `tests/`: automated domain/persistence tests.
- `docs/architecture.md`: authoritative MVP rules and boundaries.
- `docs/verification.md`: verification checklist; update only after running the corresponding checks.

## Asset policy

Prototype geometry is generated from basic meshes in code. No third-party model pack, paid asset, AI concept image, commercial brand or credential is bundled. The earlier concept illustration is aesthetic context, not a model extraction or a promise of visual equivalence.
