# Verification status

## Completed in the Linux development workspace

- Strict TypeScript compile of domain, persistence and engine-independent application modules.
- All Cocos scripts typechecked against official `@cocos/creator-types@3.8.8` engine declarations. This checks signatures, not runtime behavior.
- 45 automated business and storage tests at initial implementation.
- Repeated 100-cycle production/order/save round-trip simulation.
- Seeded 3000 mixed-command invariant test with save round trips.
- One-pointer gesture tests cover secondary touches, drag thresholds, cancellation and lifecycle reset.
- Session tests cover restart, read-only previews, failed saves and explicit recovery.
- Responsive layout math checked at seven portrait/landscape sizes, including 568×320.
- Import-graph check: no circular imports or domain-to-engine dependencies; source modules capped at 300 lines.

Run `npm run check` for the current test count and structural validation. Final CI status should refer to the exact Git commit, not a previous run.

## Requires Cocos Creator 3.8.8

- [ ] Import project with actual engine typings and resolve any Cocos API errors.
- [ ] Open Main scene and ensure bootstrap component resolves.
- [ ] Preview: camera, light, meshes, UI and readable Chinese labels.
- [ ] Mouse and touch placement, selection, cancellation and invalid placement feedback.
- [ ] Viewport resize, portrait and landscape layout.
- [ ] Production, collection, orders, expansion and combination visual feedback.
- [ ] Save on action and lifecycle event; reload and background resume.
- [ ] Storage error/recovery flow and two-step reset confirmation.
- [ ] Web build and HTTP-hosted smoke test.
- [ ] Android build and APK installation.

## Requires target phone

- [ ] Mobile-browser and Android APK use the same domain flow.
- [ ] Sustained frame times and memory, not only initial FPS.
- [ ] Repeated creation/remodeling without retained mesh/material leaks.
- [ ] Touch accuracy near UI, screen edges and buildings.
- [ ] Native safe-area/notch and system navigation insets (not yet automatically inset).
- [ ] Background/foreground, interrupted activity, process restart.
- [ ] Initial loading size/time and thermal behavior.

No editor/build/device item above has been marked passed in this workspace. These are acceptance gates, not evidence that tests already succeeded.
