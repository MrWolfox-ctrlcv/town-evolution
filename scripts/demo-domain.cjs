// Uses the real domain only; does not claim to render a Cocos game build.
const {
  createGame,
  createDemoGame,
  dispatch,
  exportSave,
  importSave,
  CROP_KEYS,
  CROPS,
  CONFIG,
} = require('../.domain-build/domain/game.js');
const { validatePlacement } = require('../.domain-build/domain/geometry.js');
let state = createGame(0);
function synthesisLocation(kind) {
  for (let z = 0; z < CONFIG.gridSize; z++) {
    for (let x = 0; x < CONFIG.gridSize; x++) {
      try {
        validatePlacement(state, { id: 'candidate', kind, x, z, rotation: 0 });
        return { x, z };
      } catch {}
    }
  }
  throw new Error(`No legal ${kind} synthesis location`);
}
function act(command, delay = 0) {
  const r = dispatch(state, command, state.lastSeenAt + delay);
  if (!r.ok) throw Error(r.error);
  state = importSave(exportSave(r.state), r.state.lastSeenAt);
  console.log(r.events.join('; '));
}
function summary(profile) {
  console.log(
    JSON.stringify(
      {
        profile,
        coins: state.coins,
        inventory: state.inventory,
        buildings: state.buildings.map((b) => b.kind),
      },
      null,
      2,
    ),
  );
}

// Each axe harvest needs four free slots. Build between harvests instead of overfilling storage.
console.log('正常小镇：材料合成与扩建');
const trees = state.trees.slice(0, 4);
for (const tree of trees.slice(0, 2)) act({ type: 'useTool', tool: 'axe', treeId: tree.id });
const houseSite = synthesisLocation('house');
act({ type: 'dropProduct', item: 'wood', quantity: 4, ...houseSite });
act({ type: 'useTool', tool: 'hammer', ...houseSite });
const house = state.buildings.at(-1).id;
act({ type: 'useTool', tool: 'axe', treeId: trees[2].id });
const crateSite = synthesisLocation('crate');
act({ type: 'dropProduct', item: 'wood', quantity: 2, ...crateSite });
act({ type: 'useTool', tool: 'hammer', ...crateSite });
const crate = state.buildings.at(-1).id;
act({
  type: 'hammerAssembly',
  tool: 'hammer',
  sources: [crate, house].map((selectedId) => {
    const { id, kind, x, z, rotation } = state.buildings.find((b) => b.id === selectedId);
    return { id, kind, x, z, rotation };
  }),
});
act({ type: 'useTool', tool: 'axe', treeId: trees[3].id });
act({ type: 'attachMaterial', buildingId: house, item: 'wood', quantity: 2 });
act({ type: 'useTool', tool: 'hammer', buildingId: house });
summary('normal');
console.log('普通建造与金币扩容已暂停；公告牌和商店可经材料配方合成。');

// Commerce remains usable for existing facilities, as supplied by the playable demo fixture.
state = createDemoGame(30000);
console.log('演示岛：使用已有设施完成种植、交易与出货');
const farm = state.buildings.find((b) => b.kind === 'farm').id;
const shop = state.buildings.find((b) => b.kind === 'shop').id;
const dock = state.buildings.find((b) => b.kind === 'dock').id;
act({ type: 'dockCollect', buildingId: dock, shipmentId: state.commerce.shipments[dock].id });
for (const [index, crop] of CROP_KEYS.filter((crop) => CROPS[crop].field === 'dry').entries())
  act({ type: 'plantCell', buildingId: farm, cell: index + 6, crop });
const waterFarm = state.buildings.find((b) => b.kind === 'farm' && b.irrigated && !b.farmSize).id;
act({ type: 'plantCell', buildingId: waterFarm, cell: 0, crop: 'rice' });
for (const cell of [6, 7, 8])
  act({ type: 'harvestCell', buildingId: farm, cell }, cell === 6 ? 15000 : 0);
act({ type: 'harvestCell', buildingId: waterFarm, cell: 0 });
// Harvesting creates loose drops. Only these explicit pickup commands move them into stock.
for (const drop of [...state.looseDrops]) act({ type: 'pickupDrop', dropId: drop.id });
for (const item of CROP_KEYS)
  act({ type: 'shopTrade', buildingId: shop, item, quantity: 1, side: 'sell' });
for (const item of CROP_KEYS)
  act({ type: 'dockTransfer', buildingId: dock, item, quantity: 1, direction: 'stage' });
act({ type: 'dockShip', buildingId: dock, shipmentId: state.commerce.shipmentId });
act(
  { type: 'dockCollect', buildingId: dock, shipmentId: state.commerce.shipments[dock].id },
  30000,
);
summary('demo');
