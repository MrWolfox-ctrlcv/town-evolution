import type { Node } from 'cc';
import { footprint, farmBoxCell } from '../domain/game';
import type { Building, EntitySnapshot, GameState } from '../domain/game';
import type { ModelFactory } from './ModelFactory';
/** Only selected physical sources and a pure result preview; recipe text is not revealed. */
export function entityAssemblyPreview(
  root: Node,
  factory: ModelFactory,
  state: GameState,
  sources: readonly EntitySnapshot[],
  result: Building | null,
  x: number,
  z: number,
  valid: boolean,
): void {
  const originY = state.terrainVersion === 6 ? root.position.y : 0;
  for (const s of sources) {
    const b = state.buildings.find((b) => b.id === s.id);
    if (!b) continue;
    const f = footprint(b);
    for (const side of [-1, 1])
      factory.shape(
        root,
        'SelectedEntity',
        b.x + f.width / 2 + side * f.width * 0.48 - x,
        (b.baseElevation ?? 0) - originY + 0.15,
        b.z + f.depth / 2 - z,
        0.06,
        0.05,
        f.depth * 0.9,
        valid ? '#84CED0' : '#D97168',
      );
  }
  if (!valid || !result) return;
  const preview = factory.building(
    result,
    Math.max(Date.now(), state.lastSeenAt),
    state.mapSeed,
    state.terrainVersion,
    state.landExtensions,
    result.baseElevation ?? 0,
  );
  preview.name = 'EntityAssemblyResult';
  preview.setPosition(
    result.x + footprint(result).width / 2 - x,
    (state.terrainVersion === 6 ? preview.position.y - originY : 0) + 0.025,
    result.z + footprint(result).depth / 2 - z,
  );
  root.addChild(preview);
  const box = farmBoxCell(result);
  if (box)
    for (const side of [-1, 1])
      factory.shape(
        root,
        'BoxFootprint',
        box.x + 0.5 + side * 0.48 - x,
        (result.baseElevation ?? 0) - originY + 0.15,
        box.z + 0.5 - z,
        0.06,
        0.05,
        0.9,
        '#84CED0',
      );
}
