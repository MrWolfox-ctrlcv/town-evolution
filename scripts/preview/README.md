# Actual Cocos preview (experimental)

This compiles official Cocos 3.8.8 and the real `TownBootstrap` dependencies.
It is not a mock renderer, a Creator serialized-scene import, an Android build,
or production deployment. The native Cocos scene is assembled programmatically.
Official engine effect fixtures supply precompiled GLSL and runtime materials.

The `Actual Cocos browser preview` workflow builds the engine from pinned commit
`411f98df047c25902f93440d4b22925c2fb65461`, then attempts desktop and mobile-viewport
screenshots with Chromium software WebGL. It fails on runtime errors, failure to
draw five frames, or a nearly blank canvas. Screenshots with `FAILED` in the name
are diagnostics, not evidence that gameplay works. Mobile viewport is not an
Android/device test. Engine and third-party license notices accompany artifacts.

The first standalone cloud build compiled successfully, but its managed browser
had no WebGL contexts. **Rendering has not yet been verified.** The workflow is
the next real validation step; further bootstrap/runtime fixes may be needed.

For local development, set `COCOS_ENGINE` to that official engine checkout with
its npm dependencies plus esbuild 0.28.2, systemjs 6.15.1, playwright 1.56.1 and
pngjs 7.0.0 installed. `node scripts/preview/build.cjs` writes `build/preview`.
`node scripts/preview/capture.cjs` requires a working Chromium installation and
browser sandbox. Generated engine/dependencies/artifacts must stay uncommitted.

The upstream engine lock contains stale mirror downloads, so CI resolves engine
dependencies afresh. Engine source and preview tools are pinned; the entire
transitive dependency graph is not yet reproducibly locked. Do not call this a
release build or supply-chain-hardened pipeline.
