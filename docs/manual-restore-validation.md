# Manual restore activation validation

Manual-slot loading now binds the candidate session to the exact primary revision
returned by the successful `resetSave`. The candidate must be normal and carry
that revision, and storage must still match immediately before activation.
Candidate construction disables demo metadata initialization.

## Reproduced failure

A bounded Map-backed storage hook changed the primary immediately after the
manual restore write. With an existing 83-coin town and a 14-coin manual slot:

- Removing primary activated a fresh 120-coin town without a warning. Its next
  ordinary save persisted the unintended fresh town.
- Replacing primary with a valid 97-coin town silently activated that different
  town instead of the selected slot.
- A change after the candidate read was not checked before activation.

The initial focused regression run had 11 failures and 4 passes. No terrain6
world generation or native storage changes were needed for these reproductions.

## Safety behavior

Failed post-write validation does not roll back storage, activate a candidate,
or discard the current live session. Messaging explicitly says town switching
has not occurred; it does not claim the restore write never occurred. The manual
slot remains unchanged and the pre-restore primary archive remains available.
If primary changed, the retained session's existing revision rejects subsequent
saves without writing, so it cannot overwrite the restored or external primary.
Title callers remain without a session instead of activating an empty town.

`tests/manual-restore-validation.test.cjs` covers live and title callers, missing
and replaced primaries, read exceptions, a race after candidate read, final-read
exceptions, normal/demo successful restores and subsequent saves, unchanged
manual slots and archives, and demo metadata preservation.

This is bounded application/domain validation, not an editor import, browser
rendering review, Android/native-storage test, or device performance check.
