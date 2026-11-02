// Demonstrates the exact business layer used by Cocos; does not render or impersonate a game build.
const {
  createGame,
  dispatch,
  exportSave,
  importSave,
  CONFIG,
} = require('../.domain-build/domain/game.js');
let state = createGame(0);
function act(command, now) {
  const r = dispatch(state, command, now);
  if (!r.ok) throw Error(r.error);
  state = r.state;
  console.log(r.events.join('; '));
}
act({ type: 'start', buildingId: 'b2' }, 0);
act({ type: 'collect', buildingId: 'b2' }, CONFIG.cropDurationMs);
act({ type: 'sell', orderId: 'vegetable' }, CONFIG.cropDurationMs);
act({ type: 'place', kind: 'cooler', x: 5, z: 3 }, CONFIG.cropDurationMs);
const cooler = state.buildings.find((b) => b.kind === 'cooler');
act({ type: 'combine', warehouseId: 'b1', coolerId: cooler.id }, CONFIG.cropDurationMs);
act({ type: 'start', buildingId: 'b2' }, CONFIG.cropDurationMs);
act({ type: 'collect', buildingId: 'b2' }, 2 * CONFIG.cropDurationMs);
act({ type: 'start', buildingId: 'b1' }, 2 * CONFIG.cropDurationMs);
state = importSave(exportSave(state), 2 * CONFIG.cropDurationMs + CONFIG.coldDurationMs);
act({ type: 'collect', buildingId: 'b1' }, state.lastSeenAt);
act({ type: 'sell', orderId: 'chilledVegetable' }, state.lastSeenAt);
console.log(
  JSON.stringify(
    {
      coins: state.coins,
      inventory: state.inventory,
      completedOrders: state.completedOrders,
      buildings: state.buildings.map((b) => b.kind),
    },
    null,
    2,
  ),
);
