# Bottom action pagination

## Confirmed defect

At baseline e54b87a, Settings → 小镇事务 in the v6 experiment generates nine
commands, or ten after selecting 填地. The bottom panel allocated six buttons
and bound only indices 0–5, silently hiding 查看全岛, 进入正常小镇 and 退出到标题.
Fill mode additionally hid 购买作物. These are existing commands, not new features.

Before implementation, the focused regression using production HudActions,
BottomActions and ActionButton failed with “Overflow must provide a next-page
control”. The test uses narrow Cocos scene collaborators, not engine rendering.

## Change

The same six action nodes display up to six commands unchanged. Overflow displays
five commands plus a wrapping 更多 page control. Existing Close and Rotate controls
remain separate. Layout uses the displayed count, including shorter final pages.
Explicit opening and changes to tab, context-heading mode or action count reset
the page. Periodic refresh preserves the page and updates command closures.
Changing the page or visible action metadata cancels captured taps. Unchanged
clock refreshes retain the command captured by a held tap; subsequent fresh taps
use the refreshed command closure.
Close also cancels pending captures.

## Validation

Focused tests cover the actual nine/ten v6 commands, wrapping, persistent node
identity, zero through six commands, partial final pages, portrait/landscape
bounds, refresh during a held tap, stale gestures, close/reopen, context changes,
shrinking lists and disabled explanations. No domain or saved-data logic changes.
CPU tests and official Cocos API typechecking do not claim a Creator import,
browser visual test, GPU test, Android build or device validation.

Executed checks:

- `node --test tests/bottom-action-pagination.test.cjs tests/crop-purchase-hud.test.cjs tests/settings-menu.test.cjs`: 64 passed, 0 failed.
- `npm run typecheck:cocos`: passed against official Cocos 3.8.8 declarations.
- Prettier applied to all four changed/new files in this patch.

The full repository suite was not rerun for this bounded presentation change.

After preserving original held-command capture semantics, the five pagination
regressions and official Cocos typecheck were rerun and passed. Reproducible
baseline and final output are retained in `build/bottom-action-pagination/`:
`before.log`, `after.log`, `baseline-BottomActions.ts`, and `use-baseline.cjs`.
The baseline loader substitutes only BottomActions source from e54b87a for the
focused test; it does not rewrite production files. The earlier 64-test run
preceded this final capture-semantics adjustment.
