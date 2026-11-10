# 小镇进化 Town Evolution

以 **Cocos Creator 3.8.8 + TypeScript** 开发的本地单机经营原型。玩家在岛上种植、采集、加工、交易，通过明确的材料配方搭建与组合建筑。业务规则、存档、程序化模型和 Cocos 表现分层实现，目标是让网页与 Android 共用同一套玩法规则。

[中文操作说明](README.zh-CN.md) · [代码树与阅读路线](docs/code-tree.md) · [生产与存档规则](docs/new-production-routes.md) · [预览构建说明](scripts/preview/README.md) · [terrain6 接入状态](docs/terrain6-integration.md)

## 环境材质开发包

本次独立源码在恢复交互、地形缓存、Worker 准备与高桩桥代码后，加入水体、天空、草地、土壤、岩石和沙滩材质。素材、官方参考及验收边界见 [环境材质说明](docs/environment-materials.md)。本开发包未部署，下面的在线版本记录不能作为本轮画面验收。

## 当前是什么版本

本说明按 **2026-11-08 本地源码**整理。本次源码包含 terrain6 集成候选；现有在线 v31 仍为此前的 v5 / 木桥 / 堆肥与烤制包，未升级为 terrain6。仓库源码与在线预览须分别验收。

| 范围                  | 当前状态                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 主游戏源码            | 已实现逐格种田、材料合成、地面掉落、交易、加工、独立存档和配方图鉴；新围栏/长凳内容写入 wire schema 11，其余仍为10；兼容导入8–11，内部状态仍为10。 |
| 普通小镇与演示岛      | 新建时仍用 terrain v4；演示模板、正常进度分别保存，模板更新不自动重置已有存档。                                                                    |
| v5 新岛预览与木桥演示 | 已有独立入口，使用 terrain v5 和带生成器 revision 的独立存储空间；不是默认小镇，也不迁移旧岛。                                                     |
| terrain6 自然挖填实验 | 已进入主游戏源码，独立 `v6-preview` / revision / 存档；仍是未部署的集成候选，已接入高差木桥，浏览器 / GPU / 手机未验。                             |
| 完整验收              | 源码检查、独立引擎构建、真实浏览器交互、Creator 导出、GPU/真机性能是不同环节；旧检查点的通过结果不覆盖当前改动。                                   |

这里的「已实现」指可在源码中找到对应逻辑，不代表本轮已完成全部运行时或设备验收。具体边界见下文。[早期架构文档](docs/architecture.md)保留了最初 MVP 的背景，其 schema1、冷藏生产和金币建造参数不是当前玩法规范。

## 玩法概览

基本闭环：**购买作物 → 逐格播种与收获 → 地面存放或田箱收集 → 明确取回入仓 → 商店 / 订单 / 装船 → 扩建设施**。

- **四种作物**：胡萝卜、小麦、生菜用于旱田，水稻用于水田。小田有 3×3 个独立种植格；三块兼容小田按 L 形组合成 36 格大田。空田可灌水，有作物时不能直接改变田型。每格任务保存自己的耗时和产量，调参不改写旧任务的承诺。
- **采集与产品**：砍树获得木材；挖土、采石和普通镰刀收获产生可保存的地面掉落。地面物品可移动、同类堆叠，明确拾取才入仓。带箱农田仍需手动收割，产物进入独立的 16 份田箱；箱满保留成熟作物。
- **木制装饰**：1木材 + 锯子制成围栏，2木材 + 锯子制成长凳，各占1格，支持选择、旋转、移动与保存。当前不含休息加成或围合系统；成品拖到侧栏安全取消，整件入仓尚未实现。
- **明确的材料合成**：木材、石料先摆到地面，再按配方用锤子或锯子。石窑消耗明确选中的 1 木 + 1 石；建筑与建筑可按兼容配方拖放组合，建筑与箱子、公告牌、推车等物件用锤子明确装配。仓房挂载 2 木后可锤击扩容，不暗扣其他位置的材料。
- **生产路线**：育苗箱、石磨 / 磨坊、石窑 / 烘焙坊、运输仓均有对应规则。当前 schema10 开发版还包含空箱锤击变堆肥木桶、等待原料的取回、有限份数肥料领取，以及石窑 2 胡萝卜烤成 1 份烤胡萝卜。肥料用途尚未开放。
- **交易与船坞**：商店买卖、订单交付、船坞装货 / 取回 / 发船 / 领取相互区分。库存图标一次拖动转移 1 份；装船本身不发金币。船坞由栈桥、箱子、公告牌三件明确装配，必须满足真实海岸、支撑和出口条件。没有自动赠船或自动运输路线。
- **扩地与木桥**：原有规则是明确选中的 9 份土经水壶变成 1 泥，9 泥整堆填出 1 格合法近岸陆地，并保护淡水、航道和已有船坞。v5 / v6 木桥由两岸已摆放的栈桥直接拖放合成，移动、转向会重新验证整段跨度；原木桥演示仍是独立 v5 存档，v6 使用下述高差桥规则。
- **配方图鉴与工具**：右下角文件夹展示当前配方和实际发现记录，配方纸可拖动、缩放和收起。耐久工具当前无限使用，旧档中的零耐久也不阻止使用；肥料仍保留有限数量。旧冷藏产物和记录可恢复，但不作为新局的生产入口。

普通新局包含基础仓房、菜地、120 金币及起始作物。演示岛另有预建设施与测试资源。数值用于短时试玩，完整配方、堆叠上限和当前平衡以源码及对应专题文档为准。

操作提示：左侧工具、右侧产品独立翻页；地图可拖动和双指 / 滚轮缩放。建筑与地面堆叠可长按抬起，非法落点或多指取消会复位。整堆产品拖到仓库或两侧可见托盘控件可回收，容量不足则整堆保留；工具拖回托盘只结束手势，不撤销已完成的操作。[详细操作](README.zh-CN.md)

## 安装与源码检查

需要 **Node.js 22 或更新版本**和 npm。在仓库根目录执行：

```sh
npm ci --ignore-scripts
npm run check
npm run demo:domain
```

- `npm run check`：依次运行格式检查、纯逻辑严格类型检查、官方 Cocos 3.8.8 API 类型检查、Node 测试、项目结构 / 依赖方向 / 循环依赖检查，以及规范 glTF 一致性检查。
- `npm run typecheck`：检查 domain、application、art 三层；这些模块不依赖 `cc`。
- `npm run typecheck:cocos`：用官方 `@cocos/creator-types@3.8.8` 检查全部游戏脚本，不使用假 `cc` 声明。
- `npm test`：先输出 `.domain-build/`，再执行 `tests/*.test.cjs`。测试文件数量不是测试断言或用例数量。
- `npm run demo:domain`：执行不含渲染的规则演示。
- `npm run art:export`：从共享模型配方重新生成 `art/exports/`；`npm run art:check` 检查导出与当前配方一致。

聚焦某个模块时，可先编译再运行对应测试，例如：

```sh
npm run build:domain
node --test tests/schema10-save.test.cjs tests/bridge-save.test.cjs
node scripts/preview/session-smoke.cjs
```

`session-smoke.cjs` 使用真实会话与计时、隔离的测试存储，不是浏览器点击测试。聚焦测试不能代替最终完整 `npm run check`；应在最终源码上重新执行并保存对应日志。

## 如何运行与构建

### 方式一：Cocos Creator 项目

1. 在 Windows 或 macOS 通过官方 Cocos Dashboard 安装 **Cocos Creator 3.8.8**。
2. 将仓库根目录作为现有项目导入，等待脚本、资源和引擎元数据导入完成。
3. 打开 `assets/scenes/Main.scene`，使用编辑器预览。场景只提供启动入口，模型和界面主要由代码生成。
4. 分别检查普通小镇、演示岛、退出 / 继续、存档恢复与窗口尺寸变化。若编辑器导入或引擎编译报错，先处理错误再判定可运行。

### 方式二：独立的真实 Cocos 浏览器预览

`npm ci` 只安装项目源码检查依赖，不自动下载完整引擎、效果编译器或浏览器。此预览需要单独准备官方引擎和编译工具，版本与安装步骤见 [预览说明](scripts/preview/README.md)及 [预览工作流](.github/workflows/preview.yml)：

- Cocos 引擎提交：`411f98df047c25902f93440d4b22925c2fb65461`。
- Cocos CLI 提交：`723a5b6eb76cd9a1e740566bbbb62ae32ae081ef`。
- `COCOS_ENGINE`、`COCOS_CLI` 指向各自已安装依赖的源码目录；默认分别为 `temp/cocos-engine`、`temp/cocos-cli`。

准备完成后，在同一套环境变量下运行：

```sh
npm run preview:build
npm run preview:serve
```

默认产物目录 `build/preview/`，本机地址 `http://127.0.0.1:4178`。可用 `PREVIEW_OUT` 改变构建与服务目录，用 `TOWN_PREVIEW_PORT` 改变端口。服务只监听本机；新 clone 不包含忽略的 `build/` 产物，不能只执行 serve 就假定可玩。改源码后必须重新构建。

这是官方 Cocos 引擎运行项目启动代码的实验性预览，不是 HTML / Three.js 替代渲染器；它也不加载 Creator 的序列化场景来验证编辑器导入。上游引擎工具的完整依赖图尚未完全锁定。真实浏览器验收使用隔离存储、真实指针输入和只读检查，参见 `scripts/preview/capture.cjs` 与专题脚本。

### Web 与 Android 发布构建

在 Creator 构建面板将 `Main.scene` 设为启动场景，选择 Web Mobile / Web Desktop，生成后通过 HTTP 服务测试。Android 需另外配置该 Creator 版本支持的 SDK、NDK、JDK，再生成原生工程并构建 debug APK，安装到真实设备验证。

本仓库不含发布签名、平台凭据或 TapTap 接入。Creator 编辑器 Web 导出、Android 打包、真实手机触感、持续帧时、内存和发热均不能由 TypeScript 检查或桌面手机视口模拟代替。

[Creator 安装](https://docs.cocos.com/creator/3.8/manual/en/getting-started/install/) · [Android 构建](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/android/index.html) · [原生工具链](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/setup-native-development.html)

## 地形版本与 terrain6 接入边界

**当前源码接受 terrainVersion 1–6，默认普通小镇 / 演示岛仍为4。** 旧 v1–v5 规则、ID、资源和存档不因新实验改写，v5 两个入口保持独立。[v5 接入边界](docs/v5-integration.md) · [树木流式加载](docs/v5-tree-streaming.md)

terrain6 已从研究进入 `assets/scripts/`，入口名为 **自然挖填实验**，profile 为 `v6-preview`，独立 revision 是 `v6-natural-grass-edits-1`。自然山坡保留柔和形态，玩家挖填生成共同层面和规则竖直边界。

- **真实材料**：现有土 / 石按实际几何体积的 1/4096 份额结算，挖掘产生掉落，明确拾取入仓；填筑消耗选中的库存或地堆。混合层共享体积预算，不使用研究 token，也不沿用旧采土整格9份来给新体积定价。这仍是实验平衡。
- **天然坡可直接改造**：挖面低于全格，填面盖过全格，按实际缺口消耗材料，不暗中免费削高或垫低。编辑保护水岸、自然港、建筑、树和现有物品占用。
- **保存与旧档**：正式 v6 使用每格状态检查点，不是逐操作 journal；载入不重复发放材料。现有4百万JSON字符上限在 v6 命令提交前预检，超限保持原状态，但浏览器存储配额故障仍须单独处理。
- **画面与操作接入**：高地建筑 / 农田 / 树 / 掉落的实际高程、分块表面、拾取支撑、挖填触控路由及回家 / 缩放导航已有源码实现；远景不等于精细交互已就绪。
- **高差木桥**：v6 已接入宽 2 格、总长 7–16 格的跨河桥，两端各 2 格坡道保持在原栈桥占地内。桥面与桥桩按真实地形重建，不削平河岸；只接受满足高差 / 坡度限制的独立河段，拒绝海湖、已挖填 / 填海格及其他占用。装配、移动、转向和读档重新校验，旧 v5 桥规则不变。
- **明确未完成**：高差桥与全链路加载、同步步骤、极端档案内存和真机帧时仍未完成真实浏览器与设备验收。没有真实 Cocos / WebGL、GPU 或手机通过声明，也没有部署本次 terrain6。

当前功能、保存约束、性能与桥的限制见 [terrain6 接入状态](docs/terrain6-integration.md)。工作区旁的 `terrain-v5-lab/grass-relief/world6*` 仍保留独立历史实验，不随本仓库 clone 获取；它们的接口、离线图和旧测试结果不能替代当前集成源码验收。

## 架构与存档原则

`Main.scene` → `TownBootstrap` → `GameStart / TownProfiles` → `GameSession` → `domain/game.ts` 命令分发。`TownController / TownView / TownHUD` 负责输入和画面，`art` 提供运行时与 glTF 导出共用的模型配方。

- domain 保持确定性，不导入 Cocos、网络、定时器、DOM、随机源或直接存储 API。时间、状态和命令由外部传入。
- 表现层只提交命令，不直接修改库存、金币和建筑。失败命令保持原状态，成功命令发布新快照。
- 存档是带版本的纯数据，不保存引擎节点。导入视为不可信输入，校验版本、ID、数量、位置、任务和地形 revision。
- 损坏、未来版本或不兼容旧档先保留原字节，不静默清空；重置必须确认，并保留重置前备份。升级档案、手动栏位和多页面冲突保护见 [生产与存档规则](docs/new-production-routes.md)及[标题与存档](docs/start-and-saves.md)。
- 本地单机原型不含账号、广告、支付、服务器经济、跨设备同步或自动物流模拟。

完整源码导航、各模块职责、测试入口和生成目录说明见 [docs/code-tree.md](docs/code-tree.md)。

## 验证记录如何阅读

- [早期 CI 记录](docs/verification.md)只对应 `ec7ed6f5`：55 项测试、18 个模型，以及桌面 / 手机视口各 21 项真实 Cocos UI 检查。这些数字不是当前代码规模或新功能验收结果。
- [2026-11-03 融合与图鉴检查点](docs/checkpoint-fusion-2026-11-03.md)记录了当时本地 Windows 的真实 Cocos 鼠标与模拟触屏测试，仅覆盖该检查点。
- [terrain6 接入状态](docs/terrain6-integration.md)区分本次源码检查、尚未部署的实验和桥 / 性能限制；[当前预览说明](scripts/preview/README.md)保留 schema10、生产路线和木桥交互场景及环境限制。准备了脚本、构建成功、HTTP 字节一致和 CPU 渲染都不等于浏览器交互通过。
- 对当前源码的结论须关联同一份最终源码与本轮日志。未运行、阻塞、失败和通过应分别记录，不把旧报告中的通过结果沿用到新地形或新生产路线。

## 文档与资产入口

- [代码树与阅读路线](docs/code-tree.md)：当前文件布局、入口与测试分组。
- [新生产路线](docs/new-production-routes.md)、[堆肥 / 烤制 / 木桥设计](docs/compost-roast-bridge-design.md)、[交互入口](docs/new-production-routes-ui.md)。
- [交易设施](docs/commerce-mvp.md)、[农田升级](docs/farmland-upgrades.md)、[泥土扩地](docs/mud-expansion.md)、[配方图鉴](docs/recipe-handbook.md)。
- [美术资产](docs/art/README.md)、[共享建筑组件](docs/art/building-inheritance.md)、[地面产品模型](docs/art/ground-crop-piles.md)。

模型由可编辑 TypeScript 配方构造，运行时与 glTF 导出共用数据，不依赖尚未验证的 glTF 加载链。实际资产清单以 `art/exports/manifest.json` 为准。建筑复用房门、墙体、屋顶、箱体等组件；生成的概念图用于美术方向，接入的纹理是材质，不是自动图生 3D。未捆绑第三方付费模型包、商业品牌素材或凭据。

## 整合版预览

环境材质与后续地形/存档优化的整合顺序、数据边界和验证要求见 [整合预览说明](docs/integrated-preview-20261107.md)。新预览的 `provenance.json` 记录源码提交和应用/Worker/引擎校验值，不与旧素材预览混用。
