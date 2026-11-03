# 小镇进化 Town Evolution

以 **Cocos Creator 3.8.8 + TypeScript** 实现的模块化建筑经营原型，目标是同一套业务规则支持网页与 Android 独立应用。

**玩法闭环**：种植蔬菜 → 收获入库 → 交付订单 → 建造或改造仓房 → 与制冷设施组合，解锁冷藏加工。

## 当前验证状态

以下结果对应提交 [`ec7ed6f5`](https://github.com/MrWolfox-ctrlcv/town-evolution/commit/ec7ed6f5edecd3a7784643d15f2fdde311d1ea80)，不是对后续任意提交的保证。

| 项目                                        | 当前状态                                         |
| ------------------------------------------- | ------------------------------------------------ |
| 经营规则、存档、布局与美术数据              | 55 项单元测试通过                                |
| Cocos API、场景引用与模块依赖               | 官方 3.8.8 类型声明及静态检查通过                |
| 实际 Cocos 浏览器渲染                       | 桌面 1280×800、手机视口 390×844 已渲染并检查截图 |
| 鼠标与模拟触屏操作                          | 每种输入 21 项实际 UI 检查通过，无运行时错误     |
| 18 个 glTF 模型                             | 与规范配方一致；独立 Khronos 格式校验无报告问题  |
| Creator 导入、编辑器 Web 导出、Android 构建 | 未验证                                           |
| 真实手机触感、帧率、内存与发热              | 未验证                                           |

[源码 CI](https://github.com/MrWolfox-ctrlcv/town-evolution/actions/runs/41551677460) · [实际渲染与交互 CI](https://github.com/MrWolfox-ctrlcv/town-evolution/actions/runs/41551677432) · [完整验收记录](docs/verification.md)

实际预览由官方 Cocos 引擎与本项目启动代码构建，**不是其他网页引擎替代品**。它是独立的实验性浏览器预览，不等同于 Creator 对序列化场景的导入或正式发布构建。复现方式见 [预览说明](scripts/preview/README.md)。

## 快速检查源码

需要 Node.js 22 或更新版本：

```sh
npm ci --ignore-scripts
npm run check
npm run demo:domain
```

`check` 检查业务类型、官方 Cocos API 类型、测试、场景引用、依赖方向与循环依赖。`demo:domain` 演示完整业务操作，不渲染画面。

## 用 Creator 打开试玩

1. 在 Windows 或 macOS 安装 **Cocos Creator 3.8.8**。
2. 将本仓库根目录作为现有项目导入，等待脚本与资源导入结束。
3. 打开 `assets/scenes/Main.scene`，点击预览。场景里的启动组件会生成低模建筑、地图和原生 UI，无需手工摆放每个模型。
4. 选择初始菜地开始生产，15 秒后领取，再交付蔬菜订单。
5. 在基础仓房边缘相邻的位置建一个制冷设施，选仓房进行组合；冷藏库可以把 2 份蔬菜加工成 2 份冷藏菜，耗时 10 秒。
6. 测试存档恢复、满仓提示、重复领取以及网页与手机不同窗口尺寸。

操作设计采用建造预览与确认，经营操作集中在所选建筑的面板；地图可拖动和缩放。最终触屏手感仍需真机检验。

初始提供 120 金币、一个基础仓房和一块菜地。基础仓房容量 16；扩容改造后容量 32。冷藏分支不额外增加容量，而是增加加工能力。数字是短时试玩参数，不是最终运营数值。

## 工程结构

- `assets/scripts/domain/`：纯 TypeScript 规则、配置、网格关系、事务和存档校验。
- `assets/scripts/domain/actions/`：建造改造、生产领取、订单三个独立业务模块。
- `assets/scripts/application/`：可独立测试的会话管理、时钟与存储注入、横竖屏布局计算。
- `assets/scripts/presentation/`：Cocos 启动协调、UI、镜头输入、低模模型与增量场景同步。
- `assets/scripts/art/`：运行时与导出共用的规范模型配方、调色板和网格编译器。
- `art/exports/`：18 个独立 glTF 模型及尺寸、三角形数量等清单。
- `assets/scenes/Main.scene`：启动场景。
- `tests/`：正常流程、失败不改状态、重复操作、离线返回、损坏存档与随机操作测试。
- `scripts/`：项目结构与架构检查、命令行规则演示。
- `docs/architecture.md`：规则与边界。
- `docs/verification.md`：已完成的源码与浏览器验证，以及待完成的编辑器、构建和真机验收表。

建筑家族通过共用主体和附件表达差异；首版只做明确配方，不做任意两两融合。初版是本地单机存档，不接账号、广告、支付、服务器经济或跨设备同步。

## 模型资产

仓房三种形态、制冷设施、三种菜地阶段、环境道具与建筑模块共 18 个 glTF 资产，由可编辑 TypeScript 配方生成。运行时直接使用同一配方，不依赖未验证的 glTF 加载流程。`npm run art:export` 重新导出，`npm run art:check` 检查导出与规范配方完全一致；模型范围与复用方式见[美术说明](docs/art/README.md)。

## 网页与 Android

在 Creator 构建面板选择 Web Mobile，加入 Main 场景并设为启动场景；产物通过 HTTP 服务访问。Android 则先配置该 Creator 版本要求的 SDK、NDK 与 JDK，再生成并构建原生工程，先测试 debug APK。

项目不包含发布签名密钥或平台凭据。TapTap 上架、SDK 接入和资质审核是之后的独立工作。

[Creator 安装说明](https://docs.cocos.com/creator/3.8/manual/en/getting-started/install/) · [Android 构建说明](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/android/index.html) · [English README](README.md)
