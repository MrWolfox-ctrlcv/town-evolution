# V6 fine-terrain edit upload reuse

Implemented locally on top of `f7d2e47` and the existing uncommitted cold-work continuation changes. No push or deployment.

## Scope and result

Fine 16×16 terrain chunks now expose eight fixed 8×4 render bins, plus a separate coast bin when present. Editing a cell invalidates the bins containing all cells selected by the existing neighborhood rules. Unchanged bins reuse their GPU nodes and meshes without uploading their attributes again. Far terrain and trees keep their original whole-mesh layout.

The full canonical CPU mesh, triangle metadata, support, resource surface, picker, and domain rules are unchanged. This does not remove the full CPU chunk merge or picker/support preparation. New bins also need a cooperative index-only size scan, so this is an upload reduction, not an asserted CPU build speedup.

## Measured deterministic fixture

Seed 42173, actual domain commands, the production splitter and uploader with Cocos call doubles. Baseline is f7d2e47 plus the cold-work changes, using its original uploader. Numbers are bytes, not KB rounded estimates.

| Edit                        | Whole chunk upload | 8×4 upload | Reduction |
| --------------------------- | -----------------: | ---------: | --------: |
| Bin interior (83,82), dig   |            360,708 |     47,556 |     86.8% |
| Bin boundary (88,88), dig   |            361,620 |    138,084 |     61.8% |
| Chunk boundary (95,88), dig |            717,348 |    137,124 |     80.9% |

Repeated digs and fills at (88,88) uploaded 137,244–139,236 bytes instead of 360,540–361,956. Every cold and edited canonical mesh matched the old path's SHA-256 over raw Float64 attribute/index/bounds bytes and complete triangle metadata, including signed zero. The canonical positions remain the existing quantized values.

Cold full-chunk uploads remain 356,352 bytes. The representative fine chunk adds 24,576 deterministic accounted bytes (2,916,352 → 2,940,928); actual heap usage is not measured. Nodes per representative fine chunk rise from 6 to 8; the two-chunk example rises from 12 to 16. These are not measured draw calls. A coast bin and unusually complex bins can add more nodes. Actual GPU upload time, render cost, shadows, browser frame times, Cocos visual behavior and phone performance have not been tested.

Raw reproducible fixture: `scripts/benchmark-v6-edit-upload.cjs` and `docs/benchmarks/v6-edit-upload-20261107.json`. The fixture seeds inventory in an isolated generated state and uses ordinary pickup commands between edits; it never edits a player save. Optional `V6_SURFACE_BUILD` and `V6_UPLOAD_SOURCE` select an independently compiled baseline and its uploader.

## Ownership, validity and admission

- A WeakMap keyed by the current canonical CPU mesh holds bin descriptions. Ranges contain only triangle offsets into that current mesh. Anonymous frozen tokens never point to a mesh, cell span or prior snapshot.
- A new batch description reuses a token only if its bin contains no rebuilt cell, including cells rebuilt to empty. LOD and coast invalidations disable prior-token reuse. The existing fine four-neighbor and far second-ring invalidation logic is unchanged.
- GPU pool entries retain only GPU objects and a completion flag. Current chunks, bounded inactive CPU snapshots and pending transactions share ownership by token. No GPU entry or retained-token set keeps historical CPU meshes alive.
- New uploads remain hidden. The view's existing support/CPU/picker commit occurs before one synchronous visibility switch. Reused displayed buffers are never mutated. Whole-group cancel/failure discards incomplete GPU entries, even if their tokens are retained by the CPU cache. Complete cache-owned bins can safely survive cancellation and be reused.
- Each upload part still obeys 64KiB and 16-bit indices. Bounds are computed from each emitted part's actual vertices. Upload budgets count only newly copied actual attributes and indices.
- New descriptor/node bookkeeping and actual split duplication are charged to the existing staging/resident/cache ledger. Shared bins are conservatively charged in each CPU snapshot, rather than expanding the 32MiB/32-entry hot cache or total admission limit. This is deterministic admission accounting, not an actual JS/GPU heap measurement.

## Verification

New targeted tests cover:

- Bit-exact expanded attributes and all triangle metadata, signed zero, disjoint complete coverage, actual part bounds, and oversized bins.
- Interior/bin-boundary/chunk-boundary edits, five-cell rebuilding, strict token reuse, hidden staging, unchanged CPU authority until commit, and post-commit picking.
- Repeated edits, filled walls, an entire removed bin, coast change, LOD switching, cache revisit and eviction.
- Partial upload cancellation/failure with cache-owned tokens, complete-bin cancellation, pending pins across cache trimming, mixed reused/new bins, and exactly-once GPU destruction.
- New accounting admission failure, zero upload budget, empty layout removal and malformed triangle ranges.

`npm run check` passed: 2,220 tests, zero failures or skips; formatting, domain and official Cocos 3.8.8 types, project structure, architecture and 222 canonical assets passed. `npm run demo:domain` passed. The final focused run passed 56 tests, including the existing hot-cache, cold-continuation, authority, resident recovery and uploader regressions. A separate read-only review found no concrete remaining lifecycle defect. Creator import, browser/editor visual review, Android build and device testing remain unrun.
