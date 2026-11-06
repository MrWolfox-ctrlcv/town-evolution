# Mud, residence and additive land

## Explicit soil selection

Dry soil and mud are different saved items. Soil retains its five-unit ground
limit. Hold the watering can, move it over two or more soil piles, and release
over one of the selected piles. The gesture selects each pile only once, stopping
when nine soil units are available. Blue outlines and water drops show selected
piles; a small mud model appears when the combination is valid. There is no
recipe quantity or capacity hint in the game text.

Release atomically consumes nine soil units and places one mud at the first
selected pile. Surplus in the last selected pile remains there. Hover, cancel,
tray return, foreign pointers, invalid targets and repeated release never spend
or duplicate goods. Output stays on the ground and does not require free storage.
Watering a farm instead uses the field-irrigation command, never the soil recipe.

## Ground models and uses

Mud ground stacks have a nine-unit limit. Each unit is visible; nine form a low
3×3 clay pad with small green edge details, a visual land-building cue. Partial
merges fill the destination and leave surplus at the origin. Sidebar quantity
shows owned inventory, but mud selection and overflow do not print its limit.

- Drag a complete mud pile onto an orthogonally adjacent water cell to reclaim
  one map tile. The preview shows the grass block. Diagonal-only or detached
  islands, outside-map cells, existing land, and the two water rows under a dock's
  pier are rejected. Nine mud are consumed only on successful release.
- Drag mud from the inventory or a ground pile onto a basic house to make a
  residence in place. One mud is consumed; any remaining ground mud stays at its
  source. The building retains its ID, orientation, footprint and other attached
  material. Residence is a finished plaster-home model with no population,
  income, housing capacity, or other unrequested gameplay effects.

Mud has no invented shop or shipment price. Returning it to inventory uses the
ordinary warehouse capacity checks.

## Save and terrain integrity

The additive schema-8 `landExtensions` array records reclaimed coordinates.
Old saves without it gain an empty array; missing mud stock gains zero. Import
rejects duplicate, malformed, out-of-bounds, base-land, disconnected or
dock-blocking extensions. Connectivity is checked independently of array order.
Existing seed, terrain version, coastline cells, buildings and depleted natural
resources are preserved. Reclaimed tiles are flat grass and never spawn new
resources. Terrain rendering, placement, ground operations, dock routing and
save validation all use the same land mask. Neither schema migration nor reload
replays a recipe.

## Verification

`mud-expansion.test.cjs` covers consumption, surplus, repeats, malformed commands,
old saves, both terrain versions, shoreline boundaries and residence identity.
`mud-drag-ui.test.cjs` covers real presentation routing with isolated collaborators,
including previews, cancellation and repeated releases. `mud-residence-art.test.cjs`
checks all nine silhouettes and the finished-house mesh. These tests do not stand
in for a rendered Cocos/browser or physical touch-device check.
