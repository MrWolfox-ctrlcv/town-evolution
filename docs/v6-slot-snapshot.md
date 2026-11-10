# V6 profile snapshot consistency

V6 manual-slot inspection previously read the slot for its terrain header, then
read it again through the generic full parser. Alternating v6 and legacy bytes
could pass both confirmation inspections while activating a terrain-version-4
town under the v6 profile and writing it into that profile's primary save.

The start/continue path also inspected one primary snapshot before constructing
a session from another read. A single primary replacement between those reads
activated an incompatible town. Both failures were reproduced through the real
`GameStart` application flow with synthetic storage and one prepared v6 world.

## Protection

- `inspectSlotRaw` parses a captured immutable slot snapshot. Normal and v6
  inspection share this full parser; v6 header inspection uses the same bytes.
- Both inspectors validate manual slot keys before accessing storage. Missing,
  inaccessible, invalid and malformed slots retain their revision semantics.
- `townSession` checks the actual candidate state. A non-v6 state in the v6
  profile is corrupt, preventing ordinary save, activation and the UI's backup
  recovery action. Other profile behavior is unchanged.
- Changed confirmation content still rejects without writes. Original saves,
  manual slots and external replacements are preserved; no migration or reset
  is inferred from a mismatch.

## Focused verification

`tests/v6-slot-snapshot.test.cjs` shares one real preparation across twelve cases:
same-snapshot parsing, normal-profile compatibility, legacy rejection, pending
unprepared headers, error/revision behavior, confirmation races, valid v6 manual
restore, candidate compatibility, startup races, normal startup and actual
backup-recovery rejection. Existing manual-save size-limit, restore, concurrency,
reload, profile and startup tests provide adjacent regression coverage.

Evidence logs are under `build/v6-slot-snapshot` and final integrated logs under
`build/profile-snapshot-followup`. An intermediate 10/11 run contained an invalid
test assumption that the low-level `GameSession.recover()` API checks corrupt
mode itself. The real UI checks recovered mode before calling it. That assertion
was corrected, and the final test exercises the real recovery action instead;
the low-level recovery API was not changed for this unrelated assumption.

These are bounded CPU/application tests with synthetic stores, not user save
access, a full aggregate suite, Creator import, a new preview, WebGL or device QA.
