import type { BridgePlacement } from './bridge-types';
import type { LandCell } from './types';
import { getEditableWorld } from './editable-world';
import type { TerrainVersion } from './world';
import { requireRule } from './guards';

/** Deliberately bounded timber crossing, not a universal cliff bridge. */
export const V6_BRIDGE = {
  rampLength: 2,
  clearance: 0.38,
  maximumRise: 2,
  maximumSlope: 1.5,
} as const;
export function v6BridgeWorldPoint(p: BridgePlacement, x: number, z: number): LandCell {
  const odd = p.rotation % 2 === 1,
    sign = p.rotation < 2 ? 1 : -1;
  return {
    x: p.x + (odd ? p.length : 2) / 2 + sign * (odd ? z : x),
    z: p.z + (odd ? 2 : p.length) / 2 + sign * (odd ? -x : z),
  };
}
/** No terrain edits are allowed beneath a crossing, so cleared ground is its sole authority.
 * The quarter-grid is the actual rendered ground lattice, not a center-height estimate. */
export function v6BridgeProfile(seed: number, p: BridgePlacement, version: TerrainVersion = 6) {
  const world = getEditableWorld(seed, version);
  const ground = (x: number, z: number) => {
    const q = v6BridgeWorldPoint(p, x, z);
    return world.groundHeight(q.x, q.z);
  };
  let high = -Infinity,
    low = Infinity;
  for (let j = 0; j <= p.length * 4; j++)
    for (let i = 0; i <= 8; i++) {
      const h = ground(i / 4 - 1, j / 4 - p.length / 2);
      high = Math.max(high, h);
      if (j === 0 || j === p.length * 4) low = Math.min(low, h);
    }
  const deck = high + V6_BRIDGE.clearance;
  requireRule(
    Number.isFinite(deck) && deck - low <= V6_BRIDGE.maximumRise,
    '河岸高差超过当前木桥坡道范围',
  );
  const height = (x: number, z: number): number => {
    const distance = p.length / 2 - Math.abs(z);
    if (distance >= V6_BRIDGE.rampLength) return deck;
    const edge = (Math.sign(z || 1) * p.length) / 2;
    const t = Math.max(0, distance) / V6_BRIDGE.rampLength;
    return Math.max(ground(x, z), ground(x, edge) * (1 - t) + deck * t);
  };
  for (const side of [-1, 1])
    for (let j = 0; j < 8; j++)
      for (let i = 0; i <= 8; i++) {
        const x = i / 4 - 1,
          z = side * (p.length / 2 - j / 4);
        requireRule(
          Math.abs(height(x, z) - height(x, z - side / 4)) * 4 <= V6_BRIDGE.maximumSlope,
          '河岸坡度超过当前木桥坡道范围',
        );
        if (i < 8)
          requireRule(
            Math.abs(height(x, z) - height(x + 0.25, z)) * 4 <= V6_BRIDGE.maximumSlope,
            '河岸横坡超过当前木桥坡道范围',
          );
      }
  return { deck, root: deck - 0.38, height, ground };
}
/** A sloped river-bank platform stands on posts; it never levels the protected bank. */
export function v6RiverPierHeight(
  seed: number,
  cells: readonly LandCell[],
  version: TerrainVersion = 6,
): number | null {
  const world = getEditableWorld(seed, version),
    hydro = world.hydrology;
  if (
    !cells.every(
      (p) => hydro.at(p.x, p.z)?.state === 'dryBuildable' && !world.at(p.x, p.z)?.reserved,
    )
  )
    return null;
  if (
    !cells.some((p) =>
      [
        [-2, 0],
        [2, 0],
        [0, -2],
        [0, 2],
      ].some(([dx, dz]) => {
        const c = hydro.at(p.x + dx!, p.z + dz!);
        return c?.waterKind === 'river';
      }),
    )
  )
    return null;
  let lo = Infinity,
    hi = -Infinity;
  for (const p of cells)
    for (let j = 0; j <= 4; j++)
      for (let i = 0; i <= 4; i++) {
        const h = world.groundHeight(p.x + i / 4, p.z + j / 4);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
  requireRule(
    hi - lo <= V6_BRIDGE.maximumRise - V6_BRIDGE.clearance,
    '河岸高差超过当前栈桥桩基范围',
  );
  return hi;
}
