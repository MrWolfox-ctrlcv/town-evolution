# Emergency crop recovery and fractional storage

Terrain v6 soil and stone use exact 1/4096-unit quantities. Emergency crop recovery
still adds one whole seed, so it must reserve one whole unit of warehouse space.
The old `used < capacity` check admitted a town with only a fractional free unit.
For example, a valid 16-capacity town containing 15.5 soil could recover a seed,
consume its one-time entitlement, and reach 16.5 used storage. Save validation then
rejected the town with `库存超过仓储容量`.

The recovery guard now requires `used + 1 <= capacity`. Rejection preserves the
state and recovery entitlement. Crop-source eligibility, including crops waiting
in compost barrels, is unchanged. No schema, balance, or saved-data migration is
involved.

## Focused verification

`tests/recovery-capacity.test.cjs` prepares one real v6 world (seed 1937), shares
that preparation, validates each input through export/import, and exercises both
the dispatcher and `GameSession` with isolated in-memory storage:

- Only 0.5 or 1/4096 unit free: reject without changing state, entitlement, primary
  save bytes, or backup bytes.
- Full warehouse: reject in v6 and legacy v1.
- Exactly one free unit or an empty default-capacity warehouse: recover, save,
  roundtrip, reload, and reject a second claim in both versions.

The before-fix run fails the two fractional-space assertions. The targeted
post-fix run also includes `compost-recovery.test.cjs` to preserve the earlier
crop-source eligibility regression coverage. Logs are local ignored build
artifacts under `build/recovery-capacity`.

These are CPU source/session tests, not a full aggregate suite, Cocos editor
import, visual review, WebGL or Android build. No player saves were accessed.
