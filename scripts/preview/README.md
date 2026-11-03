# Actual Cocos preview (experimental)

This compiles official Cocos 3.8.8 and the real `TownBootstrap` dependencies.
It is not a mock renderer, a Creator serialized-scene import, an Android build,
or production deployment. The native Cocos scene is assembled programmatically.
The pinned official Cocos CLI effect compiler compiles the original engine effect
and chunk files; its shader checker uses a real browser WebGL context. Engine
offline mappings and enum definitions come from the same 3.8.8 source, not stubs.

The `Actual Cocos browser preview` workflow builds the engine from pinned commit
`411f98df047c25902f93440d4b22925c2fb65461`, then attempts desktop and mobile-viewport
screenshots with Chromium software WebGL. It fails on runtime errors, failure to
draw five frames, or a nearly blank canvas. Screenshots with `FAILED` in the name
are diagnostics, not evidence that gameplay works. Mobile viewport is not an
Android/device test. Engine and third-party license notices accompany artifacts.

The cloud browser lacked WebGL. The first CI run revealed shader metadata fixtures
contain no GLSL, so this now uses the official shader compiler instead.
Actual desktop (1280×800) and mobile-viewport (390×844) rendering passed on
2026-11-02 in [run 41548595739](https://github.com/MrWolfox-ctrlcv/town-evolution/actions/runs/41548595739)
at commit `dea0850be727a0ee2fa3b1579b6cf4e4fb757ee8`: both captured visible
buildings, terrain and Chinese HUD with zero runtime errors.

The render smoke test is extended with real mouse/touch input:
select farm, schedule crop, reject repeated early collection, reload during the
real timer, harvest, sell, reject duplicate sale, cancel construction/reset and
reload persistent progress. It reads rendered Cocos node coordinates and saved
state but never calls game commands directly, mutates game state or warps time.
Interaction verification passed for both desktop mouse and mobile touch in
[run 41549746130](https://github.com/MrWolfox-ctrlcv/town-evolution/actions/runs/41549746130)
on 2026-11-03 at commit `ee37cf7227b6fcff0f2b765741818bd037af8f46`.
Both completed with 144 coins, one completed order, zero vegetables and no
runtime console errors. The run also contains updated initial and after-play
screenshots. Native Android and Creator serialized-scene import remain untested.

For local development, set `COCOS_ENGINE` to that official engine checkout with
its npm dependencies plus esbuild 0.28.2, systemjs 6.15.1, playwright 1.56.1 and
pngjs 7.0.0, glsl-tokenizer 2.1.5, glsl-parser 2.0.1 and js-yaml 4.1.0 installed.
Set `COCOS_CLI` to official cocos/cocos-cli commit
`723a5b6eb76cd9a1e740566bbbb62ae32ae081ef`. `node scripts/preview/build.cjs` writes `build/preview`.
`node scripts/preview/capture.cjs` requires a working Chromium installation and
browser sandbox. Generated engine/dependencies/artifacts must stay uncommitted.

The upstream engine lock contains stale mirror downloads, so CI resolves engine
dependencies afresh. Engine source and preview tools are pinned; the entire
transitive dependency graph is not yet reproducibly locked. Do not call this a
release build or supply-chain-hardened pipeline.

## Evolution coverage (verified)

The extended test clicks through adjacent cooler placement with a preview that
does not spend, confirmed construction, warehouse/cooler combination preserving
the warehouse ID, another real crop cycle, cold processing across reload, chilled
order payment and restored cold-warehouse state. A confirmed new-town flow then
tests the alternative one-time expansion branch, 32-unit capacity and reload.
Both mouse and touch paths run with no command calls, saved-state injection or
clock acceleration. All 11 evolution checks passed for both mouse and touch in
[run 41551677432](https://github.com/MrWolfox-ctrlcv/town-evolution/actions/runs/41551677432)
on 2026-11-03, commit `ec7ed6f5edecd3a7784643d15f2fdde311d1ea80`.
Together with the original ten checks, this is 21 real UI checks per input path.
Cold-order results: 108 coins, two completed orders, two vegetables and the
original warehouse ID retained as a cold warehouse. The separate reset/expansion
branch restored 80 coins and 32-unit storage after reload. Both runs reported
zero runtime errors and produced seedling, ready-crop, combined, cold-order and
expanded screenshots using the real vertex-colored asset kit. Source validation
also passed 55 unit tests and canonical 18-asset glTF checks for this commit.
