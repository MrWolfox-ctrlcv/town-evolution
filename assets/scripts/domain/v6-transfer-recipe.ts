import { V6_GENERATOR_REVISION, V6_SIZE } from './v6-contracts';
import { V5_HYDROLOGY_REVISION } from './v6-hydrology-base';
import { V5_NATURAL_COAST_REVISION } from './v5-natural-coast-types';
import type { NaturalCoastFeature } from './v5-natural-coast-types';
import type { V6Starter } from './v6-build-starter';

export interface V6TransferRecipe {
  readonly seed: number;
  readonly feature: NaturalCoastFeature;
  readonly starter: Pick<V6Starter, 'pockets' | 'treeCandidates'>;
  readonly bounds: readonly [number, number, number, number];
}
function invalid(): never {
  throw Error('Invalid v6 transfer recipe');
}
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    return invalid();
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== fields.length ||
    keys.some((key) => typeof key !== 'string' || !fields.includes(key))
  )
    return invalid();
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return invalid();
  }
  return value as Record<string, unknown>;
}
function number(value: unknown, min: number, max: number, integer = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    return invalid();
  return value;
}
function array(value: unknown, min: number, max: number): unknown[] {
  if (
    !Array.isArray(value) ||
    value.length < min ||
    value.length > max ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Reflect.ownKeys(value).length !== value.length + 1
  )
    return invalid();
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return invalid();
  }
  return value;
}
function feature(value: unknown, seed: number): NaturalCoastFeature {
  const f = record(value, [
    'version',
    'baseRevision',
    'seed',
    'anchor',
    'rotation',
    'halfWidth',
    'fullBedHalfWidth',
    'gateway',
    'fadeLength',
    'leftShoulder',
    'rightShoulder',
    'bedUpper',
    'region',
    'generatedObjects',
  ]);
  if (
    f.version !== V5_NATURAL_COAST_REVISION ||
    f.baseRevision !== V5_HYDROLOGY_REVISION ||
    f.seed !== seed ||
    f.halfWidth !== 8 ||
    f.fullBedHalfWidth !== 3.25 ||
    f.fadeLength !== 3 ||
    f.bedUpper !== -1.3 ||
    f.generatedObjects !== 0
  )
    return invalid();
  const a = record(f.anchor, ['x', 'z', 'width', 'depth']);
  if (a.width !== 2 || a.depth !== 2) return invalid();
  const anchor = Object.freeze({
    x: number(a.x, 1, V6_SIZE - 3, true),
    z: number(a.z, 1, V6_SIZE - 3, true),
    width: 2 as const,
    depth: 2 as const,
  });
  const rotation = number(f.rotation, 0, 3, true) as 0 | 1 | 2 | 3;
  const gateway = number(f.gateway, 4, 12, true);
  const r = record(f.region, ['u', 'v']);
  const u = array(r.u, 2, 2),
    v = array(r.v, 2, 2);
  if (u[0] !== -10 || u[1] !== 10 || v[0] !== -6 || v[1] !== gateway + 5) return invalid();
  return Object.freeze({
    version: V5_NATURAL_COAST_REVISION,
    baseRevision: V5_HYDROLOGY_REVISION,
    seed,
    anchor,
    rotation,
    halfWidth: 8,
    fullBedHalfWidth: 3.25,
    gateway,
    fadeLength: 3,
    leftShoulder: number(f.leftShoulder, 2.2, 3.6),
    rightShoulder: number(f.rightShoulder, 2.5, 4.1),
    bedUpper: -1.3,
    region: Object.freeze({
      u: Object.freeze([-10, 10] as const),
      v: Object.freeze([-6, gateway + 5] as const),
    }),
    generatedObjects: 0,
  });
}
function starter(value: unknown): V6TransferRecipe['starter'] {
  const s = record(value, ['pockets', 'treeCandidates']);
  // A successful builder always supplies one mountain and one hill, in that order.
  const pockets = array(s.pockets, 2, 2).map((value, i) => {
    const p = record(value, ['x', 'z', 'biome', 'd', 'angle', 'rx', 'rz', 'peak']);
    const biome = i === 0 ? ('mountain' as const) : ('hill' as const);
    const rx = i === 0 ? 2.7 : 2.4,
      rz = i === 0 ? 2.15 : 1.9,
      peak = i === 0 ? 2.8 : 1.8;
    if (p.biome !== biome || p.rx !== rx || p.rz !== rz || p.peak !== peak) return invalid();
    const x = number(p.x, 9, 33, true),
      z = number(p.z, 9, 33, true);
    const d = number(p.d, 0, 25);
    if (d >= 25 || d !== Math.hypot(x - 5, z - 5)) return invalid();
    return Object.freeze({ x, z, biome, d, angle: number(p.angle, 0, Math.PI), rx, rz, peak });
  });
  if (pockets[0]!.x === pockets[1]!.x && pockets[0]!.z === pockets[1]!.z) return invalid();
  const seen = new Set<string>();
  const treeCandidates = array(s.treeCandidates, 0, 18).map((value) => {
    const t = record(value, ['x', 'z']);
    const x = number(t.x, 1, 35, true),
      z = number(t.z, 1, 35, true);
    const key = `${x},${z}`;
    if (seen.has(key) || (x <= 9 && z <= 7) || Math.hypot(x - 5, z - 5) <= 6) return invalid();
    seen.add(key);
    return Object.freeze({ x, z });
  });
  Object.freeze(pockets);
  Object.freeze(treeCandidates);
  return Object.freeze({ pockets, treeCandidates });
}
/** Same-origin worker IPC schema validation, not proof of canonical terrain or save import. */
export function validateV6TransferRecipe(value: unknown, expectedSeed: number): V6TransferRecipe {
  number(expectedSeed, 1, 1_000_000_000, true);
  const dto = record(value, [
    'format',
    'revision',
    'seed',
    'feature',
    'starter',
    'bounds',
    'lattice',
    'complete',
  ]);
  if (dto.format !== 1 || dto.revision !== V6_GENERATOR_REVISION || dto.seed !== expectedSeed)
    return invalid();
  const b = array(dto.bounds, 4, 4);
  const bounds = Object.freeze([
    number(b[0], 0, V6_SIZE - 1, true),
    number(b[1], 0, V6_SIZE - 1, true),
    number(b[2], 1, V6_SIZE, true),
    number(b[3], 1, V6_SIZE, true),
  ] as const);
  if (bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) return invalid();
  return Object.freeze({
    seed: expectedSeed,
    feature: feature(dto.feature, expectedSeed),
    starter: starter(dto.starter),
    bounds,
  });
}
