# Object-bound context controls

Object details no longer occupy the bottom action shelf. Buildings, farms, ground piles,
standing trees, and harvestable natural stone/soil use one selected-object menu. Two or three
controls open in an upper fan; larger sets use a hollow outer orbit with a maximum of eight
visible controls. The object itself and gaps between buttons remain map input surfaces.

## Existing gameplay is preserved

- Building rotation, attached-material return, legacy collection/repurposing, shop trades,
  order fulfillment, and dock transfers/dispatch/collection retain their original domain commands.
- Commerce's existing material/transaction pagination is retained inside the orbit. If a small
  viewport fits fewer controls, a second visual-only page control exposes the remaining actions.
- Tree and natural-resource buttons call the same axe/gather commands used by drag tools.
- Farm planting, harvest strokes, watering, and material/tool drags retain their existing trays.
- The global orders and town-actions screens remain separate panels. Corrupt-save recovery and
  destructive-reset confirmations are never routed into an object menu.

## Anchoring and input

World extents come from rendered mesh vertices, cached per mesh, then transformed using current
node matrices. This also covers procedural meshes without Cocos precomputed min/max metadata.
Natural deposits use their shared rendered surface bounds. The selected extents are projected
on every controller tick, including camera pan/zoom, rotation, movement, and construction scale.
Physical pixels convert to logical canvas points through the same viewport/scale path as effects.

Buttons reserve a 12-point gap around the object, avoid visible tool/book regions, and remain at
least 44 points in each dimension. Near edges they fan inward. Offscreen selections have no
floating detached controls. Very tight views use compact controls and pagination; if fewer than
three fit, the remaining page can be dismissed by tapping empty map space. Zooming out restores
more space. Long map gestures and tool drags temporarily suppress the menu. Captured actions
cancel on changed selection/layout, a second contact, interruption, or dismissal.

## Verification

`radial-layout.test.cjs`, `radial-actions.test.cjs`, and `object-context.test.cjs` verify layout,
DPR conversion, occlusion-aware selection routes, real ActionButton gesture gates, paging,
close/reopen, stale order callback replacement, and bounds under translation/rotation/scale.
These are logic/presentation-collaborator tests, not rendered or device acceptance.

`scripts/preview/bottom-ui.cjs` is now the real-input radial regression despite its historical
filename. With a graphics-enabled official Cocos preview and Playwright it checks four viewport
sizes, actual model/button bounds, rotation, zoom, pan, close/reopen, and the global town panel.
It only inspects runtime state and drives real pointer input; it does not mutate runtime objects.
Set `PREVIEW_URL`, `COCOS_ENGINE` or `PREVIEW_TOOLS`, and optionally `CHROMIUM_EXECUTABLE`.
A passing source check or preview bundle is not evidence of a successful WebGL run.
