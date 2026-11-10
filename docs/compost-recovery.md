# Compost stock and emergency crop recovery

Emergency crop recovery now counts waiting crops in compost barrels as existing
planting sources. Waiting carrot, wheat, lettuce and rice can be withdrawn through
the barrel controls, so they must not allow the one-time recovery grant to be spent.
The same rule applies while another batch is processing.

Active batch inputs are already reserved and cannot be withdrawn. They do not
block recovery when no other planting source exists. Waiting tree seeds and the
fertilizer counter are not crop planting sources either. No fertilizer behavior,
recipe balance, save schema or migration changed.

## Reproduction before the fix

With fewer than eight coins, an unused emergency grant, an empty farm and no other
crop sources, put the last carrot into an empty compost barrel. It remains waiting
stock because a batch needs two inputs. Both withdrawal and emergency recovery
were enabled. Recovery granted another carrot and permanently spent the emergency
flag even though the original carrot was immediately recoverable.

## Verification

`tests/compost-recovery.test.cjs` covers all four crops in idle and working barrels,
actual HUD recovery and withdrawal actions, unchanged state identity and raw
storage on rejection, preserved emergency eligibility, legitimate reserved-only
recovery, tree-seed/fertilizer exclusions, and save export/import roundtrips.

Before the fix, the new suite had nine failures and two passes. After the fix, all
eleven cases pass. A combined run with `tests/compost-integration.test.cjs`,
`tests/compost-presentation.test.cjs` and `tests/planting.test.cjs` passes all 38
cases. Before/after logs and exact commands are retained locally under
`build/compost-recovery/` (generated evidence, not committed source).

These are CPU/domain and presentation-routing tests, not Creator import,
browser/WebGL, Android or device-performance verification.
