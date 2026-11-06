# Demonstration campaign regression

`tests/demo-campaign.test.cjs` verifies complete, reachable player paths starting
from an untouched `createDemoGame` state. It runs independently for the Cocos
3.8.8 native-touch, web-touch and mouse input-source routes. Each run uses a new
session and storage map, with a controlled game clock and mocked `Date.now`.

## Run

```sh
npm run build:domain
node --test tests/demo-campaign.test.cjs
```

The test is also included in `npm test` and `npm run check`.

## Player paths

- Chop four visible trees, drag individual wood units onto exposed ground, and
  saw one, two and four wood into a board, crate and house. Drag the newly created
  parts together to make a warehouse and shop. Check the capacity increase and
  real shop stock.
- Water the initial five-plus-four soil piles into one mud. Mine eight visible
  soil resource blocks, individually drop all 72 new soil units, water each batch,
  merge the resulting mud into the first newly crafted pile, and expand a
  connected coastal tile. The preplaced nine-mud sample is not used as a shortcut.
- Drag-merge three small dry fields. Preserve all nine existing crop jobs in the
  36-cell large field. Reject irrigation while dry crops remain, advance the clock
  to maturity, harvest each job, check each crop's yield, and irrigate the empty
  large field.
- Collect the initial arrived shipment, drag a whole crop pile into the dock,
  verify staging does not sell it, dispatch, reject early collection, advance to
  arrival, collect through the production button and reject a duplicate receipt.
- Reload the persisted state at each stage and after each soil-conversion batch.
  Inventory, buildings, resources and land are never patched to manufacture a
  passing path. Read-only planning uses ordinary domain dispatch snapshots.

## What actually runs

The input fixture uses the checked-in Cocos 3.8.8 input source, pointer dispatcher
and node processor. Production ToolTray, ToolRouter, MapGesture, ObjectDrag,
StockDrag, ToolUseDrag, FarmTools, TownView, model/resource pickers, ModelFactory
building assembly, GameSession, domain rules, storage, commerce actions and
ActionButton execute. MapGesture receives input through the engine source route;
its thin screen-to-world routing adapter is not a replacement MapCamera test.

The three small helpers keep concerns separate:

- `demo-campaign-scene.cjs`: CPU scene transforms, canonical assets and production
  presentation loading. It does not extract another test's source text.
- `demo-campaign-ui.cjs`: independent session/clock, contact delivery, exposed
  target selection, persistence checkpoints and cleanup.
- `cocos-input-route.cjs`: shared real-engine input path. Its optional hit-test
  collaborator retains the existing tray default for other tests.

## Limits

Physical contacts, UI hit testing, analytic ray projection and CPU scene
transforms are collaborators. Materials, lighting, animation and GPU rendering
are not instantiated. The decorative over-water pier is excluded; dock targets
use the actual main building mesh. The controlled clock deliberately does not
wait real crop or shipping durations. The early and duplicate shipment guards
also receive direct domain commands to verify rejection.

This regression establishes reachable input/state/persistence chains. It does
not claim a rendered browser screenshot, visual usability, Creator import/export,
Android build, physical-phone behavior or device performance. Existing focused
input, occlusion, interruption, layout and storage tests remain necessary.
