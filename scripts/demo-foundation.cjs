// Deterministic domain demonstration, not a renderer or device test.
const {
  createGame,
  dispatch,
  importSave,
  exportSave,
  getCapacity,
  CONFIG,
} = require('../.domain-build/domain/game.js');
const { validatePlacement } = require('../.domain-build/domain/geometry.js');
let state = createGame(0),
  steps = 0;
function act(command) {
  const r = dispatch(state, command, state.lastSeenAt);
  if (!r.ok) throw new Error(r.error);
  state = importSave(exportSave(r.state), r.state.lastSeenAt);
  steps++;
}
for (const tree of [...state.trees].slice(0, 3))
  act({ type: 'useTool', tool: 'axe', treeId: tree.id });
let location;
for (let z = 0; z < CONFIG.gridSize && !location; z++) {
  for (let x = 0; x < CONFIG.gridSize && !location; x++) {
    try {
      validatePlacement(state, { id: 'candidate', kind: 'warehouse', x, z, rotation: 0 });
      location = { x, z };
    } catch {}
  }
}
if (!location) throw new Error('No legal warehouse construction site');
for (let i = 0; i < 3; i++) act({ type: 'dropProduct', item: 'wood', ...location });
act({ type: 'useTool', tool: 'saw', ...location });
console.log(
  JSON.stringify(
    {
      steps,
      coins: state.coins,
      warehouseCapacity: getCapacity(state),
      wood: state.inventory.wood,
      groundStacks: state.groundStacks,
      tools: state.tools,
      buildings: state.buildings.map((b) => b.kind),
    },
    null,
    2,
  ),
);
