# Terrain 6 development snapshot

Status: **work in progress, not a completed or released terrain experience**.

This snapshot was frozen on 2026-11-06 at 09:01 UTC, on top of GitHub main
`fd7ed12ffbf049922a226a0307cedb8831582b70`. It preserves the v5 cross-runtime CI
fix and contains the current terrain 6 domain, save/material/edit rules,
application integration, surface rendering, controls, and compatibility tests.
Independent sibling lab experiments and generated build directories are excluded.

Known unfinished work at this exact snapshot:

- The far-tree visibility callback is not yet connected in TownView; fallback
  behavior can leave distant trees invisible.
- The final BuildingGroundReady and TownFarmPicking additions were saved but had
  not yet been compiled or tested when the snapshot was frozen.
- Terrain 6 bridge construction remains behind its safety gate. The independent
  piled-bridge prototype is not part of this production source snapshot.
- Final terrain 6 integration, whole-project acceptance, real Cocos visuals,
  device behavior, and performance validation are not complete.

The successful CI on `fd7ed12` applies to the previous source, not this snapshot.
The new commit's GitHub Actions result must be checked separately. A source CI
pass alone does not prove a Cocos build, visual acceptance, or device performance.
Work continued after freezing; later edits are not included in this snapshot.

## 2026-11-10：加载预算与渲染帧解耦（待新一轮实机复测）

独立正式包采样中，桌面 60 帧间隔 P50 约 165 ms，手机视口约 79 ms；两者均为 Chromium SwiftShader 软件渲染，不能作为真实桌面或手机硬件 FPS。页面 CPU 采样不包含 GPU 或其他进程/worker，不能凭 idle 占比判断唯一瓶颈。

回家后显示的 `196` 是整岛远景分块驻留请求数，不是重复网络下载。此次桌面记录中局部 `homeReady=true`，但旧状态仍显示 `overview 3/196`。现局部 `detail/ready` 按当前需要的精细块逐块判断，全岛是否完成仍由独立的 `overviewComplete` 如实表达。

已确认加载调度浪费：CPU 地形构建原本每个渲染帧仅获得 3 ms，在 165 ms 的帧间隔下加载预算被慢帧率一起拖慢。现在增加可取消的协作预构建：每片最多 512 步/3 ms，片间至少让出事件循环 4 ms，最多准备一个待发布事务即停。GPU 上传、支撑面、拾取和提交仍在原渲染更新中按原子组执行；旧表面在事务发布前保持不变。地形编辑/切换和销毁取消旧调度，错误交回现有安全失败路径。未减小地图、修改 LOD/画质或放宽验收时限。

回归覆盖无渲染帧时 CPU 仍可准备真实事务、准备期间不发布、一个事务背压、取消、错误以及局部/全岛状态区分。调度修改后的 `profile-d449` 实测：手机帧间隔 P50 151 ms / 160 draw calls，桌面 421 ms / 160 draw calls，均为 SwiftShader。流式发布的内容更多、负载更高，不可用两次整体 P50 直接归因；目前仍未达到流畅。

后续新增未建网格的候选块保守界：复用已生成的每格 groundRange 与矿层 ceiling，按需汇总并缓存，加一格邻接范围和编辑/填充层上界；海岸基础平面与切壁也包含在界内。使用原有含阴影延展的视锥判断，只减少明确不可见的精细块请求，不改变全岛远景、LOD 或模型质量。含树、建筑占地、地面物品的块，以及缺少权威metadata的块仍保守保留，不额外编译对象模型。该候选块优化尚待新实机验收。

### 拖地图与长按抬物竞争

`3e3` 验收手机失败时目标地形已 12/12 就绪，等待的是目标无遮挡，而非地形没加载；连续尝试平移后相机仍在原位置。已通过鼠标/触摸逻辑回归复现另一确定问题：按下后 400 ms 内已经移动 5 px，但尚未越过 12 px 平移阈值，原逻辑仍会被长按轮询切为拖物。

最小修复是在长按成立前位移超过 4 px 时取消本次抬物候选，保留原 12 px 平移阈值；静止或不超过 4 px 的抖动仍可在 400 ms 抬物。移回原点不重新启用长按。此处修复的是已证实的逻辑竞争，**是否解决上述实机失败仍待复验**，未修改验收预算或绕过真实指针输入。

## 2026-11-10 实际验收与重复资产实例化

- `ef3e1f2` 的桌面/手机真实 V6 挖掘、落地、手动拾取、俯视填地、视角恢复与存档重载均通过；标题、设置和档位场景也通过。连续三轮合成仍在第一轮 360 秒预算内未完成，不能标为全通过。
- `dc88a43` 仅对 AssetRenderer 重复房屋、作物等启用 Cocos 官方 GPU instancing；普通材质和实例材质资源池分离，地形、已合批树块、水体与 LOD 未改变。
- 两端真实 WebGL 采样实例计数由 0 变为 6，房屋和田地区域与前版截图像素一致；V6 等八个功能场景通过。连续合成仍超时，尚未证明该路径全部正确。
- 软件渲染 home 场景重复资产少，整体提交仍约 178–181 draw calls。各版采样时正在流式加载，驻留网格不同，不可用帧时间差宣称优化收益，更不能代表用户硬件帧率。
- 试玩 Site 与 GitHub 是独立发布目的地：GitHub 推送成功不代表既有私人试玩 URL 已更新，交付时必须核对实际部署版本。
