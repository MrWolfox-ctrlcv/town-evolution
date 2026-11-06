# Generated product and digging-category icons

The product rail uses the supplied ImageGen artwork for dry `soil` (土壤), wet
`mud` (泥土) and `treeSeed` (树种). The original 1536×1024 RGBA PNG files are
retained without pixel edits under `assets/resources/crop-icons/`. Dry soil uses
the warm, angular earth mound with roots and small sprouts; wet mud keeps its
separate low, dark clay image.

- `soil.png`: SHA-256 `13ccf4deda7b4c812c1ca0b77109aea21af094536e3f965f45787419358053e2`.
- `mud.png`: SHA-256 `964f830bc3355f76eceb921f7605367b97ee2c619327929fb8f217bcf73f314a`.
- `tree-seed.png`: SHA-256 `1be35def02f463bac5aae6cc95c83ee5752898a6b9e8eebb9fd9a57869d94f98`.

`ProductIconRegions.ts` specifies display-only sprite regions around the actual
subjects, with 16 pixels of transparent padding. `CropArtwork` preserves their
aspect ratio at the rail's 40px size, the 48px drag ghost, the 30px collection
flight and reusable 54px icons. This prevents the wide transparent source
canvas from making the mud icon appear tiny. The same regions are used by action
buttons. Existing silhouettes are only retained while images load or if loading
fails, rather than replacing the supplied artwork.

The soil display region is `(310, 208, 897, 621)`, including 16 pixels around
the foreground with alpha greater than 1. The source contains very faint
alpha-1 noise outside that region; no pixels or alpha values are rewritten.
The soil source has 1,249,675 fully transparent pixels and alpha range 0–254.
The original full canvas remains available to Creator. At 40px, the display
region is 40×27.69px; the wider mound does not stretch into a square or spill
outside the product tile. The fallback is a dry, faceted block, not the wet
mud fallback.

`TrayIcons` loads soil for the sidebar, drag ghost and collection flights;
`ActionArtwork` loads the same resource and region for soil action buttons,
including disabled tint. The recipe handbook currently renders the actual
world-model thumbnails, so its soil/mud model previews are intentionally
unchanged by this inventory-image update.

Each image has a stable Cocos image/texture `.meta` file with alpha preserved.
Both Creator resource-bundle loading and standalone-preview image paths are
covered by isolated presentation tests. The preview builder copies every PNG in
this directory; no hand-maintained copy list is needed.

## Digging category

The static digging-tool tile uses `digging-tools.png`, the supplied generated
crossed shovel-and-pickaxe image. Its source bytes are unchanged (SHA-256
`c16c6ec872f8c7801daa5cdee63155c3f9d6d5a83bee8580ffb381cacedf72e7`).
The display crop is `(242, 42, 1045, 968)`, with 16px transparent padding around
the foreground. Its Cocos image/texture metadata preserves alpha.

`diggingCategory` is a presentation-only appearance, not a new gameplay tool.
`ToolTray.tile` selects it for the static tile, while pointer capture continues
to start `diggingTool`. Dragging over soil uses the existing single shovel;
dragging over stone uses the existing single pickaxe. The static category stays
unchanged during the gesture. A focused test exercises tile creation, pointer
start, soil/stone/soil transitions and release.

## Verification

- `npm run check`: passed with 1,341/1,341 tests at the soil-image checkpoint,
  including official Cocos 3.8.8 and domain TypeScript checks, formatting,
  project structure (209 unique asset IDs), architecture (171 modules), and all
  134 canonical glTF export checks.
- `npm run demo:domain`: passed.
- Pinned real-engine standalone build: passed at
  `build/soil-image-review`; all four image copies match the source bytes.
- 26 focused icon/mining tests pass. Nine generated-image tests cover the two
  load paths, 30–54px aspect-ratio sizing,
  real tray/ghost/collection wiring, disabled action tint, asynchronous image
  replacement, failure fallback, source hashes and balanced disposal. Soil
  action errors and late/disposed requests are also covered at the 28px button
  size. The tray/ghost/flight fixture uses the 390×844 phone canvas.
- Alpha inspection confirms transparent backgrounds and preserved foreground
  padding, including the soil source's alpha-1 noise noted above. The supplied
  source files are unchanged.

These are source/asset/build checks, not a rendered browser or physical-phone
review. Creator editor import and Creator Web/Android exports were not run.

## Production-route additions (2026-11-06)

Five new inventory goods now reuse their original generated RGBA PNGs:
`rice`, `sapling`, `milled-rice`, `flour`, and `bread`. Source filenames,
SHA-256 hashes, dimensions, alpha ranges, and display-only crop regions are
recorded in `new-route-icons.json`. Pixels and alpha have not been rewritten.
The bread's source RGB has a warm halo in transparent areas, but alpha greater
than 1 is tightly confined to the loaf. The display crop includes 16px padding.

The product rail, held ghost, collection flights, and action icons share these
resources and their aspect ratios. Unlike older fallback symbols, the new goods
do not draw substitute vector silhouettes while loading. The existing generated
icon tests now exercise both asset-loading paths and 30/40/48/54px display sizes
for all five additions. These are isolated loading/layout checks, not GPU review.

World-model thumbnails still use the canonical live meshes. The expanded
handbook keeps its existing 2MiB RGBA atlas budget by using 112px cells; all
models retain vertex-derived framing and fit their padded capture regions.
