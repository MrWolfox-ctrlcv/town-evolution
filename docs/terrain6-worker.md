# terrain6 Worker preparation

This is a new minimal implementation, not recovery of the lost, unpushed “DTO2” files.
It changes preparation transport, not the generator revision, resource IDs or save format.
Only the standalone Cocos preview currently opts in. Creator exports and native builds retain
the existing cooperative main-thread preparation until their worker asset wiring is added
and verified.

## Data and trust boundary

- The request/reply envelope checks `terrain6-worker-1`, generator revision, request ID and seed.
  Progress, complete, failed and cancel are explicit messages. Workers receive only a seed,
  never saves, storage keys, user data or a Cocos session.
- `buildTerrainData` computes the same coast, starter, landform, Float32 lattice and completed
  cells in the worker. Three separate ordinary ArrayBuffers transfer ownership. Closure-bearing
  hydrology/starter objects, private fields and the realm-local completion WeakSet never cross
  the boundary.
- The DTO carries format 1, coast/starter recipe data, reserve bounds, lattice arrays, and ordered
  cells/deposits/trees. This is an internal same-origin IPC format, **not** a save/import format.
- Main-thread validation checks versions, seed, exact sizes and buffer ownership; metadata,
  finite numeric ranges, enums, coordinates, resource IDs/amounts, sorted strata, cell/deposit
  agreement, and tree order/elevations. Coherent triple-NaN lattice entries are intentional lazy
  samples; infinities, mismatched missing components, detached, shared and aliased buffers fail.
- Validation and private lattice copying yield in bounded batches. Copies retain the raw Float32
  bits, including untouched NaNs, and prevent a retained DTO from changing a published world.
  Cells, deposits and metadata are recreated as local objects. Base hydrology, starter methods,
  landform and terrain are rebuilt locally; only full completion receives the local brand.
- These checks detect malformed or inconsistent transport data. They are not cryptographic
  authentication or a second full proof that every numeric value is the seed's canonical terrain.
  Arbitrary external payloads must never be routed into this internal decoder.

## Lifecycle

The UI retains its first two drawing opportunities and its soft 6 ms frame budget. Worker events
only queue results; decoding and publication remain inside the frame-driven preparation flow.
A waiting worker does not busy-spin for the rest of the frame. Pending saves are compared with
the original bytes on every tick before preparation advances or completes. No worker creates a
session or writes saves.

Cancel, Back, profile changes and replacement terminate the worker and invalidate its callbacks.
Late or duplicate completions cannot publish. Failed construction/loading, message errors, bad
versions/seeds/data, and 30 seconds without progress fall back once to the existing cooperative
preparation path. A completed queued result is retained across a long page pause. Cached seeds
continue to use the existing cache, including the active-world pin and two-entry limit.

The worker uses MessageChannel tasks instead of recursively nested timers. This avoids adding
browser timer-clamp delay for every work batch. Its separate IIFE bundle has no Cocos dependency;
`scripts/preview/build.cjs` emits `terrain6-worker.js`, and preview bootstrap injects its URL.
If the asset or Worker capability is unavailable, fallback remains usable.

## Focused evidence, 2026-11-06

- `tests/terrain6-worker.test.cjs` uses a real Node worker thread, real structured cloning and
  transferable buffers. It confirms all three sender buffers detach, the parent continues to
  schedule, and the received world is reconstituted rather than cloned as an instance.
- `tests/fixtures/terrain6-worker-baseline.json` was captured from the untouched pre-change commit
  `5dc9a6d90e6e81b38f578321da882e2b813198de`, seed 42173, Node 24.22.1 / V8 13.6.233.17-node.58.
  Original `V6Samples.vertex` calls were observed during construction into initially NaN-filled
  buffers. SHA-256 covers all original lattice bytes, cells, resource/stratum order, trees and
  the full initial schema10 save at time 60000. Do not refresh this oracle to fit changed code.
- Worker output matches those baseline hashes. Decoded cells match the worker data; independent
  hydrated instances agree on selected lazy/border vertices, heights and normals. Mutation of a
  retained DTO cannot change the published lattice. Consumption is one-shot.
- Cancellation, stale replies, changed-save bytes, decode rejection, startup/transport failures,
  idle timeout and long-paused completion are covered. The worker, start controls, material and
  surface-authority suites passed **44/44** focused checks; this is not a full-suite count.
- A separate permanent cold-fallback regression launches a fresh process, proves its cache is
  empty, makes Worker startup fail, and completes real cooperative generation before publication.
  It checks one startup attempt, one-shot consumption, the frozen initial save hash and an exact
  save/import roundtrip. Run only this gap with
  `node --test tests/terrain6-worker-cold-fallback.test.cjs` (**1/1** passed).
- The frozen old-world compatibility checks for seed 42173 passed **5/5**, one per terrain1–5,
  including cell identity, original/depleted save bytes and reloads. Other old-world seeds were
  not repeated for this narrowly scoped change.
- TypeScript domain checks, official Cocos 3.8.8 declarations, formatting, project structure,
  dependency/cycle checks, canonical art checks and the domain demo passed.
- The actual standalone worker entry bundled with esbuild and emitted progress under a Node
  Worker adapter. This checks the bundle, not a browser or full Cocos preview build.

Reproduce the focused tests after `npm run build:domain`:

```sh
node --test tests/terrain6-worker.test.cjs tests/terrain6-controls-start.test.cjs \
  tests/terrain6-compatibility-material.test.cjs tests/v6-surface-authority.test.cjs
```

Remaining performance limits: the cell/deposit/tree object graph still uses structured clone;
allocation, cloning and GC may have uninterruptible cost. Hydration copies add temporary memory.
Full save validation, rendering, mesh upload, GPU cost, browser CSP/worker lifecycle and real
mobile frame times remain unverified. No full `npm run check`, Creator import/export, full engine
build, browser/GPU/device acceptance, push or deployment was performed for this change.
