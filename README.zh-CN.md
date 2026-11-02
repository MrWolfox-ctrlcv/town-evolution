# 小镇进化 Town Evolution

以 **Cocos Creator 3.8.8 + TypeScript** 实现的模块化建筑经营原型，目标是同一套业务规则支持网页与 Android 独立应用。

**玩法闭环**：种植蔬菜 → 收获入库 → 交付订单 → 建造或改造仓房 → 与制冷设施组合，解锁冷藏加工。

## 当前能验证什么

| 项目                             | 当前状态                      |
| -------------------------------- | ----------------------------- |
| 经营规则、事务与存档             | 已通过自动化测试              |
| Cocos 脚本 API 类型              | 已通过官方 3.8.8 类型声明检查 |
| 项目结构、场景脚本引用、模块依赖 | 已通过静态检查                |
| 编辑器预览、网页与 Android 构建  | 待安装 Creator 的环境验证     |
| 真机画面、触屏、性能             | 待实测                        |

GitHub Actions 运行源码检查，不把静态通过冒充实际游戏构建通过。工程没有用其他网页引擎替换 Cocos，也没有伪造 `cc` 类型。

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
- `assets/scenes/Main.scene`：启动场景。
- `tests/`：正常流程、失败不改状态、重复操作、离线返回、损坏存档与随机操作测试。
- `scripts/`：项目结构与架构检查、命令行规则演示。
- `docs/architecture.md`：规则与边界。
- `docs/verification.md`：后续编辑器、构建和真机验收表。

建筑家族通过共用主体和附件表达差异；首版只做明确配方，不做任意两两融合。初版是本地单机存档，不接账号、广告、支付、服务器经济或跨设备同步。

## 网页与 Android

在 Creator 构建面板选择 Web Mobile，加入 Main 场景并设为启动场景；产物通过 HTTP 服务访问。Android 则先配置该 Creator 版本要求的 SDK、NDK 与 JDK，再生成并构建原生工程，先测试 debug APK。

项目不包含发布签名密钥或平台凭据。TapTap 上架、SDK 接入和资质审核是之后的独立工作。

[Creator 安装说明](https://docs.cocos.com/creator/3.8/manual/en/getting-started/install/) · [Android 构建说明](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/android/index.html) · [English README](README.md)
