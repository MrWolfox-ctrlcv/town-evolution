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

The next validation extends that render smoke test with real mouse/touch input:
select farm, schedule crop, reject repeated early collection, reload during the
real timer, harvest, sell, reject duplicate sale, cancel construction/reset and
reload persistent progress. It reads rendered Cocos node coordinates and saved
state but never calls game commands directly, mutates game state or warps time.
Interaction verification is pending until its workflow passes.

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
