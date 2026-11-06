# Production-route presentation integration

## Current controls

- Ground wood uses hammer at counts 1/2/3/4 for the board/crate/pier/house.
  Saw uses wood 3/4 for the cart/boat, and hammer uses stone 2 for the stone mill. The
  authoritative `toolCraftPlan` supplies both hover geometry and commit targets.
- For the stone oven, one hammer gesture explicitly touches a wood pile and a
  stone pile, then ends at the intended placement. It locks the first source of
  each kind, previews one unit of each graphically, and uses `mixedCraftPlan`.
  Whole-pile snapshots must still match on release. Only one unit from each
  selected source is consumed; leftovers remain in place. If either source
  still occupies the target, choose a clear target cell. Other piles and shared
  inventory are never substituted. After selecting both kinds the gesture never
  falls back to a single-material recipe. Cancellation clears the selection.
- Inventory or ground mud dropped on a crate attaches exactly one selected unit.
  A following hammer action creates the nursery; house+mud uses the same two-step
  flow for a residence. Tree seeds
  dropped on the nursery seed it. The watering can starts its saved growth job;
  the object controls collect the sapling. Saplings dropped onto clear ground
  plant a growing tree. Empty, seeded, growing, and ready nursery models differ.
- Mills and bakeries show input/output quantities and dispatch the shared
  processing recipes. Collection includes the exact saved job ID, so repeated
  releases and old buttons cannot collect the same batch twice.
- A transport warehouse exposes the selected item, quantity, and named
  destination before manually sending one cargo line. Shop delivery sells;
  dock delivery only stages cargo. The domain still validates the whole batch.
- Rice is available in crop purchase controls and the product rail. Its three
  world-growth stages, harvested piles, milled rice, flour, bread, and saplings
  have canonical assets and handbook representations.
- Old docks retain their original model and extension. New simple docks reuse
  the crafted wooden platform, crate, and intact notice board, and show the canonical pier extension
  only at a legal shoreline. Boats remain independently visible buildings;
  no speculative attached-boat placement extends the protected water corridor.

## Explicit physical goods and assemblies

Normal mining and sickle harvesting produce stable drop IDs at saved one-sixth-grid
positions. Actual rendered triangles provide support height, including depleted
natural patches, dry ridges, water beds and protected coastline. Moving a field
does not carry old drops with it. Drops have their own actual mesh picking and
occlusion; a sickle never silently picks them up.

Long-press drops to move directly to a clear ground cell or an identical pile/drop.
Ground piles can also merge into drops. Exact source and target snapshots protect
identity, quantity and position. Partial merges preserve the remainder at its
original position; blocked, full, mixed-item, changed or cancelled targets spend
nothing. Warehouse/sidebar return is an explicit pickup action, not a prerequisite.

A field box occupies a separately validated outside tile and follows all four
rotations without shifting crop cells. Only manual sickle harvesting fills its
independent saved stock; a full box preserves the mature crop. The model shows only
crop types actually inside it. Controls show used/capacity and bounded withdrawals.
Ground and box receipts pulse locally. Only confirmed inventory gains fly to the
sidebar, from the actual drop or outside box origin.

Building facilities combine through direct dragging. Building/object assemblies
use one hammer gesture across exactly the chosen entities, with immutable ID,
kind, coordinate and rotation snapshots. A valid pair cannot silently accept a
third substitute; pier+crate+board explicitly requires three. Graphical source
rings and result previews reveal no recipe text, spend nothing before release,
and clear on cancellation. Single-building warehouse expansion remains intact.

## Preservation and verification

The demo revision changes only the available template. Existing demonstration
and normal saves are not replaced automatically. Presentation code dispatches
commands and does not change inventory, currency, or building state directly.

`tests/drop-drag-ui.test.cjs`, `tests/loose-drop-presentation.test.cjs`,
`tests/entity-assembly-ui.test.cjs`, and `tests/surface-support.test.cjs` cover the
new exact-identity interactions and physical support.

`tests/new-route-presentation.test.cjs` verifies canonical mappings, input drag
routing, hammer target occlusion, nursery and processing collection lifecycles,
explicit transport cargo, rice purchase, and unchanged generated-image hashes.
Existing input, interruption, farming, handbook, and commerce tests remain in
place and now use the expanded route definitions. These are CPU/source tests,
not a Creator editor import, rendered browser review, Android build, phone
interaction test, or device-performance result.

The 2026-11-06 standalone preview build uses the actual pinned Cocos 3.8.8
engine and official CLI under `cocos-preview-tools`, and produces
`build/new-routes-review`. The sandboxed Chromium capture attempt stopped
before loading a page because its singleton socket was denied by the execution
environment (`Operation not permitted`). No browser screenshot or device pass
is claimed. Existing engine/runtime and shader checks remain part of the build.

The default demo view centers the projected extrema of nearby crop piles and
docks, instead of weighting the center by the number of piles. The two phone
viewports retain the existing 70-pixel sidebar clearance and minimum 10-pixel
crop-cell checks. Remote historical docks never move the landing view or saves.

## 木桥与隔离演示

标题页“木桥演示”使用独立 v5-bridge-demo 存档，保留其他小镇、演示岛与 v5 预览。镜头根据实际两座栈桥或已合成木桥聚焦，不依赖预设实体编号。

在真实河流两岸清理完整桥廊、摆好两座栈桥后，长按一端并拖至另一端即可直接合成。预览显示完整跨度，不收金币；合成后选择几何近岸保留的实体。起手来源与首次命中目标锁定完整坐标、类型、方向快照；改变后不会自动重选或换第三座栈桥。移动或旋转重新验证完整跨度，两端必须仍合法接岸。

模型完整保留两端原栈桥。桥面与干岸同高，原柱延长到真实河床下至少一厘米；水下续柱不会隔着不透明水面被单独选中。仅十种长度使用专属有界几何预算，旧建筑预算不变。CPU 几何与输入路由测试不等于浏览器、WebGL 或手机验收。
