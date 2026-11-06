# 代码树与阅读路线

[返回项目介绍](../README.md) · [中文操作说明](../README.zh-CN.md) · [运行与构建](../scripts/preview/README.md)

## 快照范围

本文按 **2026-11-06 的实际工作区文件**整理，包含已存在但尚未提交的源码。此前仓内没有独立完整代码树，因此新增本文件，不覆盖历史架构或验收报告。文件存在不等于功能已通过全部验收；源码、预览产物和仓库 HEAD 可能不是同一版本。

本次枚举有 **274 个 TypeScript 模块**：domain 90、application 39、art 64、presentation 81；另有 **177 个 `*.test.cjs` 测试文件**、资产清单中的 **222 个 glTF 条目**。这些是文件 / 条目数量，不是测试通过数量。新增模块后应重新枚举，不手工沿用旧数字。

树中列全 `assets/scripts/` 的 TypeScript 源文件和 `scripts/` 的入口；`.meta`、图片、glTF 明细、测试辅助文件、构建输出与依赖目录按用途概括。它不是磁盘全部文件清单。

## 先从哪里读

1. **启动与切换**：`assets/scenes/Main.scene` → `presentation/TownBootstrap.ts` → `application/GameStart.ts` / `TownProfiles.ts`。标题、游戏、设置、手动存档和独立 profile 的生命周期从这里进入。
2. **一条操作怎样落地**：`presentation/TownController.ts` 接输入，`application/GameSession.ts` 调用 `domain/game.ts` 的 `dispatch`，由 `domain/actions/` 校验并提交新状态。`domain/state.ts` 创建 / 复制状态，`types.ts` 定义命令与状态契约。
3. **为什么不会多扣或多发**：查看对应 action 的完整检查、`guards.ts`、快照 / ID 校验与测试。表现层不能绕过命令直接改库存，失败操作返回原状态。
4. **怎样存档**：`domain/save.ts` 做结构和版本校验；`storage.ts` 处理备份、升级档案、冲突与恢复；`application/ManualSaves.ts`、`ExclusiveGameStorage.ts` 管理手动栏位与并行页面。
5. **画面从哪里来**：`presentation/TownView.ts` 同步场景，`ModelFactory.ts` / `AssetRenderer.ts` 使用 `art/AssetCatalog.ts` 的共享模型；`scripts/art/export.cjs` 导出同一批配方。
6. **地形与采集**：`domain/world.ts` / `terrain.ts` / `island.ts` 选择旧版或 v5 规则；`v5-world.ts`、`v5-hydrology*.ts`、`v5-marine.ts` 给出 v5 资源、水域与填海依据；`art/V5*.ts` 和 `presentation/V5*.ts` 负责分块几何及发布。

以下相对模块名均以 `assets/scripts/` 为起点，完整路径在文件树中。

## 分层职责与重要边界

| 层             | 负责什么                                                               | 不应做什么                                                     |
| -------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| `domain`       | 配方、资源 / 经济、建造 / 生产 / 交易、地形规则、存档结构和原子命令    | 引入 `cc`、DOM、网络、直接时钟 / 随机数 / 存储，或依赖外层模块 |
| `application`  | 注入时间与存储的会话、profile、手势数学、选择 / 拾取 / 布局 / 流式调度 | 把 Cocos 节点保存进游戏状态，绕开 domain 发放产品              |
| `art`          | 纯数据模型配方、网格、材质参数、地形表面与分块计算                     | 作为经济事实来源，替代存档中的数量与所有权                     |
| `presentation` | Cocos 节点 / 相机 / HUD / 输入、视觉反馈、可见性和分块上传             | 直接结算金币、物品和建筑变更，或把未提交的预览当作已完成       |

`tsconfig.domain.json` 实际编译 domain + application + art；文件名里的 domain 不表示只检查 `domain/`。`tsconfig.cocos-check.json` 用官方 3.8.8 声明检查全部脚本。`scripts/check-architecture.cjs` 检查相对导入存在、domain 依赖边界、循环依赖和每个 TS 模块的 300 行上限；它不是 Creator 编译器。

## 仓库文件树

```text
town-evolution-latest/
├── .github/
│   └── workflows/
│       ├── preview.yml
│       └── verify.yml
├── art/
│   ├── exports/
│   │   └── [ 222 个 glTF 与 manifest.json；共享配方导出 ]
│   └── references/
│       └── [ 美术参考与概念资料 ]
├── assets/
│   ├── resources/
│   │   └── [ buildings / crop-icons / handbook / title / ui 图片与元数据 ]
│   ├── scenes/
│   │   └── Main.scene
│   └── scripts/
│       ├── application/
│       │   ├── BuildingDragSelection.ts
│       │   ├── BuildingMergePreview.ts
│       │   ├── CameraFraming.ts
│       │   ├── CollectionPath.ts
│       │   ├── Collections.ts
│       │   ├── CommerceSelection.ts
│       │   ├── DeferredLayout.ts
│       │   ├── DropGeometry.ts
│       │   ├── DropSnapshot.ts
│       │   ├── EntityAssemblySelection.ts
│       │   ├── ExclusiveGameStorage.ts
│       │   ├── FarmCells.ts
│       │   ├── FarmPicking.ts
│       │   ├── FarmSweep.ts
│       │   ├── GameSession.ts
│       │   ├── GameStart.ts
│       │   ├── HandbookLayout.ts
│       │   ├── HandbookModel.ts
│       │   ├── HudLayout.ts
│       │   ├── ManualSaves.ts
│       │   ├── MapGesture.ts
│       │   ├── MeshSurface.ts
│       │   ├── MixedCraftSelection.ts
│       │   ├── NaturalPicking.ts
│       │   ├── ObjectSelection.ts
│       │   ├── ProfileFraming.ts
│       │   ├── RadialLayout.ts
│       │   ├── SettingsLayout.ts
│       │   ├── SharedResource.ts
│       │   ├── SoilWatering.ts
│       │   ├── StackDrop.ts
│       │   ├── StartLayout.ts
│       │   ├── StartMenu.ts
│       │   ├── StrokeSampling.ts
│       │   ├── SurfaceSupport.ts
│       │   ├── TapGesture.ts
│       │   ├── TitleIsland.ts
│       │   ├── TownProfiles.ts
│       │   └── TreeStreaming.ts
│       ├── art/
│       │   ├── AssetCatalog.ts
│       │   ├── AssetCategories.ts
│       │   ├── AssetTypes.ts
│       │   ├── BakeryKit.ts
│       │   ├── BarrelRoastKit.ts
│       │   ├── BridgeFootings.ts
│       │   ├── BuildingAccessories.ts
│       │   ├── BuildingAssets.ts
│       │   ├── BuildingCore.ts
│       │   ├── CerealShapes.ts
│       │   ├── CoastalBeach.ts
│       │   ├── CoastalWater.ts
│       │   ├── CoastMesh.ts
│       │   ├── CoastProtection.ts
│       │   ├── ContinuousCoast.ts
│       │   ├── ContinuousField.ts
│       │   ├── ContinuousNoise.ts
│       │   ├── ContinuousResources.ts
│       │   ├── CropAnimation.ts
│       │   ├── CropGeometry.ts
│       │   ├── CropGrowth.ts
│       │   ├── CropPileKit.ts
│       │   ├── DockNoticeBoardKit.ts
│       │   ├── DockPierKit.ts
│       │   ├── EnvironmentKit.ts
│       │   ├── FarmBoxKit.ts
│       │   ├── FarmCellKit.ts
│       │   ├── FeedbackMath.ts
│       │   ├── HandbookAssets.ts
│       │   ├── HouseKit.ts
│       │   ├── IslandTerrain.ts
│       │   ├── MeshChunks.ts
│       │   ├── MeshCompiler.ts
│       │   ├── NaturalBlockKit.ts
│       │   ├── NaturalMesh.ts
│       │   ├── NaturalSurfaceData.ts
│       │   ├── NurseryKit.ts
│       │   ├── OrganicShapes.ts
│       │   ├── PlantShapes.ts
│       │   ├── PositiveField.ts
│       │   ├── ProductPileKit.ts
│       │   ├── ProductShapes.ts
│       │   ├── ResourcePatch.ts
│       │   ├── RiceGeometry.ts
│       │   ├── RiceMillKit.ts
│       │   ├── RockBlockKit.ts
│       │   ├── SceneGroundArt.ts
│       │   ├── ThumbnailFraming.ts
│       │   ├── TradeKit.ts
│       │   ├── TransportKit.ts
│       │   ├── TreeKit.ts
│       │   ├── V5Coast.ts
│       │   ├── V5CoastChunks.ts
│       │   ├── V5CoastCliff.ts
│       │   ├── V5CoastFill.ts
│       │   ├── V5CoastMesh.ts
│       │   ├── V5MeshUploadParts.ts
│       │   ├── V5PierFootings.ts
│       │   ├── V5ResourceChunks.ts
│       │   ├── V5ResourceField.ts
│       │   ├── V5SurfaceStyle.ts
│       │   ├── V5TreeGeometry.ts
│       │   ├── WarehouseKit.ts
│       │   └── WoodenBridgeKit.ts
│       ├── domain/
│       │   ├── actions/
│       │   │   ├── commerce.ts
│       │   │   ├── compost.ts
│       │   │   ├── construction.ts
│       │   │   ├── entity-assembly.ts
│       │   │   ├── farm-box.ts
│       │   │   ├── farming.ts
│       │   │   ├── fusion.ts
│       │   │   ├── ground.ts
│       │   │   ├── loose-drops.ts
│       │   │   ├── mixed-crafting.ts
│       │   │   ├── mud.ts
│       │   │   ├── nursery.ts
│       │   │   ├── orders.ts
│       │   │   ├── processing.ts
│       │   │   ├── production.ts
│       │   │   └── transport.ts
│       │   ├── biomes.ts
│       │   ├── bridge-crossing.ts
│       │   ├── bridge-demo.ts
│       │   ├── bridge-save.ts
│       │   ├── bridge-terrain.ts
│       │   ├── bridge-types.ts
│       │   ├── building-cells.ts
│       │   ├── commerce-save.ts
│       │   ├── commerce.ts
│       │   ├── compost-save.ts
│       │   ├── compost.ts
│       │   ├── config.ts
│       │   ├── craft-recipes.ts
│       │   ├── crops.ts
│       │   ├── demo.ts
│       │   ├── dock-assembly.ts
│       │   ├── drop-move.ts
│       │   ├── entity-assembly.ts
│       │   ├── expansion.ts
│       │   ├── farm-box-save.ts
│       │   ├── farm-coordinates.ts
│       │   ├── farming.ts
│       │   ├── foundation-save.ts
│       │   ├── foundation.ts
│       │   ├── fusion-state.ts
│       │   ├── game.ts
│       │   ├── geometry.ts
│       │   ├── ground-placement.ts
│       │   ├── guards.ts
│       │   ├── inventory-types.ts
│       │   ├── island.ts
│       │   ├── large-island.ts
│       │   ├── local-container-save.ts
│       │   ├── local-container.ts
│       │   ├── loose-drop-placement.ts
│       │   ├── loose-drops-save.ts
│       │   ├── loose-drops.ts
│       │   ├── merge-plan.ts
│       │   ├── merge-recipes.ts
│       │   ├── mixed-crafting.ts
│       │   ├── noise.ts
│       │   ├── nursery-save.ts
│       │   ├── nursery.ts
│       │   ├── planting.ts
│       │   ├── processing-save.ts
│       │   ├── processing.ts
│       │   ├── recipe-ids.ts
│       │   ├── recipe-types.ts
│       │   ├── recipes.ts
│       │   ├── route-recipes.ts
│       │   ├── save.ts
│       │   ├── saw-crafting.ts
│       │   ├── state.ts
│       │   ├── stock-save.ts
│       │   ├── storage.ts
│       │   ├── terrain.ts
│       │   ├── tool-crafting.ts
│       │   ├── types.ts
│       │   ├── v5-basis.ts
│       │   ├── v5-foundation.ts
│       │   ├── v5-height-recipe.ts
│       │   ├── v5-hydrology-base.ts
│       │   ├── v5-hydrology-fields.ts
│       │   ├── v5-hydrology-shapes.ts
│       │   ├── v5-hydrology.ts
│       │   ├── v5-marine.ts
│       │   ├── v5-natural-coast-feature.ts
│       │   ├── v5-natural-coast-geometry.ts
│       │   ├── v5-natural-coast-site.ts
│       │   ├── v5-natural-coast-types.ts
│       │   ├── v5-noise.ts
│       │   ├── v5-starter.ts
│       │   ├── v5-world.ts
│       │   └── world.ts
│       └── presentation/
│           ├── ActionArtwork.ts
│           ├── AssetRenderer.ts
│           ├── BottomActions.ts
│           ├── BrowserInputGuard.ts
│           ├── BuildingDrag.ts
│           ├── BuildingOutline.ts
│           ├── BuildingTexture.ts
│           ├── CameraVisibility.ts
│           ├── CoastalWaterMotion.ts
│           ├── CollectionBinding.ts
│           ├── CollectionFlights.ts
│           ├── CommercePanel.ts
│           ├── CompostControls.ts
│           ├── CropArtwork.ts
│           ├── CropMotion.ts
│           ├── DropDrag.ts
│           ├── DropSupport.ts
│           ├── EntityAssemblyPreview.ts
│           ├── FarmTools.ts
│           ├── GroundObjects.ts
│           ├── HammerTarget.ts
│           ├── HandbookArt.ts
│           ├── HandbookDiagram.ts
│           ├── HandbookInputGuard.ts
│           ├── HandbookPages.ts
│           ├── HandbookSkin.ts
│           ├── HudActions.ts
│           ├── HudDescription.ts
│           ├── InputProvenance.ts
│           ├── InputTapGesture.ts
│           ├── IslandView.ts
│           ├── LooseDropView.ts
│           ├── MapCamera.ts
│           ├── MixedCraftPreview.ts
│           ├── ModelFactory.ts
│           ├── ModelPicking.ts
│           ├── ModelThumbnails.ts
│           ├── MudIcon.ts
│           ├── ObjectBounds.ts
│           ├── ObjectContext.ts
│           ├── ObjectDrag.ts
│           ├── Palette.ts
│           ├── PileModel.ts
│           ├── ProductIconRegions.ts
│           ├── RadialActions.ts
│           ├── RecipeHandbook.ts
│           ├── RecipeMaterialArt.ts
│           ├── RenderedCropPicking.ts
│           ├── ResourceCounters.ts
│           ├── RouteActions.ts
│           ├── SceneLighting.ts
│           ├── SettingsArtwork.ts
│           ├── SettingsPanel.ts
│           ├── SingleHammerPreview.ts
│           ├── SoilIcon.ts
│           ├── StackDrag.ts
│           ├── StartArtwork.ts
│           ├── StartScreen.ts
│           ├── StatusToast.ts
│           ├── StockDrag.ts
│           ├── ToolRouter.ts
│           ├── ToolTray.ts
│           ├── ToolUseDrag.ts
│           ├── TouchPicking.ts
│           ├── TownBootstrap.ts
│           ├── TownChanges.ts
│           ├── TownController.ts
│           ├── TownFeedback.ts
│           ├── TownHUD.ts
│           ├── TownObjectPicking.ts
│           ├── TownView.ts
│           ├── TrayColumn.ts
│           ├── TrayIcons.ts
│           ├── TreeSeedIcon.ts
│           ├── UiContracts.ts
│           ├── V5ChunkMeshes.ts
│           ├── V5IslandView.ts
│           ├── V5TreeView.ts
│           ├── Widgets.ts
│           ├── WorldMaterial.ts
│           └── WorldMesh.ts
├── docs/
│   ├── art/
│   │   ├── building-inheritance.md
│   │   ├── generated-product-icons.md
│   │   ├── ground-crop-piles.md
│   │   ├── island-terrain.md
│   │   ├── new-route-icons.json
│   │   ├── README.md
│   │   ├── tree-variation.md
│   │   └── visual-overhaul.md
│   ├── architecture.md
│   ├── building-picking.md
│   ├── camera-framing.md
│   ├── checkpoint-fusion-2026-11-03.md
│   ├── code-tree.md
│   ├── commerce-mvp.md
│   ├── compost-roast-bridge-design.md
│   ├── continuous-terrain.md
│   ├── demo-campaign-regression.md
│   ├── demo-island.md
│   ├── farmland-upgrades.md
│   ├── foundation-mvp.md
│   ├── handbook-model-art.md
│   ├── harvest-visible-targeting.md
│   ├── lighting-shadows.md
│   ├── manual-save-capacity.md
│   ├── mud-expansion.md
│   ├── natural-island-art.md
│   ├── new-production-routes-ui.md
│   ├── new-production-routes.md
│   ├── object-radial-actions.md
│   ├── object-selection-transitions.md
│   ├── recipe-handbook.md
│   ├── settings-redesign.md
│   ├── start-and-saves.md
│   ├── touch-targeting.md
│   ├── v5-integration.md
│   ├── v5-tree-streaming.md
│   ├── verification.md
│   └── world-expansion.md
├── scripts/
│   ├── art/
│   │   ├── export.cjs
│   │   └── v5-resource-cpu-bench.cjs
│   ├── preview/
│   │   ├── bootstrap.ts
│   │   ├── bottom-ui.cjs
│   │   ├── bridge-checkpoint.cjs
│   │   ├── build.cjs
│   │   ├── building-review.ts
│   │   ├── building-visual.cjs
│   │   ├── capture.cjs
│   │   ├── cell-interactions.cjs
│   │   ├── checkpoint-interactions.cjs
│   │   ├── checkpoint-ui.cjs
│   │   ├── commerce-driver.cjs
│   │   ├── commerce-interactions.cjs
│   │   ├── compost-checkpoint.cjs
│   │   ├── crop-visual.cjs
│   │   ├── demo-interactions.cjs
│   │   ├── dock-visual.cjs
│   │   ├── effects.cjs
│   │   ├── evolution-interactions.cjs
│   │   ├── farming-interactions.cjs
│   │   ├── gesture-interactions.cjs
│   │   ├── ground-visual.cjs
│   │   ├── handbook-artwork-check.cjs
│   │   ├── index.html
│   │   ├── interactions.cjs
│   │   ├── picking-smoke.cjs
│   │   ├── pointer-input.cjs
│   │   ├── README.md
│   │   ├── recipe-interactions.cjs
│   │   ├── route-checkpoint.cjs
│   │   ├── serve.cjs
│   │   ├── session-smoke.cjs
│   │   ├── settings-interactions.cjs
│   │   ├── shadow-bounds-smoke.cjs
│   │   ├── stack-session.cjs
│   │   ├── stock-input.cjs
│   │   ├── terrain-review.ts
│   │   ├── title-interactions.cjs
│   │   ├── tween-smoke.cjs
│   │   ├── ui-driver.cjs
│   │   ├── verify-engine.cjs
│   │   └── water-smoke.cjs
│   ├── check-architecture.cjs
│   ├── check-project.cjs
│   ├── demo-domain.cjs
│   └── demo-foundation.cjs
├── settings/
│   └── v2/
│       └── packages/
│           ├── engine.json
│           └── project.json
├── tests/
│   └── [ 177 个 *.test.cjs，另有 fixtures/ 和 helpers/；见下方分组 ]
├── .gitignore
├── .prettierignore
├── .prettierrc.json
├── AGENTS.md
├── package-lock.json
├── package.json
├── README.md
├── README.zh-CN.md
├── tsconfig.cocos-check.json
├── tsconfig.domain.json
└── tsconfig.json

```

### 树中未展开的目录

- `assets/**/*.meta`：Creator 的资源 ID / 引用元数据，需要随对应资源维护；省略仅为可读性，不表示可删除。
- `art/exports/manifest.json`：模型分类、尺寸和几何数量的真实清单；glTF 由 `npm run art:export` 生成并通过 `art:check` 比对。
- `assets/resources/`：运行时图标、图鉴、木纹等纹理。`assets/resources/title/` 中有历史图片；当前标题实际使用 `TitleIsland` / `StartArtwork` 的活场景，不应仅凭文件存在推断它正在加载。
- `.domain-build/`、`build/`、`node_modules/`、`.npm-cache/`、`library/`、`temp/`、`local/`、`profiles/`：依赖、编译、预览或本机产物，按 `.gitignore` 保持隔离；不应把其中的旧结果当作当前源码验收。
- `output/`：工作区可能存在的本地检查输出，不是运行游戏所必需的源码入口。

## 按功能定位

### 配方、生产与物品守恒

- `domain/craft-recipes.ts`、`tool-crafting.ts`、`saw-crafting.ts`：单堆材料 + 工具配方及完整占地计划。
- `domain/mixed-crafting.ts`、`actions/mixed-crafting.ts`：明确选择木 / 石两份来源的混合制作，预览和提交均检查快照。
- `domain/merge-recipes.ts`、`merge-plan.ts`、`entity-assembly.ts`、`dock-assembly.ts`：建筑组合、锤击物件装配和三件船坞，保留基础实体与合法占地。
- `domain/processing*.ts`、`nursery*.ts`、`compost*.ts` 及对应 action：加工、育苗、堆肥的输入、任务、领取、存档约束。
- `domain/loose-drops*.ts`、`drop-move.ts`、`local-container*.ts`、`farm-box-save.ts`：地面掉落、移动 / 合并、局部容器与田箱。掉落移动不借道仓库；明确领取才改变共享库存。
- `domain/commerce*.ts`、`actions/commerce.ts`、`actions/transport.ts`：商店、订单、装船 / 航次价格快照，以及显式运输货单。没有自动路线模拟。

### 界面、手势与可见目标

- `presentation/StartScreen.ts`、`SettingsPanel.ts`、`RecipeHandbook.ts`：标题 / 设置 / 图鉴；布局数据在 application 的对应模块。
- `presentation/MapCamera.ts` 与 `application/MapGesture.ts`、`TapGesture.ts`：地图平移缩放与输入生命周期。
- `presentation/BuildingDrag.ts`、`ObjectDrag.ts`、`StackDrag.ts`、`DropDrag.ts`、`StockDrag.ts`、`ToolUseDrag.ts`：不同来源的拖放，不混用库存、场景物体和工具。
- `presentation/BrowserInputGuard.ts`、`InputProvenance.ts`、`HandbookInputGuard.ts`：中断、取消、多指和来源保护。
- `presentation/ModelPicking.ts`、`RenderedCropPicking.ts`、`TouchPicking.ts`、`TownObjectPicking.ts`，以及 application 的 `NaturalPicking.ts` / `SurfaceSupport.ts`：可见几何目标、遮挡和落点支撑。
- `presentation/CollectionFlights.ts`、`TownFeedback.ts`、`CropMotion.ts`：视觉反馈。动画失败不应撤销已提交命令，也不应自行发放产品。

### 地形、海岸、分块与树木

- `domain/v5-height-recipe.ts` / `v5-starter.ts`：确定性资源 / 开局配方；`v5-world.ts` 固定生成器 revision 与资源依据。
- `domain/v5-hydrology*.ts` / `v5-natural-coast-*.ts`：海湾、湖河、岸线和自然港证书；`v5-marine.ts` 复用同一海域依据验证扩地及航道。
- `domain/v5-foundation.ts`、`bridge-terrain.ts`、`bridge-crossing.ts`、`bridge-save.ts`：真实足迹、岸边 / 跨河支撑、木桥与导入验证。
- `art/V5ResourceField.ts`、`V5ResourceChunks.ts`、`V5Coast*.ts`、`MeshChunks.ts`：权威表面、资源 / 海岸分块和源缓冲；`V5MeshUploadParts.ts` 划分上传数据。
- `presentation/V5IslandView.ts`、`V5ChunkMeshes.ts`、`V5TreeView.ts` 与 `application/TreeStreaming.ts`：可见区加载、失效任务拒绝和渲染发布。源缓冲字节量不是 GPU 实测占用。
- `art/V5SurfaceStyle.ts`、`V5PierFootings.ts`：显示风格与 v5 栈桥水下支柱；显示修正不得暗改生成器、资源或存档语义。

## 版本与存储边界

当前 `domain/world.ts` 的 `TerrainVersion` 为 1–5；`domain/state.ts` 新建默认版本为4；`domain/save.ts` 写 schema10，并接受 schema8 / 9 / 10。schema 号与地形版本是两条独立维度，不能把 schema10 当作 terrain10。

`application/TownProfiles.ts` 当前有四种 profile：

- `normal`：我的小镇，使用既有正常存储入口，新局 terrain4。
- `demo`：演示岛，独立进度；模板版本变化不静默覆盖现有进度。
- `v5-preview`：v5 新岛预览，使用带 `V5_GENERATOR_REVISION` 的独立 key 前缀。
- `v5-bridge-demo`：木桥演示，同样使用独立且带 revision 的 key 前缀。

当前 v5 revision 为 `v5-natural-coast-starter-1`。已有保存版本的生成器、ID 和初始库存语义不能原地替换。未知 schema / revision、损坏档案与未来版本均应保留原字节，不能为了演示新岛而重置用户进度。导入、迁移和备份细节以 `save.ts` / `storage.ts` 及测试为准。

## terrain6：仓库外的独立研究目录

以下结构是同一开发工作区中的**兄弟目录**，不是上面 Git 仓库的子目录，也不会随单独 clone 获得。这里使用路径说明而不伪造可随仓库访问的链接。每个报告只证明对应冻结源码和命名测试的结果。

```text
工作区/
├── town-evolution-latest/             # 本文描述的主游戏仓库
└── terrain-v5-lab/
    └── grass-relief/
        ├── INTEGRATION6-SCOPE.md      # 正式接入所需状态、保存、交互、性能门槛
        ├── REFERENCE-AND-GATES.md     # 视觉方向与验收边界
        ├── compatibility/            # 旧地形兼容性研究与报告
        ├── surface/                  # 表面风格实验
        ├── rolling/                  # 自然起伏草地实验
        ├── world6/                   # 冻结的完整岛基础，非正式游戏
        │   ├── V6Terrain.ts          # 高度、资源、地基查询入口
        │   ├── V6Landform.ts         # 自然地貌配方
        │   ├── V6Contracts.ts        # Float32 层面与数据契约
        │   ├── V6State.ts            # 完整资源 / 树快照与采集
        │   ├── V6Normal.ts           # 权威面法线
        │   ├── World6Mesh.ts         # 地形 / 资源 CPU 网格
        │   ├── World6MeshWriter.ts   # 共享晶格、边界与切面
        │   ├── World6Coast.ts        # 唯一地表归属与原水文适配
        │   ├── World6Picking.ts      # CPU first-hit 检查，不是正式 picker
        │   └── REPORT.zh-CN.md
        ├── world6-staged/            # 基线等价的分步构造、取消、重启
        │   ├── V6TerrainBuilder.ts
        │   ├── V6Initialization.ts
        │   ├── baseline/             # 冻结源码及依赖闭包
        │   ├── README.md
        │   └── REPORT.md
        ├── world6-reclaimed/         # 完整扩地 overlay、真实侧墙与查询适配
        │   ├── ReclaimedV6.ts
        │   ├── ReclaimedCoast.ts
        │   ├── ReclaimedMeshes.ts
        │   ├── ReadonlyCollections.ts
        │   └── REPORT.zh-CN.md
        ├── world6-edits/             # 普通陆地分层挖填，独立材料层账本
        │   ├── TerrainEdits.ts
        │   ├── Source.ts
        │   ├── Types.ts
        │   ├── EditMesh.ts
        │   ├── EditMeshWriter.ts
        │   ├── Picking.ts
        │   ├── Persistence.ts         # 独立 journal 重放，非主游戏存档
        │   └── verify.cjs
        ├── world6-rocks-smooth/      # 岩山对照，未选为正式地貌
        ├── world6-rocks-layered/     # 岩山对照，含已否决方案记录
        ├── world6-rocks-ridges/      # 岩脊体量对照，未定稿
        └── world6-rock-comparison/   # 同镜头离线对照与说明
```

已有独立报告记录：world6 的8项测试、staged 的11项测试和六 seed 等价检查、reclaimed 的10项测试。本文没有重跑这些重型研究测试，也不把它们合计为主游戏通过数。`world6-edits` 的最终报告仍在整理，其临时测试数不写成固定验收结论。

当前方向是**保留自然地貌，玩家改造产生规则层面与竖直边界**。普通高台的编辑不制造假天然资源 ID；独立层账本防止重复开采 / 重放增发，但还不是已定价的库存经济。当前填土实验要求先挖出规则平台，不支持直接给未经整平的天然斜面补土。山体造型对照也没有得到正式采用。

正式接入仍需 terrain6 专属 version / revision / profile / 导入、所有物体的完整足迹与高度、建造 / 移动 / 旋转 / 合并 / 种田 / 掉落 / 拾取统一表面，以及流式加载的原子发布。海上填海的 CPU 适配不覆盖正式库存消费、全部建筑 / 船坞泊位占用或陆地整平价格。

研究复现须先取得这些独立目录，从工作区根运行，例如：

```sh
node town-evolution-latest/node_modules/typescript/bin/tsc -p terrain-v5-lab/grass-relief/world6/tsconfig.json
node --test terrain-v5-lab/grass-relief/world6/verify.cjs terrain-v5-lab/grass-relief/world6/mesh-verify.cjs
```

staged / reclaimed 的完整命令与 benchmark 以各自报告为准。全岛测试、Blender 渲染和性能测量应串行，避免并行负载污染结果。分步构造总工作仍为秒级，GC 尾时和初始化峰值仍需处理；CPU 查询、离线图片及理论缓冲量都不是 Cocos / GPU / 手机性能验收。

## 测试与运行入口

基础命令均从本仓库根目录运行：

```sh
npm ci --ignore-scripts
npm run check
npm run demo:domain
```

常用的聚焦测试入口如下。示例列出代表文件，不代表该组全部用例，也不表示本轮已经运行：

| 关注点                    | 代表测试                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 规则与原子性              | `game.test.cjs`、`invariants.test.cjs`、`foundation.test.cjs`                                                                                        |
| 保存与恢复                | `storage.test.cjs`、`schema9-save.test.cjs`、`schema10-save.test.cjs`、`save-concurrency.test.cjs`                                                   |
| 标题 / profile / 手动栏位 | `game-start.test.cjs`、`town-profiles.test.cjs`、`exclusive-game-storage.test.cjs`、`manual-save-capacity.test.cjs`                                  |
| 种田与收割                | `farm-cells.test.cjs`、`farm-sweep.test.cjs`、`paddy-crops.test.cjs`、`farm-box.test.cjs`、`harvest-targeting.test.cjs`                              |
| 掉落与材料守恒            | `loose-drops.test.cjs`、`loose-drops-save.test.cjs`、`drop-move.test.cjs`、`stack-limits.test.cjs`、`mixed-crafting.test.cjs`                        |
| 配方与装配                | `tool-crafting-v9.test.cjs`、`entity-assembly.test.cjs`、`material-hammer.test.cjs`、`merge-plan-v9.test.cjs`                                        |
| 生产与交易                | `nursery.test.cjs`、`processing-core.test.cjs`、`compost-integration.test.cjs`、`roasted-carrot.test.cjs`、`commerce.test.cjs`、`transport.test.cjs` |
| 木桥                      | `bridge-crossing.test.cjs`、`bridge-profile.test.cjs`、`bridge-save.test.cjs`、`bridge-drag-ui.test.cjs`                                             |
| 拾取 / 输入中断           | `model-picking-identity.test.cjs`、`input-owner-lifecycle.test.cjs`、`map-contact-lifecycle.test.cjs`、`touch-input-picking.test.cjs`                |
| 地形与旧档兼容            | `terrain-v5-compatibility.test.cjs`、`terrain-v5-lifecycle.test.cjs`、`v5-revision-boundary.test.cjs`                                                |
| 海岸、填海、港口          | `terrain-v5-expansion.test.cjs`、`v5-hydrology-coast.test.cjs`、`v5-natural-port-lifecycle.test.cjs`、`v5-pier-footings.test.cjs`                    |
| 分块与树木                | `v5-resource-chunks.test.cjs`、`v5-coast-chunks.test.cjs`、`v5-tree-streaming.test.cjs`                                                              |
| 模型与图片                | `art.test.cjs`、`building-inheritance.test.cjs`、`crop-geometry.test.cjs`、`generated-product-icons.test.cjs`                                        |

运行单个测试前先 `npm run build:domain`，再用 `node --test tests/对应文件.test.cjs`。完整 `npm test` 会自动编译。名字带 `ui` 的 Node 测试可检查逻辑 / 路由 / 源码约束，不能因命名就视为真实浏览器点击结果。

浏览器与会话脚本：

- `scripts/preview/build.cjs`：编译固定官方 Cocos 引擎与实际启动代码；依赖外置引擎、CLI 和构建工具。
- `scripts/preview/serve.cjs`：只服务预览产物，默认监听 `127.0.0.1:4178`，不暴露整个仓库。
- `scripts/preview/session-smoke.cjs`：非图形会话、计时、存档与规则集成。
- `scripts/preview/tween-smoke.cjs`：实际编译引擎的 Tween 调度，不产生 WebGL 画面。
- `scripts/preview/capture.cjs`、`title-interactions.cjs`、`demo-interactions.cjs`、`checkpoint-interactions.cjs`：真实引擎、标题和指针交互检查。
- `scripts/preview/route-checkpoint.cjs`、`compost-checkpoint.cjs`、`bridge-checkpoint.cjs`：后续生产 / 堆肥 / 木桥场景；准备好脚本不等于已执行。
- `scripts/preview/terrain-review.ts`、`building-review.ts` 及 `*-visual.cjs`：模型 / 地形和专题截图辅助；具体运行依赖与证据边界见预览 README。
- `.github/workflows/verify.yml` 与 `preview.yml`：源码检查与真实引擎预览分开执行；都不代表 Creator 正式导出或 Android 真机验收。

## 维护这份文档

新增、移动、删除模块后，对照 `find assets/scripts -name '*.ts'`、`find scripts docs -type f`、`package.json` 和实际导入更新树与阅读路线。增加地形版本时同时复核 `TerrainVersion`、生成器 revision、profile、导入拒绝路径、旧档精确兼容和实际 UI 接入，不能只添加一个目录名字。

文档修改可运行 `npx --no-install prettier --check README.md README.zh-CN.md docs/code-tree.md`，检查相对链接和树中路径；代码修改仍须执行相应测试及最终 `npm run check`。不因本文件更新而改写历史验收记录。
