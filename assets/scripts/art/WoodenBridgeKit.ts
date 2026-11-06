import { move, part } from './AssetTypes';
import type { AssetRecipe, Part, V3 } from './AssetTypes';
import { wood } from './BuildingCore';
import { woodenPierParts } from './DockPierKit';

export const BRIDGE_DECK_TOP = 0.38;
/** Cleared, dry v5 banks end at y=.015; the walking surface meets that bank. */
export const BRIDGE_ROOT_HEIGHT = 0.015 - BRIDGE_DECK_TOP;

export interface BridgeSupport {
  x: number;
  z: number;
  /** Top of a separate terrain-dependent footing, overlapping the original post. */
  top: number;
  halfWidth: number;
}

function checkLength(length: number): void {
  if (!Number.isInteger(length) || length < 7 || length > 16)
    throw new RangeError('A wooden bridge must span 7 to 16 whole cells.');
}

/** Interior rows join the two original inner post pairs, never more than 1.8m apart. */
function middleRows(length: number): number[] {
  const inner = length / 2 - 1.72,
    spans = Math.ceil((inner * 2) / 1.8);
  return Array.from({ length: spans - 1 }, (_, i) => -inner + ((i + 1) * inner * 2) / spans);
}

function middleRope(x: number, from: number, to: number): Part[] {
  const at = (t: number): V3 => [x, 0.93 - Math.sin(t * Math.PI) * 0.14, from + (to - from) * t];
  return Array.from({ length: 6 }, (_, i) => {
    const a = at(i / 6),
      b = at((i + 1) / 6),
      dy = b[1] - a[1],
      dz = b[2] - a[2],
      distance = Math.hypot(dy, dz);
    return part(
      'bridge-rope-rail',
      'log',
      [x, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
      [0.045, distance + 0.006, 0.045],
      '#E9CF96',
      [(Math.acos(dy / distance) * 180) / Math.PI, 0, 0],
    );
  });
}

/**
 * Both 2x2 ingredient platforms survive unchanged, translated to opposite banks.
 * Only new center planks, segmented beams, middle posts and ropes bridge their gap.
 * Local +Z is the crossing axis and (0,0,0) is the complete bridge's center.
 */
export function woodenBridgeParts(length = 8): Part[] {
  checkLength(length);
  const source = woodenPierParts(),
    endOffset = length / 2 - 1,
    parts = [...move(source, [0, 0, -endOffset]), ...move(source, [0, 0, endOffset])],
    planks = source.filter((p) => p.name === 'pier-deck-plank'),
    plankCount = (length - 4) * 5 + 1;
  for (let i = 0; i < plankCount; i++) {
    const z = -length / 2 + 2 + i * 0.2,
      template = planks[i % planks.length]!;
    parts.push({ ...template, name: 'bridge-deck-plank', position: [0, 0.32, z] });
    for (const x of [-0.76, 0.76])
      parts.push(part('bridge-iron-nail', 'log', [x, 0.383, z], [0.035, 0.012, 0.035], '#665C4B'));
  }
  // The original outer plank stops .1065m short. Narrow terminal boards meet dry
  // land exactly at the occupied edge, without scaling either ingredient platform.
  for (const side of [-1, 1])
    parts.push(wood('bridge-bank-plank', [0, 0.32, side * (length / 2 - 0.05)], [1.78, 0.12, 0.1]));

  const beamSpan = length - 3.8,
    beamCount = Math.ceil(beamSpan / 1.8);
  for (let i = 0; i < beamCount; i++)
    for (const x of [-1.78 * 0.32, 1.78 * 0.32])
      parts.push(
        wood(
          'bridge-under-beam',
          [x, 0.2, -beamSpan / 2 + ((i + 0.5) * beamSpan) / beamCount],
          [0.12, 0.17, beamSpan / beamCount + 0.006],
          undefined,
          '#C9A37C',
        ),
      );

  const rows = middleRows(length),
    originalRow = source.filter(
      (p) =>
        p.position[2] === -0.72 &&
        (p.name.startsWith('pier-post-') ||
          p.name === 'pier-piling' ||
          p.name === 'pier-rope-binding' ||
          p.name === 'pier-diagonal-brace'),
    );
  for (const z of rows) {
    parts.push(
      ...move(originalRow, [0, 0, z + 0.72]).map((p) => ({
        ...p,
        name: p.name.replace('pier-', 'bridge-'),
      })),
      wood('bridge-cross-beam', [0, 0.16, z], [1.65, 0.17, 0.16], undefined, '#C9A37C'),
    );
  }
  const railRows = [-endOffset + 0.72, ...rows, endOffset - 0.72];
  for (let i = 1; i < railRows.length; i++)
    for (const x of [-0.76, 0.76]) parts.push(...middleRope(x, railRows[i - 1]!, railRows[i]!));
  return parts;
}

/** Footings use one reusable unit mesh, sized by the renderer to the actual riverbed. */
export function bridgeSupports(length = 8): BridgeSupport[] {
  return woodenBridgeParts(length)
    .filter((p) => p.name === 'pier-piling' || p.name === 'bridge-piling')
    .map((p) => ({
      x: p.position[0],
      z: p.position[2],
      top: p.position[1] - p.size[1] / 2 + 0.005,
      halfWidth: p.size[0] / 2,
    }));
}

/** Cache by length only. Terrain sampling and world rotation belong to presentation. */
export function woodenBridge(length = 8): AssetRecipe {
  return {
    id: `wooden-bridge-${length}`,
    footprint: [2, length],
    parts: woodenBridgeParts(length),
  };
}
