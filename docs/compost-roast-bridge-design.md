# Compost, roasting and river bridge checkpoint

## Confirmed intent

- A crate hit with a hammer becomes a wooden barrel.
- Existing crops and tree seeds can be put directly into the barrel for composting.
- Two wooden piers can become a wooden bridge.
- Two carrots can be processed in the stone oven into one roasted-carrot product.
- Other recipe candidates remain unapproved.

The barrel and products follow the image reference `exec-28713c7f-6a81-4043-a1a1-f724a58b24fc.png`. This is a design reference, not an imported runtime asset. Existing crate planks and pier geometry should remain recognizable.

## Provisional compost rules

`COMPOST_BALANCE` is an adjustable first-play configuration, not a user-defined promise: capacity 16, two input units per batch, 15 seconds, one fertilizer. Allowed inputs are carrot (`vegetable`), wheat, lettuce, rice and tree seeds. Mixing these is allowed. No saplings, wood, stone, mud or finished food is accepted.

The barrel has its own complete stock and one active job. Waiting inputs and the active job's consumed inputs both occupy its saved capacity. A deposit starts one batch when enough material is available. A busy barrel can receive more material within capacity. Collecting the completed batch may start one next batch at the actual command time. Loading or advancing time never chains offline batches or silently credits output.

Fertilizer is the existing finite `tools.fertilizer` counter, not a new inventory item. Its overflow rejects collection and retains the whole job. Existing fertilizer gameplay is disabled; enabling a new effect is a separate decision. All job times, consumed items and yield are saved snapshots. Later balance changes do not rewrite existing promises.

Implemented explicit sources are inventory item/amount, a complete ground-stack snapshot, or a complete loose-drop snapshot. Only the specified quantity and source may be used. No nearby search, hidden inventory supplementation, partial loss, or drop relocation occurs. Waiting input can be withdrawn separately; active batch input cannot be withdrawn or duplicated.

An empty crate hit with a hammer takes the barrel route. A crate with explicitly attached mud keeps the existing nursery route. Other attached items must be reclaimed first, so hammering cannot silently destroy their contents.

## Save boundary

The isolated terrain preview remains schema 9. The next development runtime is now schema 10 because roasted carrots add a product key; older v9 clients explicitly reject the future schema instead of stripping new jobs or products. A captured complete v9 demonstration fixture is stored at `tests/fixtures/schema9-before-compost.json`.

Migration preserves old inventory, attached materials, commerce stock/cargo and voyage price snapshots, farm boxes, loose drops, crop and processing promises, natural resources, trees, coordinates, discovery history and v5 terrain revision. Only the new product key is defaulted to zero for older schemas. New v10 records require it everywhere. Both the first normal write and adoption of an old backup archive exact original v8/v9 bytes beyond the rotating backup. An archive failure prevents replacement of the primary. Read-only load does not write or reset anything.

The terrain phase2 build was frozen and separately packaged before shared `types`, `state`, `save` and `foundation-save` were handed back for this integration. Its packed preview was not changed. World/island/terrain/mud and all v5 geometry remain outside this change.

## Roasted carrots

The existing processing workflow now supports `roast-carrot` at a standalone stone oven: exactly two carrots produce one roasted product, with no additional fuel. Ten seconds is a provisional duration; all job inputs, output and duration remain snapshotted. Initial trading values (buy16, sell11, ship13; four-unit order reward56) are provisional and do not change existing goods or shipment contracts.

## River bridge preview only

`bridgeCrossingPlan` is deliberately not connected to a crafting command or save schema yet. It accepts two exact selected wooden-pier snapshots, with their existing 2-by-2 footprints positioned on aligned opposite banks. Both selection orders produce the same plan and retain the geometrically first pier's identity. It does not move inputs, consume stock, modify river geometry or find substitute endpoints.

The provisional bridge width is two tiles and supported total span is seven through sixteen tiles. Both two-row endpoints must be completely `dryBuildable`. Both lanes must cross actual clear freshwater river cells. A whole-cell lake/ocean upper bound prevents treating lakes, marine water, or an ambiguous mouth as a river. Interior land between river sections, obstacles, deposits, drops and reclaimed cells are rejected. Old v1-v4 islands remain unchanged and unsupported by this planner.

Real v5 test candidates include seed 1 at (133,135), X span 15; seed 42 at (136,130), Z span 15; seed 20261106 at (137,130), Z span 14. These are examples, not a guarantee that every reach is buildable. Final crafting needs matching saved dynamic footprint, collision rules, actual riverbed-supported posts, visible deck and bank contact, and joint drag interaction validation before activation.

## Verification so far

- Independent compost strict TypeScript and 16 pure-rule tests pass.
- Independent bridge planning strict TypeScript and 7 actual-hydrology tests pass.
- Schema10 storage/processing/action and demo focused suites pass (80 tests before the additional backup-recovery regression). Old domain/schema regression passes 164 tests, including original world/save projection checks.
- New demo templates add a real barrel with one waiting tree seed and a two-unit roasted-product pile plus two inventory units. Existing demo saves receive no new objects or goods automatically.
- No claim of final integrated gameplay, Creator import, browser/GPU, device performance or publication is made by these isolated results.
