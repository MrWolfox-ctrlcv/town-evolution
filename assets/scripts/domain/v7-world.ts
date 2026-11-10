import { V7_GENERATOR_REVISION } from './v7-contracts';
import { isPreparedV7World } from './v7-terrain-builder';
import type { PreparedV7World } from './v7-build-terrain';
export { V7_GENERATOR_REVISION } from './v7-contracts';
export type { V6Terrain as V7Terrain } from './v6-terrain';
const prepared = new Map<number, PreparedV7World>();
let activeSeed: number | null = null;
const validSeed = (seed: number) =>
  Number.isSafeInteger(seed) && seed >= 1 && seed <= 1_000_000_000;
/** Read only. Never turns an ordinary query into a synchronous world generator. */
export function hasPreparedV7World(seed: number): boolean {
  return validSeed(seed) && prepared.has(seed);
}
export function getPreparedV7World(seed: number): PreparedV7World {
  if (!validSeed(seed)) throw Error('Invalid v7 seed');
  const result = prepared.get(seed);
  if (!result) throw Error('Terrain6 must finish preparation before use');
  prepared.delete(seed);
  prepared.set(seed, result);
  return result;
}
/** The single visible session is protected while a candidate save/seed is prepared and validated. */
export function setActiveV7World(seed: number | null): void {
  if (seed !== null && !hasPreparedV7World(seed)) throw Error('Active terrain6 is not prepared');
  activeSeed = seed;
}
export function getV7World(seed: number) {
  return getPreparedV7World(seed).terrain;
}
/** Only branded, fully completed results may enter the bounded runtime cache. */
export function publishPreparedV7World(result: PreparedV7World): void {
  if (!isPreparedV7World(result) || result.terrain.revision !== V7_GENERATOR_REVISION)
    throw Error('Unprepared terrain6 result');
  const seed = result.terrain.seed;
  if (!validSeed(seed)) throw Error('Invalid v7 seed');
  prepared.delete(seed);
  prepared.set(seed, result);
  while (prepared.size > 2) {
    const removable = [...prepared.keys()].find((key) => key !== activeSeed && key !== seed);
    if (removable === undefined) throw Error('No inactive terrain6 cache slot');
    prepared.delete(removable);
  }
}
