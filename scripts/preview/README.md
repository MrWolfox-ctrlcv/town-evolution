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
**Rendering has not yet been verified.** Further runtime fixes may be needed.

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
