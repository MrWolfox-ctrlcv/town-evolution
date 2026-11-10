import { craftedTimber as timber, woodenDowel } from './CraftedTimber';
import type { AssetRecipe, Part } from './AssetTypes';

/** Remade after fence-imagegen-concept.png; the legacy set-dressing fence stays untouched. */
export function craftedFence(): AssetRecipe {
  const parts: Part[] = [];
  for (const x of [-0.4, 0.4]) {
    parts.push(timber('fence-post', [x, 0.4, 0], [0.16, 0.8, 0.16]));
    for (const y of [0.27, 0.56]) parts.push(woodenDowel('fence-wooden-dowel', [x, y, 0.084]));
  }
  for (const y of [0.27, 0.56]) parts.push(timber('fence-rail', [0, y, 0], [0.68, 0.12, 0.085]));
  return { id: 'crafted-fence', footprint: [1, 1], parts };
}
