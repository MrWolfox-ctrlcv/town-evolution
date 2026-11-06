# Actual Cocos preview (experimental)

## Schema10 development integration (not the published schema9 checkpoint)

Current scripts target schema10 and all 35 handbook entries. `compost-checkpoint.cjs`
adds real-pointer cancellation, explicit seed deposits, withdrawal of waiting inputs,
real 15-second compost and 10-second roasting waits, finite fertilizer tool quantities,
two-carrot-to-one-roasted-portion output and restart preservation. No state or clock
is injected. These browser scripts are prepared, not reported as passed.
The deployed owner-only v5 experimental package remains the separately frozen schema9
checkpoint; development changes here do not alter that bundle or user storage.

## 2026-11-06 schema9 checkpoint

The source verification gates include the domain and presentation tests, official
Cocos declarations, asset budgets and architecture checks. The schema9 standalone
preview is also built with the pinned official engine and CLI. These are separate
checks: neither proves browser rendering, Creator editor import, Android export or
device performance.

At this schema9 checkpoint, `demo-interactions.cjs` and `checkpoint-interactions.cjs`
were prepared for all 32 then-active handbook entries and hammer construction. The additional
`route-checkpoint.cjs` uses real pointer input for loose-drop merging/movement,
ordinary harvest left on the ground, manual field-box harvest/withdrawal, explicit
pickup, hammer object assembly, direct facility combination and reload. Inspection
is read-only; these scripts never inject inventory or invoke gameplay commands.
They must run in a graphics-capable environment before being called browser passes.

On 2026-11-06, the local-only server reported a successful listen, but the available
cloud browser returned `ERR_CONNECTION_REFUSED` for the local preview. A separate
command session could not reach it either. A same-session HTTP self-check returned
byte-identical index and app files, isolating the failure from the static preview
artifacts. No sandbox/network settings were changed
and no external deployment was used to work around the boundary. The earlier
sandboxed Chromium launch also stopped at `socket(): Operation not permitted`.

## 2026-11-03 Windows checkpoint

The fusion/handbook checkpoint has now been built and exercised locally on Windows
using actual Cocos pixels: desktop mouse 1280×800 and emulated touch 390×844 each
completed three rounds. See [the checkpoint record](../../docs/checkpoint-fusion-2026-11-03.md).
The AF_UNIX restriction described below belongs to an earlier execution environment.
This is still a standalone preview, not a Creator editor export or a physical-device test.

`npm run preview:build` rebuilds with the pinned engine/compiler checkouts below;
`npm run preview:serve` serves existing output at `http://127.0.0.1:4178`.
The handbook atlas is copied with the crop images. Browser capture now includes
`checkpoint-interactions.cjs`; a precise upstream non-cancelable touchcancel console
intervention is preserved in `browserWarnings`, while other console errors and page
exceptions still fail verification.

`node scripts/preview/crop-visual.cjs` uses an isolated Edge session against the local
preview server, buys wheat through the UI, sows all nine cells and waits for maturity.
It saves real close-up screenshots to `build/screenshots/crops-wheat.png` and
`crops-mixed.png`. `node scripts/preview/dock-visual.cjs` exercises the dock's rotation
control and checks shoreline legality, matching mesh/pier rotation, cargo and persistence.
These scripts do not edit the user's browser storage or inject game state.

This compiles official Cocos 3.8.8 and the real TownBootstrap dependencies.
It is not a mock renderer, Creator serialized-scene import, or Android build.
The native Cocos scene is assembled programmatically. Shader effects are compiled
by the official Cocos CLI effect compiler against original engine sources.

## Build

Set COCOS_ENGINE to the official engine checkout at commit
411f98df047c25902f93440d4b22925c2fb65461.
Set COCOS_CLI to the official CLI checkout at
723a5b6eb76cd9a1e740566bbbb62ae32ae081ef, and PREVIEW_OUT to an output directory.
Run `node scripts/preview/build.cjs`. Engine and compiler license notices are
included. All PNG assets under assets/resources/crop-icons are copied to
crop-icons/ for the actual Cocos image loader. Upstream dependency resolution
is not fully deterministic because the historical npm lock references unavailable
mirror binaries; engine/compiler source commits are pinned.

## Local application integration

Run `npm run build:domain && node scripts/preview/session-smoke.cjs`.
The current development runtime uses the real TownProfiles, GameSession and storage adapters. It verifies
the source-controlled playable demonstration and a separate normal player town:
compatible dry-field and rice production states, real elapsed timers, bulk orders, shop trades,
wood-and-hammer construction, explicit hammer entity assembly, axe use, natural-shore shipments, unlimited tool durability,
profile switching, persistence and isolated resets. It takes about 30 seconds.
The script does not advance the clock or inject gameplay inventory. Save-preservation
checks use explicit synthetic storage fixtures and leave unsupported saves untouched
until the test invokes an explicit reset. No actual user's browser storage is accessed.
Results are written to build/session-smoke.json only after success.

Unsupported prototype saves are never cleared on load. Existing version-8 saves
retain the original coastline and depleted resources; new islands use the expanded
seeded terrain. Explicit reset retains the original primary in a recovery key.

## Browser verification

`node scripts/preview/capture.cjs` launches sandboxed Chromium with software WebGL,
renders real Cocos pixels, and fails on runtime errors or blank output. It now
invokes demo-interactions.cjs for current schema10 profile operations. The older
whole-farm/cell/evolution suites remain historical helpers and are not invoked.
PREVIEW_TOOLS can select an isolated Playwright installation and
CHROMIUM_EXECUTABLE an installed browser; browser sandboxing remains enabled.

Current local execution cannot launch Chromium because AF_UNIX IPC sockets are
restricted. Browser rendering, visual correctness and gestures remain unverified.
Source checks, application tests, PNG validation, engine compilation and hosted
byte verification must not be described as a browser interaction pass. The
natural island uses seeded geometry and a playable domain land mask; the demo
uses a stable seed and preserves its own progress until explicitly reset.

The current real-time application smoke also issues all four building rotations,
checks crop-job/economy preservation, moves a ground stack and reloads it, rejects
a water drop, and verifies actual GameSession collection events for explicit drop pickups,
axe gains and returned construction surplus, while harvest itself stays on the ground. These event assertions do not validate the
rendered collection animation. Rotation/stack UI gestures and their visuals
still require browser testing in a graphics-capable execution environment.

Stack retrieval coverage lives in stack-session.cjs and runs within the main
session smoke. It uses real GameSession commands and the same StackDrop router
as the UI: partial merges conserve overflow, warehouse/products targets recover
whole piles, full capacity rejects atomically, and farm jobs remain unchanged.
This is command-routing verification, not a claim that pointer release through
the HUD has been exercised. CropMotion's rendered sway and growth animation
also remain unverified in a graphics-capable browser.

## Required Tween dependency regression

The standalone engine must include the official `tween` feature. Previously it
was omitted, leaving CollectionFlights with an undefined tween function after
activating a pooled icon. The build now validates the actual SystemJS exports
with verify-engine.cjs. Bootstrap also fails immediately when runtime Tween
exports or the registered TweenSystem are missing.

`node scripts/preview/tween-smoke.cjs` loads the actual compiled cc.js through
SystemJS under standard jsdom, triggers the official Director initialization
listener, and executes real TweenSystem ticks. It verifies intermediate progress,
onUpdate, one completion callback, and cancellation. jsdom's missing canvas
methods are recorded; this test does not create WebGL or claim visible animation.
The helper needs jsdom 26.1.0 in PREVIEW_TOOLS (default COCOS_ENGINE). CI runs this
before browser capture and preserves build/tween-smoke.json as evidence.

### 地面物品与浮动详情卡验收

构建预览并启动本地服务后运行 `node scripts/preview/ground-visual.cjs`。脚本在隔离Edge中实际打开/关闭工具卡、从库存拖出四种产品、形成三份堆叠、缩放检查模型并点击取回石料，验证菜单不改变地图视野。截图输出到 `build/screenshots/ground-products.png`，不会改写用户浏览器的存档。

### 透明底部操作与警告验收

`node scripts/preview/bottom-ui.cjs` 使用真实鼠标/触摸检查桌面、手机及小横屏的图标资源、弹出动画、关闭恢复和镜头稳定，截图为 `bottom-*-dock.png` / `bottom-*-tools.png`。测试按帧只读记录动画状态，不调用游戏内部操作。

旧版满仓停割截图用例尚待按 schema9 的落地规则更新，不能用于当前验收。旧入口为设置 `HARVEST_CHECK=1`、`HARVEST_TOUCH=1` 后运行 `node scripts/preview/crop-visual.cjs`，同时检查满仓停止收割、无限耐久计数不变、警告持续显示至少5秒及手机显示。截图为 `warehouse-full-warning.png` 和 `warehouse-full-warning-phone.png`。

### Live demo-island title acceptance

`capture.cjs` now runs `title-interactions.cjs` before normal demo interactions. It checks
actual Cocos meshes, camera drift and crop sway; unchanged template/growth/storage;
handbook close, save/exit/back, lock-waiting tabs, repeated start/exit/cancel and teardown.
No title PNG is copied or loaded. Expected evidence is `*-live-title.png/json`.
The 2026-11-05 local sandboxed Chromium launch failed at AF_UNIX `socket()` before any
page rendering. These added browser scenarios are prepared, not recorded as passed.

### Isolated mountain and one-unit model review

`?art-review=terrain` shows the current generated mountain in the actual Cocos
renderer, `&terrain-version=2` shows the retained legacy layout with current
surface art, and `&terrain-unit=1` shows three views of the same exported rock unit.
These views create disposable state; they do not read browser saves or require a
reset. Drag rotates and the wheel zooms. Compare the cut silhouettes, coherent
moss caps, pale crowns, and the complete soil walls beside cut rock faces.

The 2026-11-05 CPU mesh inspection in Blender checks the actual runtime geometry
and vertex colors independently. Those renders are mesh evidence, not Cocos
screenshots or browser interaction passes. The sandboxed Chromium attempt still
failed at `socket()` before page rendering; actual browser/mobile visual QA
remains a separate gate.

### Prepared wooden-bridge acceptance

`bridge-checkpoint.cjs` is a prepared real-pointer module for a fresh isolated browser
context after entering a game. It returns to the title, opens **木桥演示**, waits for
terrain publication, reverse-drags the two real river-bank piers, verifies no coin
or inventory charge, rejects an invalid turn, reloads the saved bridge, and checks
all other profile bytes. The shared read-only UI inspector now resolves both
versioned v5 namespaces. The module is not recorded as executed: use the actual
Cocos build in an authorized graphics environment, and preserve screenshots and
console errors separately from the CPU routing tests.
