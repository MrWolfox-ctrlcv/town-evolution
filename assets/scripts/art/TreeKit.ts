import { terrainHash } from './NaturalBlockKit';
import { ART as C, part } from './AssetTypes';
import { assetBounds } from './MeshCompiler';
import type { AssetRecipe, Part, V3 } from './AssetTypes';
/** Broad overlapping crown lobes and a forked tapered trunk, within the original tree footprint. */
export function treeParts(): Part[] {
  return [
    part('root-flare', 'timber', [0, 0.13, 0], [0.34, 0.26, 0.31], C.trunk),
    part('trunk', 'timber', [0, 0.48, 0], [0.25, 0.96, 0.24], C.trunk),
    part('branch-left', 'timber', [-0.12, 0.88, 0.01], [0.13, 0.58, 0.13], C.trunk, [0, 0, 28]),
    part('branch-right', 'timber', [0.12, 0.91, -0.015], [0.12, 0.58, 0.12], C.wood, [-12, 0, -30]),
    part('crown-core', 'crown', [0, 1.3, -0.07], [0.86, 0.83, 0.84], '#839E36'),
    part('crown-left', 'crown', [-0.27, 1.18, 0.06], [0.64, 0.65, 0.65], '#95AE3F', [5, 18, 0]),
    part('crown-right', 'crown', [0.27, 1.24, 0.07], [0.64, 0.67, 0.65], '#A4BB46', [0, -16, 7]),
    part('crown-top', 'crown', [-0.1, 1.54, -0.035], [0.78, 0.72, 0.76], '#B8CA50', [0, 12, -8]),
  ];
}

/** Alternate resource-tree silhouette, selected by seed only for saved trees. */
export function pineParts(): Part[] {
  return [
    part('pine-trunk', 'timber', [0, 0.38, 0], [0.2, 0.76, 0.2], C.trunk),
    ...[0, 1, 2, 3].map((i) =>
      part(
        'pine-tier',
        'gem',
        [0, 0.69 + i * 0.3, 0],
        [1.12 - i * 0.21, 0.83 - i * 0.07, 1.12 - i * 0.21],
        ['#3F7754', '#4D8A58', '#6A9B54', '#91B65B'][i]!,
        [0, 45, 0],
      ),
    ),
  ];
}

/** A bounded bank shares meshes instead of allocating one mesh/material per tree or leaf. */
export const TREE_VARIANTS = { tree: 16, 'tree-pine': 8 } as const;
const PICK_SCALE = [0.85, 1.15, 0.85] as const;

function leafColor(hex: string, warmth: number, light: number): string {
  return (
    '#' +
    [1, 3, 5]
      .map((i, channel) => {
        const shift = warmth * [12, 6, -4][channel]! + light;
        return Math.round(Math.max(0, Math.min(255, parseInt(hex.slice(i, i + 2), 16) + shift)))
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}

/** Reuses the original crown/tier primitives. Only presentation parameters vary. */
export function treeVariants(): AssetRecipe[] {
  return (['tree', 'tree-pine'] as const).flatMap((kind) => {
    const original = kind === 'tree' ? treeParts() : pineParts();
    const maxHeight = assetBounds({ id: kind, footprint: [1.2, 1.2], parts: original }).max[1]!;
    return Array.from({ length: TREE_VARIANTS[kind] }, (_, variant) => {
      const random = (index: number, channel: number) =>
        terrainHash(kind === 'tree' ? 41017 : 62039, variant, index, channel);
      const spread = (index: number, channel: number, amount: number) =>
        (random(index, channel) * 2 - 1) * amount;
      const warmth = spread(0, 20, 1);
      const leanX = spread(0, 21, 0.065),
        leanZ = spread(0, 22, 0.065);
      const parts = original.map((p, index): Part => {
        if (p.shape !== 'crown' && p.name !== 'pine-tier') return { ...p };
        const pine = kind === 'tree-pine';
        const lift = (p.position[1] - 0.6) / 1.2;
        return {
          ...p,
          position: [
            p.position[0] + leanX * lift + spread(index, 1, pine ? 0.035 : 0.095),
            p.position[1] + spread(index, 2, pine ? 0.045 : 0.08),
            p.position[2] + leanZ * lift + spread(index, 3, pine ? 0.035 : 0.095),
          ],
          size: [
            p.size[0] * (1 + spread(index, 4, 0.2)),
            p.size[1] * (1 + spread(index, 5, 0.18)),
            p.size[2] * (1 + spread(index, 6, 0.2)),
          ],
          rotation: [
            (p.rotation?.[0] ?? 0) + spread(index, 7, pine ? 5 : 14),
            (p.rotation?.[1] ?? 0) + spread(index, 8, 38),
            (p.rotation?.[2] ?? 0) + spread(index, 9, pine ? 5 : 14),
          ],
          color: leafColor(p.color, warmth, spread(index, 10, 7)),
        };
      });
      const recipe: AssetRecipe = {
        id: `${kind}-canopy-${variant}`,
        footprint: [1.2, 1.2],
        parts,
      };
      // Keep every yaw inside the historic 1.02-wide picking envelope. Uniform
      // fitting preserves lobe rotations and never changes the ground contact.
      const bounds = assetBounds(recipe, true);
      const fit = Math.min(1, 0.595 / bounds.radius, maxHeight / bounds.max[1]!);
      recipe.parts = parts.map((p) => ({
        ...p,
        position: p.position.map((v) => v * fit) as unknown as V3,
        size: p.size.map((v) => v * fit) as unknown as V3,
      }));
      return recipe;
    });
  });
}

export function resourceTreeVisual(seed: number, x: number, z: number) {
  // Preserve the old species decision, independent of saved-array order or ID.
  const pickAsset = terrainHash(seed, x, 0, z) < 0.28 ? 'tree-pine' : 'tree';
  const variant = Math.floor(terrainHash(seed, x, 31, z) * TREE_VARIANTS[pickAsset]);
  return {
    asset: `${pickAsset}-canopy-${variant}`,
    scale: [
      0.76 + terrainHash(seed, x, 32, z) * 0.09,
      1.01 + terrainHash(seed, x, 33, z) * 0.14,
      0.76 + terrainHash(seed, x, 34, z) * 0.09,
    ] as const,
    yaw: terrainHash(seed, x, 35, z) * 360,
    pickAsset,
    pickScale: PICK_SCALE,
  };
}
