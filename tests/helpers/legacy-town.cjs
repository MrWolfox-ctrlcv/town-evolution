const assert = require('node:assert/strict');
const { CONFIG, importSave, isDockShore } = require('../../.domain-build/domain/game.js');
const { initializeFacility } = require('../../.domain-build/domain/commerce.js');
const { validatePlacement } = require('../../.domain-build/domain/geometry.js');

/**
 * Trusted test-only snapshot of a building owned before ordinary construction paused.
 * Historical costs preserve the pre-existing economy assertions. This is not a command
 * or a production bypass: the completed snapshot goes through the real save importer.
 */
function withLegacyBuilding(state, { kind, x, z, rotation }) {
  const next = structuredClone(state);
  const building = { id: `b${next.nextId++}`, kind, x, z, rotation: rotation ?? 0 };
  validatePlacement(next, building);
  if (kind === 'dock') {
    if (rotation === undefined)
      building.rotation = [0, 1, 2, 3].find((facing) =>
        isDockShore({ ...building, rotation: facing }, next.mapSeed, next.terrainVersion),
      );
    assert.ok(
      isDockShore(building, next.mapSeed, next.terrainVersion),
      'Legacy dock fixture requires a shore',
    );
  }
  next.coins -= CONFIG.buildings[kind].cost;
  if (kind === 'farm') building.cropJobs = Array(9).fill(null);
  next.buildings.push(building);
  initializeFacility(next.commerce, building);
  return importSave(JSON.stringify(next), next.lastSeenAt);
}

function withLegacyBuildingAtFreeCell(state, kind) {
  for (let z = 0; z < CONFIG.gridSize; z++)
    for (let x = 0; x < CONFIG.gridSize; x++) {
      const building = { id: `b${state.nextId}`, kind, x, z, rotation: 0 };
      try {
        validatePlacement(state, building);
      } catch {
        continue;
      }
      if (kind === 'dock' && !isDockShore(building, state.mapSeed, state.terrainVersion)) continue;
      return withLegacyBuilding(state, { kind, x, z });
    }
  assert.fail(`No valid existing-town fixture location for ${kind}`);
}

function withLegacyExpansion(state, buildingId = 'b1') {
  const next = structuredClone(state);
  const building = next.buildings.find((candidate) => candidate.id === buildingId);
  assert.equal(building?.kind, 'warehouse');
  building.kind = 'expandedWarehouse';
  next.coins -= CONFIG.expansionCost;
  return importSave(JSON.stringify(next), next.lastSeenAt);
}

module.exports = { withLegacyBuilding, withLegacyBuildingAtFreeCell, withLegacyExpansion };
