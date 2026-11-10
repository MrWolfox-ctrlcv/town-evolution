# Optional standalone release preview

Default builds retain the existing debug configuration and output directory. To build a separate optimized preview, set `PREVIEW_MODE=release`; its default destination is `build/preview-release`. Explicit `PREVIEW_OUT` remains supported. This is still a standalone preview, not Creator import, Android packaging or production approval.

Release uses the same pinned engine/features with `DEBUG: false`, engine compression and application/worker minification. `bootstrap.ts` retains its runtime `debugMode: 1` setting. Compile-time DEBUG disables some engine assertions and deprecation warnings and changes detailed numbered diagnostic messages to code/link summaries. It does not disable all logs, change game rules or establish a measured device speedup.

The export validator resolves the first parameter of each System.register callback through lexical scope. Minified parameter names are allowed; shadowed local functions and exports spread across separate registrations cannot satisfy the required module exports. It uses acorn and eslint-scope from the pinned engine's installed build tools.

Run `COCOS_ENGINE=... node scripts/preview/check-export-validator.cjs <engine-file>...` for focused positive/negative fixtures and actual bundle checks. Run the existing `tween-smoke.cjs` against the release output to execute its real TweenSystem under jsdom. This test does not render WebGL.

The isolated November 8 validation passed 11 validator fixtures, actual debug/minified/release export checks, the release build, and real release-engine Tween registration/update/completion/cancellation. The release engine was 1,694,669 bytes; the application 1,197,803 bytes; the worker 25,325 bytes. These are local output sizes, not transferred bytes or device timings. HTTP compression/cache behavior and mobile rendering remain unverified. Rollup retained warnings about eval in generated bundled engine-effect code; no warning was suppressed.
