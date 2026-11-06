import { move, part } from './AssetTypes';
import type { AssetRecipe, Part, V3 } from './AssetTypes';
import { wood } from './BuildingCore';
import { woodenCrate } from './BuildingAccessories';

/** One source for the crafted platform and its cargo-dock upgrade. */
export const DOCK_CRATE_POSITION: V3 = [0.35, 0.38, 0.29];
export const DOCK_CRATE_SCALE = 1.4;

function roundBetween(name: string, from: V3, to: V3, diameter: number, color: string): Part {
  const dx = to[0] - from[0],
    dy = to[1] - from[1],
    dz = to[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  return part(
    name,
    'log',
    [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
    [diameter, length + 0.006, diameter],
    color,
    [(Math.acos(dy / length) * 180) / Math.PI, (Math.atan2(dx, dz) * 180) / Math.PI, 0],
  );
}

/** Actual sagging, round rope; no solid fence panels conceal the wooden deck. */
function ropeRail(from: V3, to: V3): Part[] {
  const parts: Part[] = [],
    steps = 6;
  const at = (t: number): V3 => [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t - Math.sin(Math.PI * t) * 0.14,
    from[2] + (to[2] - from[2]) * t,
  ];
  for (let i = 0; i < steps; i++)
    parts.push(
      roundBetween('pier-rope-rail', at(i / steps), at((i + 1) / steps), 0.045, '#E9CF96'),
    );
  return parts;
}

function piling(x: number, z: number, lower = -0.16): Part[] {
  const height = 1.13 - lower;
  const parts: Part[] = [
    {
      ...wood(
        'pier-piling',
        [x, lower + height / 2, z],
        [0.23, height, 0.23],
        undefined,
        '#E5BF93',
      ),
      shape: 'log',
    },
    part('pier-post-cap', 'log', [x, 1.132, z], [0.232, 0.024, 0.232], '#C38C51'),
    part(
      'pier-post-endgrain',
      'binding',
      [x, 1.146, z],
      [0.125, 0.125, 0.006],
      '#AD7544',
      [90, 0, 0],
    ),
  ];
  for (const y of [0.91, 0.95])
    parts.push(
      part('pier-rope-binding', 'binding', [x, y, z], [0.28, 0.28, 0.055], '#E9CF96', [90, 0, 0]),
    );
  return parts;
}

function deck(width: number, startZ: number, count: number): Part[] {
  const parts: Part[] = [];
  for (let i = 0; i < count; i++) {
    const z = startZ + i * 0.2;
    parts.push(
      wood(
        'pier-deck-plank',
        [0, 0.32, z],
        [width, 0.12, 0.187],
        undefined,
        i % 3 === 1 ? '#EACBA3' : '#F8E6CE',
      ),
    );
    for (const x of [-width / 2 + 0.13, width / 2 - 0.13])
      parts.push(part('pier-iron-nail', 'log', [x, 0.383, z], [0.035, 0.012, 0.035], '#665C4B'));
  }
  const length = count * 0.2,
    center = startZ + ((count - 1) * 0.2) / 2;
  for (const x of [-width * 0.32, width * 0.32])
    parts.push(
      wood('pier-under-beam', [x, 0.2, center], [0.12, 0.17, length], undefined, '#C9A37C'),
    );
  return parts;
}

export function woodenPierParts(): Part[] {
  const parts = deck(1.78, -0.8, 9);
  for (const x of [-0.76, 0.76]) {
    for (const z of [-0.72, 0.72]) {
      parts.push(...piling(x, z));
      parts.push(
        wood(
          'pier-diagonal-brace',
          [x * 0.78, 0.15, z],
          [0.43, 0.075, 0.1],
          [0, 0, Math.sign(x) * 35],
          '#D1AA82',
        ),
      );
    }
    parts.push(...ropeRail([x, 0.93, -0.72], [x, 0.93, 0.72]));
  }
  return parts;
}

/** A portable, open-ended 2×2 timber platform. Its seaward extension is separate scenery. */
export function woodenPier(): AssetRecipe {
  return { id: 'wooden-pier', footprint: [2, 2], parts: woodenPierParts() };
}

/** The exact platform survives the upgrade, with the existing open slatted crate added on top. */
export function simpleDock(): AssetRecipe {
  return {
    id: 'dock-simple',
    footprint: [2, 2],
    parts: [...woodenPierParts(), ...move(woodenCrate(), DOCK_CRATE_POSITION, DOCK_CRATE_SCALE)],
    sockets: { cargo: DOCK_CRATE_POSITION, mooring: [0, 0.38, 2.8] },
  };
}

/** Local +Z matches the dock's existing two-cell protected sea corridor. Add only at legal shores. */
export function dockPierExtension(): AssetRecipe {
  const parts = deck(1.18, 1, 10);
  for (const x of [-0.49, 0.49]) {
    for (const z of [1.24, 2.72]) parts.push(...piling(x, z, -0.42));
    parts.push(...ropeRail([x, 0.93, 1.24], [x, 0.93, 2.72]));
  }
  return { id: 'dock-pier-extension', footprint: [2, 2], parts };
}

/** A slatted open rowboat, built as its own object. No dock recipe silently includes a boat. */
export function woodenBoat(): AssetRecipe {
  const parts: Part[] = [];
  const outline: ReadonlyArray<readonly [number, number]> = [
    [-0.29, -0.79],
    [-0.42, -0.45],
    [-0.43, 0.15],
    [-0.25, 0.62],
    [0, 0.9],
    [0.25, 0.62],
    [0.43, 0.15],
    [0.42, -0.45],
    [0.29, -0.79],
  ];
  const boardBetween = (
    name: string,
    a: readonly [number, number],
    b: readonly [number, number],
    y: number,
    thickness: number,
    height: number,
  ) => {
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    parts.push(
      wood(
        name,
        [(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2],
        [thickness, height, Math.hypot(dx, dz) + 0.018],
        [0, (Math.atan2(dx, dz) * 180) / Math.PI, 0],
      ),
    );
  };
  for (let row = 0; row < 3; row++) {
    const spread = 0.86 + row * 0.07;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i]!,
        b = outline[(i + 1) % outline.length]!;
      boardBetween(
        'boat-hull-slat',
        [a[0] * spread, a[1] * spread],
        [b[0] * spread, b[1] * spread],
        0.13 + row * 0.105,
        0.055,
        0.102,
      );
    }
  }
  for (let i = 0; i < 8; i++) {
    const z = -0.65 + i * 0.175;
    const halfWidth =
      z > 0.15 ? 0.36 - (z - 0.15) * 0.61 : z < -0.4 ? 0.36 + (z + 0.4) * 0.36 : 0.36;
    parts.push(
      wood(
        'boat-floor-plank',
        [0, 0.09, z],
        [halfWidth * 2, 0.065, 0.165],
        undefined,
        i % 2 ? '#DDB98D' : '#F1D4AD',
      ),
    );
  }
  for (const z of [-0.4, 0.12]) {
    parts.push(wood('boat-seat', [0, 0.31, z], [0.76, 0.065, 0.14]));
    for (const x of [-0.29, 0.29])
      parts.push(wood('boat-seat-support', [x, 0.2, z], [0.06, 0.2, 0.1], undefined, '#D7B18A'));
  }
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!,
      b = outline[(i + 1) % outline.length]!;
    boardBetween('boat-gunwale', a, b, 0.405, 0.071, 0.065);
  }
  parts.push(wood('boat-keel', [0, 0.03, -0.03], [0.08, 0.07, 1.48], undefined, '#D0A77C'));
  for (const side of [-1, 1]) {
    // Both oars rest inside the footprint; their broad paddles remain clearly different from planks.
    const angle = side * 27;
    const a = (angle * Math.PI) / 180;
    const cx = side * 0.14,
      cz = -0.05;
    parts.push(
      wood('boat-oar-shaft', [cx, 0.455, cz], [0.035, 0.035, 1.16], [0, angle, 0], '#EBC99B'),
    );
    parts.push(
      wood(
        'boat-oar-paddle',
        [cx + Math.sin(a) * 0.5, 0.455, cz + Math.cos(a) * 0.5],
        [0.105, 0.045, 0.3],
        [0, angle, 0],
        '#F4D6AA',
      ),
    );
  }
  return { id: 'boat', footprint: [1, 2], parts, sockets: { cargo: [0, 0.18, 0.4] } };
}
