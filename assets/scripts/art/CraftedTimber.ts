import { wood } from './BuildingCore';
import type { Part, V3 } from './AssetTypes';

/** Existing sawn-wood material and UV pipeline, with concept-led chamfers. */
export function craftedTimber(name: string, position: V3, size: V3): Part {
  return { ...wood(name, position, size), shape: 'sawnTimber' };
}
export function woodenDowel(name: string, position: V3): Part {
  return { ...wood(name, position, [0.032, 0.012, 0.032], [90, 0, 0], '#FFF0D9'), shape: 'log' };
}
