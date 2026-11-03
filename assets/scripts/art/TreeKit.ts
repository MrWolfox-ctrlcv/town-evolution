import { ART as C, part } from './AssetTypes';
import type { Part } from './AssetTypes';
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
