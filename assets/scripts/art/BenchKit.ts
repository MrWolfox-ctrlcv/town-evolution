import { craftedTimber as timber, woodenDowel } from './CraftedTimber';
import type { AssetRecipe, Part } from './AssetTypes';

/** Remade from bench-imagegen-concept.png, not retroactively matched to the old mesh. */
export function woodenBench(): AssetRecipe {
  const parts: Part[] = [];
  for (const x of [-0.36, 0.36]) {
    parts.push(timber('bench-leg', [x, 0.4, -0.195], [0.1, 0.8, 0.1]));
    parts.push(timber('bench-leg', [x, 0.17, 0.18], [0.1, 0.34, 0.1]));
    // Inset braces overlap inside legs; exterior faces are never coplanar.
    parts.push(timber('bench-side-brace', [x, 0.305, -0.005], [0.075, 0.075, 0.4]));
    parts.push(timber('bench-low-side-brace', [x, 0.13, -0.005], [0.075, 0.065, 0.4]));
    for (const y of [0.55, 0.72]) parts.push(woodenDowel('bench-wooden-dowel', [x, y, -0.088]));
  }
  parts.push(timber('bench-cross-brace', [0, 0.13, 0.14], [0.73, 0.06, 0.055]));
  parts.push(timber('bench-front-apron', [0, 0.305, 0.18], [0.73, 0.065, 0.055]));
  for (const z of [-0.11, 0.04, 0.19])
    parts.push(timber('bench-seat-plank', [0, 0.37, z], [0.94, 0.06, 0.13]));
  for (const y of [0.55, 0.72])
    parts.push(timber('bench-back-plank', [0, y, -0.12], [0.94, 0.13, 0.055]));
  return { id: 'bench', footprint: [1, 1], parts };
}
