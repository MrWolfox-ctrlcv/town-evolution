import { nurseryStage, processingStage, compostStage } from '../domain/game';
import type { Building, GameState } from '../domain/game';
import { farmVisuals } from '../art/FarmCellKit';
export function buildingVisualSignature(state: GameState, b: Building, now: number): string {
  return [
    state.mapSeed,
    state.terrainVersion,
    JSON.stringify(state.landExtensions),
    b.kind,
    b.baseElevation,
    b.x,
    b.z,
    b.rotation,
    b.farmSize,
    b.irrigated,
    b.dockStyle,
    b.boatAttached,
    b.bridge?.length,
    JSON.stringify(b.collectionBox),
    b.compost ? compostStage(b.compost, now) : '',
    b.kind === 'nursery' ? nurseryStage(b, now) : processingStage(b, now),
    JSON.stringify(state.fusion.attachments[b.id] ?? {}),
    b.kind === 'farm' ? farmVisuals(b.cropJobs, now).join(',') : Boolean(b.job),
  ].join(':');
}
