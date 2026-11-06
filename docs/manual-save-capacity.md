# Large-town manual save regression

The 192×192 world raised the inner save parser limit to 4,000,000 characters, but manual slot inspection still rejected its whole JSON wrapper above 500,000 characters. Manual slot writing did not use that old limit. A successful write could therefore immediately appear unreadable.

A reproducible legal fixture contains 400 additional ordinary farms with nine crop jobs each, with every footprint and the final town accepted by the actual domain validators. Its autosave is 467,449 characters and loads successfully. Its manual wrapper is 552,360 characters because the inner JSON string must be escaped. Before the fix, the normal menu flow reported a successful manual save and then classified that same slot as corrupt.

Manual reads and writes now share a finite wrapper limit derived from the inner save limit: twice the inner limit plus 64 characters for the fixed envelope. The canonical JSON save has no arbitrary user text, and every quote or backslash expands to at most two characters when wrapped. The embedded save still passes the unchanged inner size and schema validation. Both validations happen before a write can replace the slot or its recovery copy.

`tests/manual-save-capacity.test.cjs` covers the real populated town, overwrite confirmation and archival preservation, title-screen restore, both parser boundaries, oversized input, storage quota failure, changed slots during confirmation, and rescue of a stale page's large town without touching newer automatic progress.

This is domain/application-level persistence verification. It does not establish real-browser WebGL rendering, mobile interaction quality, or browser storage quota availability.
