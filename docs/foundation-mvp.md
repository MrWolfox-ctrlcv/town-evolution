# Tool and ground-product foundation

This slice implements tree → two wood + two tree seeds; exact wood stacks of one/two/four + saw → order board/crate/house; house + crate/order board → warehouse/shop; and mounted wood + hammer → expanded warehouse. Durable tools temporarily have unlimited uses. Material requirements and other gameplay checks still apply.

## State and commands

- `ToolId` / `Tool`: `sickle`, `wateringCan`, `fertilizer`, `hammer`, `saw`, `axe`, `diggingTool`.
- `state.tools`: finite legacy durability counters for durable tools, remaining quantity for fertilizer. Existing counters and recovery flags are preserved exactly for save compatibility; they are not rewritten to JavaScript `Infinity`. New towns retain the legacy defaults of 90 for the sickle, 10 for other durable tools and fertilizer quantity 5. The temporary `UNLIMITED_TOOL_DURABILITY` policy makes durable tools display ∞ and ignore wear, even when an older counter is zero. Fertilizer remains finite. Sickle, axe, saw, hammer, digging tool and watering can have implemented effects; fertilizer remains unavailable.
- `Item` includes the three crops, preserved legacy chilled goods, wood, stone, soil, mud and tree seeds. Soil and mud are different materials. Tree seeds can be stored, stacked and mounted, but no planting or trading behavior is inferred.
- `groundStacks`: one `{ x, z, item, amount }` per map tile. Amount is a positive integer, capped by `stackLimitFor(item)`: wood/stone 6, mud 9, the three crops 10 and other items 5 and only one item type may occupy a tile. Map tiles are distinct from the nine planting subcells inside a farm.
- `trees`: `{ id, x, z }` one-tile natural objects, with a separate monotonic `nextTreeId`.

`dropProduct { item, x, z, quantity? }` moves inventory to an empty map tile or matching stack. `pickupProduct` reverses the transfer. Quantity defaults to one. Buildings and trees block ground stacking; other product types cannot mix. Warehouse capacity applies when returning products. Rejections preserve the original state, including quantities and IDs.

`useTool { tool: 'axe', treeId }` preserves axe durability, removes one tree, and adds two wood and two tree seeds to the right-side product inventory. The warehouse must have room for all four outputs before the action can succeed. It does not automatically prepare a construction stack: the player drags the harvested wood onto the ground.

`useTool { tool: 'saw', x, z }` accepts exactly one, two or four wood from one ground stack. These construct an order board (1×1), crate (1×1) or house (2×2). Three, five and six wood do not silently choose a different recipe. The full footprint must be in bounds and clear of buildings, trees, natural resource blocks and other stacks. No currency or durable-tool counters are consumed.

`dragMerge { sourceId, targetId }` accepts house + crate → warehouse (16 capacity) and house + order board → shop, in either drag direction. The house keeps its ID, position and rotation; the addition is consumed. Both mounted stocks are preserved, up to the unchanged five-unit attachment cap. Overflow rejects the whole action. A new shop receives the same standard crop stock as other shops. Repeated commands, previews and failed merges never consume resources or add discoveries.

Successful `harvestCell` yields the crop without changing the saved sickle durability. Premature, repeated, full-storage and otherwise rejected harvests consume nothing and keep the crop job intact. A hammer expansion still consumes exactly two mounted wood but does not consume hammer durability.

## Paused replenishment

`buyTool { tool }` and `recoverTool { tool }` are rejected while tools have unlimited durability. Neither command spends coins, changes counters nor consumes emergency eligibility. The tool menu hides replenishment, and a stale open replenishment panel shows the unlimited policy with a close action. The old refill amounts and recovery data remain in place for compatibility if durability is reintroduced later. No tool replenishes automatically on load or use.

`placeTree { x, z }` is a retained legacy command costing 5 coins and requiring an empty tile. No new tree-planting behavior is assigned to tree seeds. Material buying remains disabled; ordinary wood/stone selling and shipping retain existing prices. Tree seeds are rejected by shop, bulk-order and dock commands rather than assigned an invented price.

## Current save and demo policy

Schema 8 uses one persisted `mapSeed` for a genuinely irregular natural island. Buildings, trees, piles, movement and dock shoreline checks use the same seed-dependent land mask as rendering. Saving/loading never places new trees, refills tools or relocates buildings. Every displayed resource tree is an actual axe target.

Loading never clears old or malformed saves. Unsupported old versions remain in the existing recovery flow until the player explicitly resets with a backup. Current schema-8 progress remains intact; absent `treeSeed` stock fields migrate to zero, while invalid values reject.

New towns use the 40×40 procedural island with 64 deterministic trees and saved terrain version 2. Existing terrain-version-1 towns preserve their original mask. The maintained demo fixture uses a fixed seed and actual one/two/four-wood recipe piles, documented in `demo-island.md`.

## Temporary unlimited-use policy

All active durable tools can now be used repeatedly without wear. Sweeping nine mature farm cells preserves the entire saved sickle counter, and clearing more trees than an old axe counter also works. Zero, one and maximum valid saved counters all remain unchanged by use. Current saves preserve their exact counters and recovery flags, including zero; loading is not a repair action and does not clear or replace town progress. Strict validation still rejects malformed tool values. Fertilizer quantities are not promoted to unlimited resources.

Ground crops count as recoverable planting supplies; putting the last seed on the ground cannot unlock an unnecessary emergency-seed grant. Dropping materials and making a warehouse never bypass building footprint checks. Moving a building onto trees, stacks or water is rejected atomically. When there is no trade facility, all construction and ground placement paths preserve a legal free tile for the public order board.

## 转向与地面搬运

建筑通过 `rotateBuilding` 顺时针循环四个朝向（0南、1东、2北、3西）；费用为零，原位置、编号、生产任务、库存和船运记录不变。每次转向重新验证完整占地；码头出口一整条边必须朝水面，不能为了转向改变陆地或搬走其他对象。当前 schema 8 支持四朝向，已有 0/1 存档继续正常读取。

地面产品长按搬运对应 `moveStack`，一次移动整堆，不经过仓库。落到同类产品时优先填满目标堆至该物品上限（木材、石料6份；泥土9份；三种作物10份；其余5份），多余部分留在原格；目标已满、不同类、树木、建筑、水域或越界均拒绝，原产品和数量不变；完整泥土堆拖到合法岸边水格的扩地配方例外。移回原格不产生资源变化；取消手势不派发命令。

整堆拖到仓库或左右任一侧栏触发 `pickupStack`：两侧可见图标和翻页控件都接收胡萝卜、小麦、生菜、木材、石料及旧档冷藏蔬菜；隐藏控件不接收。仓库目标验证其确实为仓房、扩容仓房或已有冷藏仓房，所有仓库共用库存容量，不创建各建筑的独立隐藏库存。容量足够时整堆入库；容量不足则整堆留在原地，不隐式部分回收。显式按数量取回的旧 `pickupProduct` 命令继续可用。

侧栏库存图标和工具开始拖动时没有预先扣除资源，拖回左右任一侧只结束手势并清理高亮，不派发收取或使用命令。工具继续保存在 `tools`，产品继续保存在 `inventory`；不重复增加数量，也不撤销已经成功执行的播种或收割。重复释放、取消后释放及非当前指针的释放不能再提交命令。建筑不属于此回收范围。

`tests/tray-return.test.cjs` 覆盖两侧命中与高亮、六类产品回收及满仓原子拒绝、存档往返、工具无复制、播种后返回和重复/取消释放。这是隔离的交互路由与领域测试，不是浏览器鼠标/触摸或真实 Cocos 渲染验收。

## 播种的作物遮挡

播种只查询一遍已渲染建筑和作物的真实三角面，直接从命中的渲染节点识别作物所属小格，并读取当前旋转、缩放和摆动变换。同深度时保留作物优先，只有更靠前的表面才遮挡。碰到已有作物时提示该格已经种植，不穿过作物扣料种到后方空格；真实网格之间的空隙仍能命中可见土面。建筑、树木、地堆和自然资源继续按前后遮挡关系处理。收割保留原有的作物范围命中，快速划动仍通过路径采样逐格处理。

`tests/planting-occlusion.test.cjs` 使用真实输入路由、标准作物网格和存档逻辑，覆盖三种作物、大小田及四个转向，检查拒绝操作不改库存或存档，并回归快速播种/收割、空隙、遮挡与取消。大小田四个朝向另有批末刷新专测：一批高速采样期间不重建显示，播种/收割逐条保存且数量守恒，批末才同步。密集 6×6 田和另一建筑的四类路径使用实际 `ModelPicking` / `MeshSurface` 计数，保护每个渲染图元每次采样只查询一次；`tests/model-picking-identity.test.cjs` 检查节点身份、等深度优先、动态变换、不可见对象和多图元查询。以上测试不是 GPU 渲染或设备验收。

## Farmland and mud additions

The digging tool also creates a small field on clear land; three L-shaped small fields merge into one large field. Watering turns either field size into a water field while preserving every planted job. See [farmland rules](farmland-upgrades.md).

Watering explicitly selected soil piles consumes nine soil and places one mud, preserving the last pile’s surplus. Nine mud reclaim one adjacent water tile; one mud plus a basic house creates a residence in place. The model conveys mud’s full-stack land cue without recipe-limit text. Reclaimed tiles are saved additively and cannot block a dock. See [mud and land rules](mud-expansion.md).

## 顶部资源栏的拖拽遮挡

金币和仓储数值所在的 Summary 只按当前可见矩形阻挡地图操作，不封住整条顶部空白。普通触摸和已捕获的播种、收割、工具及建筑/地堆拖放共用该遮挡；进入栏内会清除可用投放目标，回到地图后可以继续，取消和窗口重排不会提交旧目标。

`tests/summary-occlusion.test.cjs` 使用生产 HUD 布局、地图触摸捕获、交互命令及存档逻辑，覆盖手机/平板/桌面横竖屏、DPR 1/2/3、矩形边界、挖地/挖石/挖土及连续拖放。界面坐标和引擎显示由窄协作者隔离，这不是 GPU 或手机实机验收。

## 隐藏侧栏时保留收集飞入

收集反馈按已提交的库存增量产生，不重新执行收集命令。小屏底部面板暂时隐藏侧栏时，飞入事件保留在当前界面的待播队列；对应物品图标或分页入口确实处于活动层级后才开播，不使用猜测的屏幕坐标。起点保留收集事件当时的实际屏幕换算结果，终点每帧读取当前可用节点，支持侧栏翻页和重新布局。

已开始的图标在目标隐藏期间暂停并隐藏，目标恢复后继续；最多24个同时播放，最多96条待播。不同物品按最近服务次序轮转，满池时隐藏图标让出节点并保留实际起点和播放进度，避免其他可见物品被饿死；正常可见的动画不被抢占。超过待播上限时只合并同类视觉批次并保留最新真实起点，不合并或修改已提交库存。只有条目从可展示列表移除（例如旧冷藏菜全部重新装船）连续30秒后，旧视觉反馈才过期；只是栏或父节点暂时隐藏则继续保留。每帧同类目标只查询一次，等待量和查询成本都有界。运动和脉冲仍为0.52、0.10、0.14秒，每帧推进有上限以免后台恢复时一帧跳完。界面销毁、切换存档/小镇以及成功的原地重置清空待播与播放中图标；重置被拒绝时不清掉原界面的反馈。所有队列、时钟和节点操作只属于表现层。

`tests/collection-feedback-ui.test.cjs` 覆盖小屏/桌面的整堆拖仓库、购买、砍树、采石、收获和拒绝/重复操作；`tests/collection-flight-lifecycle.test.cjs` 覆盖排队、真实终点恢复、位置变化、隐藏暂停、池/待播容量、公平调度、不可达目标过期、长时间暂隐、异常释放、销毁与重置；旧档冷藏菜反复卸货/装船的生产路由另验证普通木材反馈不饥饿，动画不写库存或存档。测试使用生产回调链和窄引擎协作者，不能替代浏览器、Cocos渲染或设备验收。
