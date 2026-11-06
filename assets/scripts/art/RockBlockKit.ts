import type { MeshData, V3 } from './AssetTypes';
import { naturalQuad, terrainHash } from './NaturalMesh';
import { valueNoise } from '../domain/noise';
export interface RockExposure {
  top: boolean;
  bottom?: boolean;
  /** A low, exposed ledge may carry a thin moss cap, never another resource. */
  moss?: boolean;
}
type Point = readonly [number, number];
/**
 * One saved stone unit, one connected angular rock, inside its original unit cell.
 * Broad cut planes replace the former planar cube's microscopic noise. No chips,
 * detached pebbles, random frame movement, or visual-only collectible geometry.
 */
export function appendRockUnit(
  mesh: MeshData,
  origin: V3,
  seed: number,
  exposure: RockExposure,
): void {
  const hash = (salt: number) =>
    terrainHash(seed + salt, origin[0] * 2, Math.round(origin[1]) * 2, origin[2] * 2);
  const inset = 0.025 + hash(11) * 0.035;
  const cuts = Array.from({ length: 8 }, (_, i) => 0.1 + hash(i * 137 + 19) * 0.12);
  const ring = (margin: number, scale: number): Point[] => [
    [margin + cuts[0]! * scale, margin],
    [margin, margin + cuts[1]! * scale],
    [margin, 1 - margin - cuts[2]! * scale],
    [margin + cuts[3]! * scale, 1 - margin],
    [1 - margin - cuts[4]! * scale, 1 - margin],
    [1 - margin, 1 - margin - cuts[5]! * scale],
    [1 - margin, margin + cuts[6]! * scale],
    [1 - margin - cuts[7]! * scale, margin],
  ];
  const bottom = ring(0, 0.22),
    shoulder = ring(inset, 1),
    crown = ring(inset + 0.045 + hash(53) * 0.04, 0.84);
  const leanX = (hash(89) - 0.5) * 0.055,
    leanZ = (hash(131) - 0.5) * 0.055;
  const crownHeight = (p: Point) => 0.945 + (p[0] - 0.5) * leanX + (p[1] - 0.5) * leanZ;
  const at = (p: Point, y: number): V3 => [origin[0] + p[0], origin[1] + y, origin[2] + p[1]];
  const tone = 0.94 + hash(173) * 0.12;
  // Warm foot strata, cool shadow faces and pale high stone are a coherent cliff palette.
  const level = Math.max(0, Math.round(origin[1]));
  const side = level === 0 ? '#98877B' : level === 1 ? '#998E8B' : '#AAA4A4';
  const edge = level > 1 ? '#BEB8B2' : '#B1A594';
  const cap = exposure.moss ? '#8DA957' : level > 1 ? '#D1CEC4' : '#BDB6A5';
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    const shoulderY = 0.76 + hash(i * 43 + 229) * 0.08;
    const nextShoulderY = 0.76 + hash(j * 43 + 229) * 0.08;
    naturalQuad(
      mesh,
      [
        at(bottom[j]!, 0),
        at(bottom[i]!, 0),
        at(shoulder[i]!, shoulderY),
        at(shoulder[j]!, nextShoulderY),
      ],
      side,
      tone,
    );
    naturalQuad(
      mesh,
      [
        at(shoulder[j]!, nextShoulderY),
        at(shoulder[i]!, shoulderY),
        at(crown[i]!, crownHeight(crown[i]!)),
        at(crown[j]!, crownHeight(crown[j]!)),
      ],
      exposure.moss && exposure.top ? '#A3B66C' : edge,
      tone,
    );
  }
  const center: V3 = [origin[0] + 0.5, origin[1] + 1, origin[2] + 0.5];
  // Four broad crown facets are readable even at whole-island zoom, not a foil-like grid.
  for (let i = 0; i < 8; i += 2)
    naturalQuad(
      mesh,
      [
        center,
        at(crown[i]!, crownHeight(crown[i]!)),
        at(crown[i + 1]!, crownHeight(crown[i + 1]!)),
        at(crown[(i + 2) % 8]!, crownHeight(crown[(i + 2) % 8]!)),
      ],
      cap,
      tone,
    );
  if (exposure.bottom) {
    const centerBottom: V3 = [origin[0] + 0.5, origin[1], origin[2] + 0.5];
    for (let i = 0; i < 8; i += 2)
      naturalQuad(
        mesh,
        [centerBottom, at(bottom[(i + 2) % 8]!, 0), at(bottom[i + 1]!, 0), at(bottom[i]!, 0)],
        side,
        tone,
      );
  }
}
/** A broad ecological patch, not random green speckles on individual vertices. */
export function rockLedgeHasMoss(seed: number, x: number, z: number, amount: number): boolean {
  return amount <= 2 && valueNoise(x / 3.6, z / 3.6, seed + 431) > 0.36;
}
