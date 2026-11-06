# Manual commerce MVP

These numbers are prototype defaults, not a live market or production economy.

## Facilities

| Facility    | Footprint | Cost | Role                                   |
| ----------- | --------- | ---- | -------------------------------------- |
| Shop        | 2×2       | 30   | Immediate fixed-price buy/sell         |
| Order board | 1×1       | 0    | Bulk warehouse orders                  |
| Dock        | 2×2       | 50   | Stage cargo, dispatch, settle shipping |

The order board is a free public facility: constructing it gives no coins or goods. All boards share the same offers and revision token. Players who have spent all starting coins can still build one and sell their harvest.

No facilities are injected into existing saves. Players build them explicitly. Planting consumes one harvested vegetable atomically. A new town starts with one vegetable; each touched mature cell yields two. Chilled vegetables cannot be planted.

- Carrot, wheat and lettuce: shop/direct buy 8, shop sell 5; shipping 6 per unit.
- Chilled vegetable: shop buy 16, sell 10; shipping 12 per unit.
- Each new shop has a finite purchase quota of 8 carrots, 8 wheat, 8 lettuce and zero chilled goods. Existing shop saves may retain up to four legacy chilled goods as preserved data, but buying them is disabled. No automatic replenishment. Player sales do not replenish quota and are never blocked by vendor storage.
- Bulk orders: 8 of any one crop for 56 coins, or 4 legacy chilled vegetables for 56 coins. Both offers share a revision token. Fulfilling either refreshes the revision; a repeated old submission cannot pay twice.
- Buying at the shop and reselling/shipping/fulfilling orders cannot create profit.

## Inventory and shipping

Warehouse inventory, dock staging cargo and in-transit cargo are distinct holdings. Dragging produce to the shop sells the requested quantity immediately; dragging to a dock only stages it. Warehouse capacity excludes dock cargo.

Each dock stages at most 16 items. A return moves staged cargo back only if warehouse capacity permits; rejected transfers retain all items. Dispatch snapshots all staged cargo, its fixed reward and a unique shipment receipt. Shipping lasts 30 seconds and never automatically pays. One shipment per dock; players may stage the next load during travel but cannot dispatch again until settling the prior shipment. Settlement after arrival pays once and does not require warehouse space. Coin overflow preserves the claimable shipment. Cargo already dispatched cannot be withdrawn.

Offline time uses the existing monotonic game clock. Loading an elapsed shipment makes it claimable, not claimed. There are no automatic routes, processing pipelines, recurring restocks, timers in domain, accounts or payments.

## Public commands

All commands pass through `dispatch`; failure returns the unchanged original state.

- `shopTrade { buildingId, item, quantity, side: 'buy' | 'sell' }`
- `orderFulfill { buildingId, orderId, offerId }`: use `commerce.offerId`.
- `dockTransfer { buildingId, item, quantity, direction: 'stage' | 'return' }`
- `dockShip { buildingId, shipmentId }`: use next `commerce.shipmentId`.
- `dockCollect { buildingId, shipmentId }`: use that dock's existing shipment `id`.

`COMMERCE` contains presentation-readable prices, order quantities and durations. `commerce.shopStock[buildingId]`, `dockCargo[buildingId]` and `shipments[buildingId]` contain facility state. UI must not mutate these directly. Old `sell` is deprecated; it preserves old batch quantities but now requires an existing order board. New UI uses `orderFulfill` only.

## Current saves

Schema 8 is the current seeded-island state. The user authorized clearing the old prototype test saves, so old schemas are rejected by the domain importer and selectively removed by the storage adapter. Only known game-owned old-test keys are eligible; current, future-version and unrelated browser data are preserved. Normal-town and demonstration-town storage are separate. Current saves validate every inventory, production job, shipment, terrain coordinate and tool count, and never regenerate progress on load.

## Income-access recovery

Without any trade facility, new nontrade construction must leave at least one free tile for the free public order board. This reserves no fixed coordinate and does not alter imported maps.

An explicit `repurposeToBoard { buildingId }` recovery command is available only while no trade facility exists. It converts a cooler or idle farm into a public order board, preserving the building ID, position and rotation, shrinking its footprint to 1×1, and changing neither coins nor inventory. It grants no refund. UI must ask for confirmation. Active farms, the last remaining farm, and warehouses cannot be repurposed, so no crops/jobs/storage are destroyed. This also permits recovering fully occupied legacy maps with a cooler or idle farm; legacy maps with neither remain unsupported rather than silently deleting progress.

## Manual UI contract

Click each facility to open its dedicated panel. The shop offers crop selection and quantity 1, 4 or all (default 1), with explicit buy/sell buttons. The order board fulfills bulk orders. The dock exposes staging, return, dispatch, a 30-second transit countdown and explicit settlement.

Dragging a harvested-stock chip transfers exactly one item: onto a shop it sells immediately; onto a dock it only stages cargo and grants no coins. There is no unlimited sprout tool. Dragging one vegetable to an empty field plants it and consumes it; dragging chilled goods to a field does not plant. Recovery requires confirmation before converting an eligible facility. Runtime interaction coverage must be verified separately from domain tests.

## Nine-cell farming and direct purchase

Each farm contains a 3×3 array indexed `row * 3 + column`, 0–8. `plantCell { buildingId, cell, crop }` consumes one unit of the selected crop and starts that cell's independent 15-second job. `harvestCell { buildingId, cell }` collects exactly two vegetables from that mature cell and clears only its job. Every job has its own unique ID; repeated/early harvests and occupied-cell planting reject without changing resources. Previously started cold-processing tasks retain their whole-building job and may be collected; starting a new cold task is disabled. Legacy farm `start`/`collect` commands map to cell 0 only; new UI uses explicit cell commands.

`buyCrop { item, quantity }` directly buys any of the three crops for 8 coins each, without requiring a shop and without a finite purchase quota. The warehouse must have room and currency is deducted atomically. Selling all crops is allowed; there is no hidden last-seed lock, automatic partial shipping, debt, or seed swap.

The one-time `recoverCrop` action is explicit and available only when coins are below the 8-coin purchase price, no warehouse/staged vegetables exist, and no farm cell is growing. It grants one vegetable, no coins, and consumes the persisted flag. Full storage rejects without consuming eligibility. Normal play uses direct purchases. New towns start with one vegetable and one unused emergency recovery. The eligibility is persisted and never reset by loading.

Current saves require exactly nine cells and a recognized crop identity on every planted cell, valid unique job IDs and exact production duration. Malformed current saves remain preserved by the existing backup adapter.

## Building movement

`moveBuilding { buildingId, x, z }` relocates a building at no cost. It preserves the building ID, rotation, all farm-cell jobs, cold-processing jobs and commerce records. Production may continue during a move. Overlap, fractional coordinates and out-of-map positions reject atomically and leave the original building untouched. The UI uses long-press pickup, pointer-following preview and release to request the move; a compatible merge target still uses the existing atomic merge command.

## Three real crops and save compatibility

`Crop` is `vegetable | wheat | lettuce`. The old `vegetable` key now represents carrots, labelled 胡萝卜; it is not a fourth generic crop. `CROPS` and `CROP_KEYS` define the actual planting choices. Each crop currently takes 15 seconds and yields two units from one input. Timers/prices are deliberately equal prototype defaults; the stocks, selected planting crop and resulting harvest are genuinely independent.

The old `vegetable` code identifier is retained as the carrot item key. Current saves require all stock fields and recognized cell crop identities. Chilled goods remain compatibility-only clearing inventory and are not a planting or crop-tray choice.

## Shoreline docks

Moved docks and new departures require their entire footprint on actual land and water immediately beyond their whole exit edge, in the dock's saved orientation. The shared mask uses the town's saved seed, terrain version and reclaimed tiles; no fixed z row or fake visual inlet makes an inland departure legal. The demo fixture finds a real legal shoreline footprint from the same rules.

Historical inland or incorrectly oriented docks remain readable without moving or deleting them. Staging and unloading remain available, and voyages already in transit can still settle exactly once. Only a new departure is blocked until the player moves or rotates the dock to a valid coast. Panel availability and the departure command use the same rule and relocation message.

## Retired cold-production path

Fresh shops contain zero chilled stock. Direct crop purchase never offers chilled goods, and shop purchases of chilled goods are rejected even if an old shop record still contains some. Starting a new cold-processing task is rejected. Previously started jobs remain collectable, and existing inventory, staged cargo and shipment receipts remain sellable/returnable/settleable. No old data is erased or converted into unrelated crops.
