# Farmland upgrades

## Grid and save compatibility

The existing small farm remains a 2×2 map footprint containing nine 3×3 crop
cells. New fields created by dropping the digging tool onto unobstructed flat
land use exactly that layout. This avoids silently expanding or relocating
existing saved fields.

A large farm uses a 4×4 map footprint and 36 independent 6×6 crop cells. Crop cell
width stays 2/3 of a map tile, so plants keep their original visual scale.
`kind` remains `farm`; the additive schema-8 fields are `farmSize: 6` for a large
field and `irrigated: true` for either size of water field. Missing fields keep
the old small dry field. Invalid sizes, flags, cell counts, or farm-only fields
on other building types reject import and retain the original save.

## Drag synthesis and crop preservation

Arrange three small fields as three quadrants of a 2×2 field square (an L shape).
Long-press one field and drop it onto either other field. The valid preview
outlines the complete future large field. The target field's ID survives; the
source and the matching third field are consumed atomically. There is no new
explicit synthesis button or undiscovered recipe text.

The full 4×4 footprint must be legal land without an unrelated building, tree,
natural resource, or product pile, including the initially empty fourth
quadrant. All three inputs must be dry or all irrigated. Mixed input states do
not silently discard irrigation. The fourth quadrant grants nine empty crop
cells, upgrading 27 input cells to 36.

Every job keeps its ID, crop, start and maturity times, promised duration and
yield. Input rotations are mapped into the resulting row-major grid with world
crop positions unchanged. The result faces rotation 0; it can subsequently be
rotated and moved with the same rules as other buildings. Attached materials
are retained subject to the existing combined five-item limit. Failed previews
and commands do not change crops, tools, currency, identity, positions or saves.

## Water fields

Drop the watering can onto an empty small or large field to make a visible shallow
water field. Carrots, wheat and lettuce are dryland crops: new planting in water
fields is rejected, and a planted dry field must be harvested before flooding.
Hover and release both explain this restriction without spending resources.
Repeated watering is rejected. No water-field crop, rice, bonus, new growth rate
or economy rule is introduced. New demo water fields are therefore empty.

Previously saved crops in water fields are retained exactly and may mature and
be harvested for their promised output; loading never deletes or resets them.
After harvest, dryland crops cannot be replanted there. Legacy merging, movement
and rotation also preserve those jobs. Both tools use the existing temporary
unlimited-durability policy.

## Verification

`tests/farmland-upgrade.test.cjs` covers all four missing quadrants, all four
input rotations, crop preservation, placement boundaries, field irrigation,
material overflow, save round trips and rejection, the 36th plant/harvest cell,
large-field picking and water-bed geometry. `tests/farmland-drag-ui.test.cjs`
checks valid/blocked drag preview, retained selection, cancellation and duplicate
release using isolated presentation collaborators, not a rendered browser.

The four canonical dry/water beds share the same runtime/export recipe path.
Their merged mesh budgets are below 1,500 triangles each. Type and geometry tests
do not establish browser appearance, touch behavior or physical-device speed.
