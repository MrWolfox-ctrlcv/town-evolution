import { buildingMergePlan, footprint } from '../domain/game';
import type { GameState } from '../domain/game';
import { demoVillageFrame } from './CameraFraming';
import type { TownProfile } from './TownProfiles';
/** Frame actual saved entities. Never rely on fixture IDs or reset a progressed demonstration. */
export function profileFrame(profile: TownProfile, state: GameState) {
  if (profile === 'demo') return demoVillageFrame(state);
  if (profile !== 'v5-bridge-demo') return undefined;
  let bridge = state.buildings.find((b) => b.kind === 'woodenBridge');
  const piers = state.buildings.filter((b) => b.kind === 'woodenPier');
  if (!bridge)
    for (let i = 0; i < piers.length && !bridge; i++)
      for (let j = i + 1; j < piers.length && !bridge; j++) {
        try {
          bridge = buildingMergePlan(state, piers[i]!.id, piers[j]!.id).building;
        } catch {
          /* Try the next actual pair. */
        }
      }
  const points = bridge ? [bridge] : piers;
  if (!points.length) return undefined;
  const minX = Math.min(...points.map((b) => b.x)),
    minZ = Math.min(...points.map((b) => b.z));
  const maxX = Math.max(...points.map((b) => b.x + footprint(b).width)),
    maxZ = Math.max(...points.map((b) => b.z + footprint(b).depth));
  return {
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
    zoomScale: Math.max(1.6, Math.max(maxX - minX, maxZ - minZ) / 6.5),
  };
}
