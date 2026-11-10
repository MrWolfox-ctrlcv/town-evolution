import type { geometry } from 'cc';
import type { ModelPicking } from './ModelPicking';
/** Nearest legacy tree triangle with stable ID tie-breaking. */
export function pickGroundTree(
  trees: readonly { id: string; surface: ModelPicking }[],
  ray: geometry.Ray,
): { id: string; distance: number } | null {
  let id: string | null = null,
    distance = Infinity;
  for (const tree of trees) {
    const hit = tree.surface.distance(ray, distance);
    if (hit !== null && (hit < distance || (hit === distance && (id === null || tree.id < id)))) {
      distance = hit;
      id = tree.id;
    }
  }
  return id ? { id, distance } : null;
}
