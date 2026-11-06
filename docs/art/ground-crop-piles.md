# Harvested crop heaps

The ten-unit expansion previously laid harvested carrots and wheat in five-column,
non-overlapping rows. That made ground goods resemble another planted crop bed.
The corrected `CropPileKit` keeps roots and sheaves horizontal, groups them into a
compact fan, and builds overlapping layers of four, three, two, and one. The base
touches the ground and every raised unit has support below it. Existing single-good
shapes and colors are retained. Lettuce's existing layout is unchanged.

This is presentation-only: the ten-unit crop capacity, save format, quantities,
partial-merge overflow, and commands are unchanged. The rendered asset and its
selection bounds still both derive from the same canonical `ASSETS` mesh.

Tests cover all counts from one through ten, visible-good count, horizontal roots
and straw, low height, one-tile bounds, supported layers, finite geometry budgets,
partial merges, surplus, reload, and overflow rejection. A deterministic depth
projection at the game camera angle also guards against completely hiding units
under the heap. This is an offline mesh test, not Cocos/WebGL or pointer testing.

Maximum crop geometry remains under 6,000 vertices and triangles per model:
carrots use 3,300 vertices / 4,520 triangles and wheat uses 2,580 / 3,760 at ten.
Generated reference art informed the compact harvested silhouette; it is not an
in-game screenshot. Runtime rendering and real input still require a browser check.
