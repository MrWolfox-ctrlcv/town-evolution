# Town Evolution engineering rules

- This is a Cocos Creator 3.8.8 + TypeScript project. Do not replace the renderer with another engine to obtain a passing web preview.
- Keep deterministic business rules in `assets/scripts/domain`, without `cc`, network, timers, DOM, random, or direct storage dependencies.
- Presentation dispatches commands; it never edits inventory, currency, or buildings directly.
- Changing configuration also requires boundary and save-compatibility tests. Imported save files are untrusted input.
- Preserve existing malformed saves. Do not silently reset the player's town. Destructive reset requires in-game confirmation.
- Use `npm ci --ignore-scripts`, then `npm run check` and `npm run demo:domain` for source validation.
- `npm run check` validates Cocos APIs against official 3.8.8 declarations but does NOT perform an editor import, web build, Android build, visual review, or device performance test. Never claim those passed without executing them.
- Do not add fake `cc` declarations or broad `any` stubs to make engine code appear verified. Creator generates its actual engine typing configuration during project import.
- No account, payment, ads, server economy, TapTap publishing, or production deployment in this MVP.
- Do not commit `library`, `temp`, `build`, `node_modules`, credentials, signing keys, or generated local profiles.
