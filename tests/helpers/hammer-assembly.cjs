const assert = require('node:assert/strict');

/** Explicitly select these entities now; never add a hammer inside a generic dispatch helper. */
function hammerAssemblyCommand(state, ids) {
  return {
    type: 'hammerAssembly',
    tool: 'hammer',
    sources: ids.map((selectedId) => {
      const building = state.buildings.find((candidate) => candidate.id === selectedId);
      assert.ok(building, `Selected assembly entity ${selectedId} exists`);
      const { id, kind, x, z, rotation } = building;
      return { id, kind, x, z, rotation };
    }),
  };
}
module.exports = { hammerAssemblyCommand };
