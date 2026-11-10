# Reload-latest preserves the live town

The conflict recovery menu must load an existing primary save. It must not interpret missing primary and backup keys as permission to create a fresh town.

Previously, `townSession` returned a normal fresh session for empty storage. Confirming “读取其他页面的最新进度” therefore discarded the current live session after site data disappeared. A synthetic normal-profile reproduction replaced 97 coins with the initial 120 coins, without an error.

`StartRecoveryActions.reload` now validates the primary for every profile, requires the constructed session's primary revision to match those validated bytes, and checks storage again immediately before activation. Missing, invalid, incompatible, changed, or inaccessible saves retain the live session and display an error. A backup-only store is not treated as the latest primary; backup adoption remains a separate explicit recovery action. V6 keeps its preparation callback before loading. Reload candidate construction disables only initial demo metadata writes, so a missing demo marker plus disappearing save also leaves storage unchanged. Successful reloads retain ordinary saving and explicit reset metadata updates.

## Focused verification

- `npm run build:domain`
- `node --test tests/reload-preserves-live-town.test.cjs tests/save-concurrency.test.cjs tests/game-start.test.cjs`
- Before and after logs: `build/reload-preserves-live-town/` (generated, not committed).

The new tests use synthetic in-memory stores only. They cover normal/demo missing, backup-only, corrupt, future-version, and throwing stores; successful latest-primary loading; disappearing/changed reads; and bounded V6 preparation callback tests for missing and throwing reads. Failure assertions preserve session identity, state, conflict/unsaved indicators, and synthetic stored bytes.

This is CPU/application coverage, not a Cocos editor, browser, Android, visual, or device verification.
