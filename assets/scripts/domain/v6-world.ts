import { V6_GENERATOR_REVISION } from './v6-contracts';
import { isPreparedV6World } from './v6-terrain-builder';
import type { PreparedV6World } from './v6-build-terrain';
export { V6_GENERATOR_REVISION } from './v6-contracts';
export type { V6Terrain } from './v6-terrain';
const prepared = new Map<number, PreparedV6World>();
let activeSeed: number | null = null;
const validSeed = (seed: number) =>
  Number.isSafeInteger(seed) && seed >= 1 && seed <= 1_000_000_000;
/** Read only. Never turns an ordinary query into a synchronous world generator. */
export function hasPreparedV6World(seed: number): boolean {
  return validSeed(seed) && prepared.has(seed);
}
export function getPreparedV6World(seed: number): PreparedV6World {
  if (!validSeed(seed)) throw Error('Invalid v6 seed');
  const result = prepared.get(seed);
  if (!result) throw Error('Terrain6 must finish preparation before use');
  prepared.delete(seed);
  prepared.set(seed, result);
  return result;
}
/** The single visible session is protected while a candidate save/seed is prepared and validated. */
export function setActiveV6World(seed: number | null): void {
  if (seed !== null && !hasPreparedV6World(seed)) throw Error('Active terrain6 is not prepared');
  activeSeed = seed;
}
export function getV6World(seed: number) {
  return getPreparedV6World(seed).terrain;
}
/** Only branded, fully completed results may enter the bounded runtime cache. */
export function publishPreparedV6World(result: PreparedV6World): void {
  if (!isPreparedV6World(result) || result.terrain.revision !== V6_GENERATOR_REVISION)
    throw Error('Unprepared terrain6 result');
  const seed = result.terrain.seed;
  if (!validSeed(seed)) throw Error('Invalid v6 seed');
  prepared.delete(seed);
  prepared.set(seed, result);
  while (prepared.size > 2) {
    const removable = [...prepared.keys()].find((key) => key !== activeSeed && key !== seed);
    if (removable === undefined) throw Error('No inactive terrain6 cache slot');
    prepared.delete(removable);
  }
}
