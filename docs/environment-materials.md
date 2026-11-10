# 水体、天空与地形材质

本轮在 Cocos Creator 3.8.8 原渲染器内实现，不替换引擎、不改地形权威几何、玩法、挖填材料结算、拾取或存档。

## 源码基线

从远端 `76526e0` 恢复的本地 `860bca5` 继续，已保留交互 `5280aa4`、FIFO 缓存 `5dc9a6d`、Worker 准备 `0d7d4e0` 与高桩桥 `860bca5`。本轮工作使用独立目录，没有覆盖其他工作区，也没有重复应用补丁。

## 已实现

- **土地与山体**：`TerrainMaterial` 使用官方 `builtin-standard.effect` 的标准光照、阴影和 PBR 路径，加入草、土、岩石和沙滩贴图。世界坐标三向投影支持天然坡面与挖填后的垂直切面，不要求原地形 UV。保持高粗糙度、非金属的清新哑光风格；岩层仅改变颜色，不移动顶点。
- **水体**：`town-stylized-water.effect` 使用双向波纹、轻量 Fresnel 天空色和稀疏水面亮纹。保留现有 CPU 水位/岸线/泡沫和 20 Hz 顶点更新，不增加 GPU 位移、透明水、深度采样、反射相机或额外绘制 pass。水面仍不透明，避免暴露未绘制的水下地形。
- **天空**：`TownSky` 接入官方 skybox 渲染队列和立方体，采用柔和蓝色渐变、暖色地平线、缓慢漂移的块状云。保留正交相机与 LDR/环境光配置，标题和游戏相机在天空可用时启用 SKYBOX 清屏，失败时保留纯色清屏。天空只出现在未被海面/地形覆盖的背景区域；没有为了展示天空改变游戏镜头。
- **资源生命周期**：四张地形图只共享上传一次；图像失败保留颜色 fallback，视图销毁不接收过期回调。Creator 在创建世界材质前异步加载 Effect，缺失时退回旧材质。预览在启动时编译注册同一份 Effect，不依赖 Creator 私有导入缓存。
- **预览构建**：`scripts/preview/effects.cjs` 新增三个环境 Effect 与完整名称 `pipeline/skybox`；`build.cjs` 复制实际环境图片。Creator 导出与独立网页预览仍须分开验收。

## 图像素材

`assets/resources/environment/{grass,soil,rock,sand}.png` 是本次用图像生成制作的四张独立 albedo，原样保留，不是从设定图截取。原尺寸均为 1254×1254 RGB。生成提示词见 `art/references/environment/terrain-texture-prompts.json`。另有环境设定图作为方向参考；设定图不等于实时游戏画面或可直接使用的 3D 模型。

图像不是 2 的幂尺寸，WebGL 1 路径使用 Shader 内 `fract` 配合 Clamp 和无 mipmap，不启用不合法的 Repeat。未来替换为 POT 图时可由 Cocos 开启 mipmap。当前纹理边缘虽低对比，仍须实际检查缩放时的重复、接缝与闪烁。

## 官方参考与许可

- [Cocos 3.8 材质/内置 Effect](https://docs.cocos.com/creator/3.8/manual/zh/shader/effect-builtin.html)
- [官方天空盒](https://docs.cocos.com/creator/3.8/manual/en/concepts/scene/skybox.html)
- [Cocos 水面反射教程](https://forum.cocosengine.org/t/tutorial-building-water-reflections-for-your-3d-games-in-cocos-creator/52583)
- 固定官方引擎：`411f98df047c25902f93440d4b22925c2fb65461`；CLI 编译器：`723a5b6eb76cd9a1e740566bbbb62ae32ae081ef`。
- `town-terrain.effect` 派生自该引擎的 `editor/assets/effects/builtin-standard.effect`；`town-sky.effect` 顶点投影参考 `pipeline/skybox.effect`，保留原版权说明。完整 MIT 文本见 [cocos-engine-MIT.txt](licenses/cocos-engine-MIT.txt)。
- 水面只参考教程的技术策略，代码为本项目轻量实现，没有复制教程纹理、模型或着色器。未引入付费商店素材。

## 性能成本

本轮是材质质量改动，不是已证明的性能优化。四张原图共享上传，按 RGBA8888 估算约 24 MiB GPU 纹理数据，不含解码图片、引擎缓存和其他资源。默认地形运行变体有 5 个活跃采样器（四类地面加阴影），常见单材质分支执行 3 次三向投影采样；材质交界可增加工作。无 mipmap 的远景重复纹理还可能闪烁，需真实镜头验收。

没有增加地形顶点、区块数量、动态网格上传频率或地形碰撞/拾取工作。水保持单个不透明 pass，没有反射摄像机、场景深度/颜色复制；天空增加官方立方体背景绘制与程序云计算。能否达到目标手机帧率须实机测量，不能用测试通过数代替。

## 验收边界

完整 `npm run check` 已通过 2167/2167 测试、官方 3.8.8 类型检查、结构/架构检查与 222 份规范 glTF 检查；`npm run demo:domain` 通过。最后的天空失败清屏回退另做 42/42 定向回归和官方类型检查，不重复全量长测。真实 Cocos EmptyDevice 水网格测试通过，但它不是 GPU 渲染。固定官方引擎加应用的独立预览构建完成。

本轮源码检查、构建与运行日志位于开发工作区 `build/environment-validation/`。构建产物不是 Creator 编辑器导出。桌面手机视口也不是 Android 实机。

云浏览器实际打开组合预览后报告 `Real WebGL required for official shader validation`，在官方着色器编译器初始化时阻塞。独立 Chromium 在启动阶段报告 `socket() failed: Operation not permitted`。因此不能宣称浏览器画面、硬件 GPU 渲染、实际手机帧率、发热或 Android 构建已通过。

额外使用真实 Mesa llvmpipe / EGL / OpenGL ES 软件驱动执行了固定官方编译器：32 次 Shader 编译与 16 次程序链接全部通过，另有 22 个 GLSL 100/300 材质运行宏变体全部通过。地形默认带阴影变体的活跃纹理采样器为草、土、岩石、沙与阴影图共5个。它验证的是 GLES 软件编译/链接，不替代 WebGL 浏览器行为、实际画面、硬件 GPU 或手机性能。官方标准 Shader 有保留在日志中的未初始化变量警告。

需要在有图形上下文的电脑执行 `npm run preview:build` 与 `npm run preview:serve`，检查标题、普通小镇、v5、terrain6；重点检查水面动画、天空、近远景重复纹理、挖填切面、分块接缝、树/建筑遮挡、退出返回和资源释放。再执行 Creator 3.8.8 Web 导出与 Android 真机验证。
