// Uses the real domain only; does not claim to render a Cocos game build.
const {
  createGame,
  dispatch,
  exportSave,
  importSave,
  CROP_KEYS,
  isDockShore,
  CONFIG,
} = require('../.domain-build/domain/game.js');
const { validatePlacement } = require('../.domain-build/domain/geometry.js');
let state = createGame(0);
function location(kind) {
  for (let z = 0; z < CONFIG.gridSize; z++) {
    for (let x = 0; x < CONFIG.gridSize; x++) {
      const building = { id: 'candidate', kind, x, z, rotation: 0 };
      try {
        validatePlacement(state, building);
        if (kind === 'dock' && !isDockShore(building, state.mapSeed)) continue;
        return { x, z };
      } catch {}
    }
  }
  throw new Error(`No legal location for ${kind}`);
}
function act(command, delay = 0) {
  const r = dispatch(state, command, state.lastSeenAt + delay);
  if (!r.ok) throw Error(r.error);
  state = importSave(exportSave(r.state), r.state.lastSeenAt);
  console.log(r.events.join('; '));
}
act({ type: 'place', kind: 'shop', ...location('shop') });
for (const item of ['wheat', 'lettuce']) act({ type: 'buyCrop', item, quantity: 1 });
for (const [cell, crop] of CROP_KEYS.entries())
  act({ type: 'plantCell', buildingId: 'b2', cell, crop });
for (const cell of [0, 1, 2])
  act({ type: 'harvestCell', buildingId: 'b2', cell }, cell === 0 ? 15000 : 0);
for (const item of CROP_KEYS)
  act({ type: 'shopTrade', buildingId: 'b3', item, quantity: 1, side: 'sell' });
act({ type: 'place', kind: 'dock', ...location('dock') });
const dock = state.buildings.at(-1).id;
for (const item of CROP_KEYS)
  act({ type: 'dockTransfer', buildingId: dock, item, quantity: 1, direction: 'stage' });
act({ type: 'dockShip', buildingId: dock, shipmentId: state.commerce.shipmentId });
act(
  { type: 'dockCollect', buildingId: dock, shipmentId: state.commerce.shipments[dock].id },
  30000,
);
console.log(
  JSON.stringify(
    {
      coins: state.coins,
      inventory: state.inventory,
      buildings: state.buildings.map((b) => b.kind),
    },
    null,
    2,
  ),
);
