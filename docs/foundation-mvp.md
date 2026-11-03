# Tool and ground-product foundation

This slice implements only the agreed tree → wood and stacked wood → warehouse line. Other recipes and warehouse upgrades await design agreement. All prices and starting quantities below are prototype defaults.

## State and commands

- `ToolId` / `Tool`: `sickle`, `wateringCan`, `fertilizer`, `hammer`, `saw`, `axe`.
- `state.tools`: durability for five tools, remaining quantity for fertilizer. New towns start with 90 sickle durability, 10 durability for each other tool, and fertilizer quantity 5. Only sickle, axe and saw have implemented effects; others are visibly unavailable rather than fake actions.
- `Item` includes the three crops, preserved legacy chilled goods, wood and stone. Stone is a stored/tradeable product type only; no stone production recipe is invented here.
- `groundStacks`: one `{ x, z, item, amount }` per map tile. Amount is an integer from 1 to 5 and only one item type may occupy a tile. Map tiles are distinct from the nine planting subcells inside a farm.
- `trees`: `{ id, x, z }` one-tile natural objects, with a separate monotonic `nextTreeId`.

`dropProduct { item, x, z, quantity? }` moves inventory to an empty map tile or matching stack. `pickupProduct` reverses the transfer. Quantity defaults to one. Buildings and trees block ground stacking; other product types cannot mix. Warehouse capacity applies when returning products. Rejections preserve the original state, including quantities and IDs.

`useTool { tool: 'axe', treeId }` consumes one axe durability, removes one tree, and adds one wood to the right-side product inventory. The warehouse must have room before the action can succeed. It does not automatically prepare a construction stack: the player drags the harvested wood onto the ground.

`useTool { tool: 'saw', x, z }` consumes three wood from one ground stack and one saw durability, then constructs a free-of-coin-cost base warehouse with its 2×2 footprint anchored at that tile. The whole footprint must be in bounds and clear of buildings, trees and other product stacks. A stack of four or five wood is accepted: unused wood returns to inventory after checking the resulting capacity. Nothing is silently lost. Adjacent separate one-wood stacks do not count as a three-wood recipe.

Successful `harvestCell` consumes one sickle durability for that touched cell. Premature, repeated, full-storage and otherwise rejected harvests consume nothing and keep the crop job intact.

## Visible replenishment

`buyTool { tool }` costs 10 coins and adds 90 sickle durability or 10 axe/saw durability. Other tools are not offered for purchase before their effects are agreed. Each active tool has one explicit emergency replenishment: `recoverTool { tool }` is allowed only at zero durability with fewer than 10 coins, adds the same tool-specific refill amount, and consumes that tool's persisted recovery eligibility. No tool replenishes automatically on load or use.

`placeTree { x, z }` costs 5 coins and requires an empty tile. Trees yield one wood, while wood sells for 4 coins, so buying and chopping trees is not a direct currency arbitrage. Wood and stone can use existing immediate sale and shipment flows at 4 coins per unit; no material bulk orders or NPC material purchases are introduced.

## Current save and demo policy

Schema 8 uses one persisted `mapSeed` for a genuinely irregular natural island. Buildings, trees, piles, movement and dock shoreline checks use the same seed-dependent land mask as rendering. Saving/loading never places new trees, refills tools or relocates buildings. Every displayed resource tree is an actual axe target.

The user explicitly authorized deleting the old prototype test saves. The storage adapter clears only known game-owned keys when they contain old schema-1 through schema-7 test data. It does not call `localStorage.clear`, erase unrelated site data, discard schema-8 progress, or overwrite unknown future-version data. Current malformed saves retain the existing recovery/backup behavior.

The 24×24 bounding grid contains a seed-dependent rounded island with coves and a safe starter-town area, rather than a legacy-preserving L shape. New normal towns contain 24 deterministic usable trees. The maintained demo fixture uses its own fixed seed and feature layout, documented in `demo-island.md`.

## Sickle tuning

The original ten-use sickle nearly vanished after one nine-cell harvest. The revised prototype keeps the transparent one-successful-cell = one durability rule, but starts and refills at 90, enough for ten complete nine-cell farms. Failed, repeated, premature and full-storage attempts cost nothing. Current saves preserve the exact remaining durability, including zero; loading is not a repair action.

Ground crops count as recoverable planting supplies; putting the last seed on the ground cannot unlock an unnecessary emergency-seed grant. Dropping materials and making a warehouse never bypass building footprint checks. Moving a building onto trees, stacks or water is rejected atomically. When there is no trade facility, all construction and ground placement paths preserve a legal free tile for the public order board.

## 转向与地面搬运

建筑通过 `rotateBuilding` 顺时针循环四个朝向（0南、1东、2北、3西）；费用为零，原位置、编号、生产任务、库存和船运记录不变。每次转向重新验证完整占地；码头出口一整条边必须朝水面，不能为了转向改变陆地或搬走其他对象。当前 schema 8 支持四朝向，已有 0/1 存档继续正常读取。

地面产品长按搬运对应 `moveStack`，一次移动整堆，不经过仓库。落到同类产品时优先填满目标堆至5份，多余部分留在原格；目标已满、不同类、树木、建筑、水域或越界均拒绝，原产品和数量不变。移回原格不产生资源变化；取消手势不派发命令。

整堆拖到仓库或右侧产品栏触发 `pickupStack`：仓库目标验证其确实为仓房、扩容仓房或已有冷藏仓房，所有仓库共用库存容量，不创建各建筑的独立隐藏库存。容量足够时整堆入库；容量不足则整堆留在原地，不隐式部分回收。显式按数量取回的旧 `pickupProduct` 命令继续可用。
