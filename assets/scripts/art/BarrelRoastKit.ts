import { move, part } from './AssetTypes';
import type { AssetRecipe, Part, V3 } from './AssetTypes';
import { wood } from './BuildingCore';
import { woodenCrate } from './BuildingAccessories';
import { cropProductUnit } from './CropPileKit';
import { stoneOven } from './BakeryKit';
import { compileAsset } from './MeshCompiler';

export type CompostBarrelStage = 'empty' | 'working' | 'ready';
export const BARREL_CRATE_SCALE = 1.3;

/** Original crate legs, two pairs of slats and their iron pins visibly survive reshaping. */
export function barrelCrateReinforcements(): Part[] {
  const source = woodenCrate();
  const parts = move(
    source.filter((p) => p.name === 'crate-post'),
    [0, 0, 0],
    BARREL_CRATE_SCALE,
  );
  for (const side of [-1, 1]) {
    const panels = source.filter(
      (p) =>
        p.position[2] * side > 0 &&
        (p.name === 'crate-iron-pin' ||
          (p.name === 'crate-slat-front' && (p.position[1] < 0.2 || p.position[1] > 0.3))),
    );
    parts.push(...move(panels, [0, 0.1, side * 0.085], BARREL_CRATE_SCALE));
  }
  return parts;
}

/** Individual vertical staves surround a genuinely open interior; never a capped solid cylinder. */
export function woodenBarrelParts(): Part[] {
  const parts: Part[] = [
    ...barrelCrateReinforcements(),
    {
      ...wood('barrel-floor', [0, 0.105, 0], [0.64, 0.07, 0.64], undefined, '#D4AE83'),
      shape: 'log',
    },
  ];
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6;
    parts.push(
      wood(
        'barrel-vertical-stave',
        [Math.sin(angle) * 0.32, 0.45, Math.cos(angle) * 0.32],
        [0.167, 0.7, 0.065],
        [0, i * 30, 0],
        i % 3 ? '#F1D5B0' : '#DEB78B',
      ),
    );
  }
  return parts;
}

function barrelLid(open: boolean): Part[] {
  const source = woodenCrate().find((p) => p.name === 'crate-slat-front')!;
  const local: Part[] = [];
  for (let i = 0; i < 5; i++)
    local.push({
      ...source,
      name: 'barrel-lid-reused-slat',
      position: [0, 0, 0.065 + i * 0.13],
      size: [source.size[0] * 1.5, source.size[1] * 1.4, source.size[2] * 1.4],
      rotation: [90, 0, 0],
    });
  for (const x of [-0.11, 0.11])
    local.push(wood('barrel-lid-handle-foot', [x, 0.075, 0.34], [0.055, 0.15, 0.07]));
  local.push(wood('barrel-lid-handle', [0, 0.145, 0.34], [0.275, 0.055, 0.07]));
  const degrees = open ? -65 : 0,
    angle = (degrees * Math.PI) / 180;
  return local.map((p) => ({
    ...p,
    position: [
      p.position[0],
      0.84 + p.position[1] * Math.cos(angle) - p.position[2] * Math.sin(angle),
      -0.32 + p.position[1] * Math.sin(angle) + p.position[2] * Math.cos(angle),
    ] as V3,
    rotation: [(p.rotation?.[0] ?? 0) + degrees, p.rotation?.[1] ?? 0, p.rotation?.[2] ?? 0] as V3,
  }));
}

export function compostBarrel(stage: CompostBarrelStage = 'empty'): AssetRecipe {
  const parts = [...woodenBarrelParts(), ...barrelLid(stage !== 'working')];
  for (const x of [-0.2, 0.2])
    parts.push(part('barrel-lid-hinge', 'box', [x, 0.82, -0.33], [0.07, 0.09, 0.065], '#6C6557'));
  if (stage === 'ready') {
    parts.push(part('barrel-ready-compost', 'log', [0, 0.615, 0], [0.56, 0.2, 0.56], '#71503A'));
    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI * 2) / 7,
        r = i ? 0.18 : 0;
      parts.push(
        part(
          'barrel-compost-clod',
          'crown',
          [Math.sin(a) * r, 0.72 + (i % 2) * 0.025, Math.cos(a) * r],
          [0.15, 0.11, 0.14],
          i % 2 ? '#8A603F' : '#63452F',
        ),
      );
    }
  }
  return {
    id: stage === 'empty' ? 'compost-barrel' : `compost-barrel-${stage}`,
    footprint: [1, 1],
    category: 'buildings',
    parts,
    sockets: { contents: [0, 0.72, 0], lidHinge: [0, 0.84, -0.32] },
  };
}

export function compostBarrelAssets(): AssetRecipe[] {
  return (['empty', 'working', 'ready'] as const).map(compostBarrel);
}

/** One output unit is one wooden serving tray with both cooked input carrots. */
export function roastedCarrotProductUnit(): Part[] {
  const parts: Part[] = [wood('roast-serving-tray', [0, 0.025, 0], [0.56, 0.05, 0.7])];
  for (const side of [-1, 1]) {
    parts.push(wood('roast-tray-side', [side * 0.275, 0.065, 0], [0.035, 0.08, 0.7]));
    parts.push(wood('roast-tray-end', [0, 0.065, side * 0.333], [0.52, 0.08, 0.035]));
  }
  const raw = cropProductUnit('vegetable');
  const cooked = raw.map((p) => ({
    ...p,
    name: p.name === 'carrot-root' ? 'roasted-carrot-root' : 'roasted-carrot-leaves',
    color: p.name === 'carrot-root' ? '#CF702B' : '#698336',
  }));
  const bounds = compileAsset({ id: 'cooked-carrot', footprint: [1, 1], parts: cooked });
  const scale = 0.85,
    lift = 0.055 - bounds.min[1]! * scale;
  for (const x of [-0.125, 0.125]) {
    parts.push(...move(cooked, [x, lift, -0.025], scale));
    // Follow the tapered root surface instead of floating a constant-height stripe over its tip.
    for (const [z, radius] of [
      [-0.11, 0.039],
      [-0.015, 0.057],
      [0.075, 0.07],
    ] as const)
      for (const side of [-1, 1])
        parts.push(
          part(
            'roasted-carrot-browning',
            'box',
            [x + side * radius * 0.25, lift + radius * 0.94, z],
            [radius * 0.7, 0.007, 0.014],
            '#8F4E26',
            [0, 0, -side * 15],
          ),
        );
  }
  return parts;
}

export function roastedCarrot(): AssetRecipe {
  return {
    id: 'roasted-carrot',
    footprint: [1, 1],
    category: 'crops',
    parts: roastedCarrotProductUnit(),
  };
}

/** Count dishes, not roots. Compact separate trays fit one ground cell without intersecting. */
export function roastedCarrotPile(amount: number): AssetRecipe {
  if (!Number.isInteger(amount) || amount < 1 || amount > 5)
    throw new RangeError(`Invalid roasted carrot dish count: ${amount}`);
  const parts: Part[] = [];
  for (let i = 0; i < amount; i++) {
    const row = Math.floor(i / 3),
      count = Math.min(3, amount - row * 3),
      slot = i % 3;
    const x = (slot - (count - 1) / 2) * 0.31,
      z = amount > 3 ? (row - 0.5) * 0.38 : 0;
    parts.push(
      ...move(roastedCarrotProductUnit(), [x, 0, z], 0.48).map((p) => ({
        ...p,
        name: `unit-${i + 1}-${p.name}`,
      })),
    );
  }
  return { id: `pile-roastedCarrot-${amount}`, footprint: [1, 1], category: 'crops', parts };
}

/** Optional handbook assembly, using the unchanged oven and the exact finished-dish mesh. */
export function roastedCarrotOvenPreview(): AssetRecipe {
  return {
    id: 'roasted-carrot-oven-preview',
    footprint: [2, 1],
    category: 'buildings',
    parts: [
      ...move(stoneOven().parts, [-0.5, 0, 0]),
      ...move(roastedCarrotProductUnit(), [0.55, 0, 0]),
    ],
  };
}
