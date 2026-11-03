# Actual Cocos preview (experimental)

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
Schema8 uses the real TownProfiles, GameSession and storage adapters. It verifies
the source-controlled playable demonstration and a separate normal player town:
three crop production states, real elapsed timers, bulk orders, shop trades,
three/five-wood saw recipes, axe use, natural-shore shipments, durability,
profile switching, persistence and isolated resets. It takes about 30 seconds.
The script does not advance the clock or mutate gameplay state. Old-save cleanup
uses explicit synthetic storage fixtures and preserves unrelated keys. This does
not mean an actual user's browser storage has been accessed or erased.
Results are written to build/session-smoke.json only after success.

The old prototype saves are intentionally cleared on load, as requested. Legacy
migration smoke was removed; no migration-preservation work is part of this version.

## Browser verification

`node scripts/preview/capture.cjs` launches sandboxed Chromium with software WebGL,
renders real Cocos pixels, and fails on runtime errors or blank output. It now
invokes demo-interactions.cjs for current schema8 profile operations. The older
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
a water drop, and verifies actual GameSession collection events for harvests,
axe gains and returned saw surplus. These event assertions do not validate the
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
