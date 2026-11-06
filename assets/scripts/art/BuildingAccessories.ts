import { part, move } from './AssetTypes';
import type { Part, V3 } from './AssetTypes';
import { wood } from './BuildingCore';

/** The same two-plank object stands outdoors or is mounted horizontally as a shop sign. */
export function woodenBoard(): Part[] {
  const parts: Part[] = [];
  for (const side of [-1, 1])
    parts.push(wood('board-post', [side * 0.29, 0.48, 0], [0.09, 0.96, 0.1]));
  for (const row of [-1, 1]) {
    parts.push(wood('board-plank', [0, 0.7 + row * 0.115, 0.065], [0.82, 0.21, 0.1]));
    for (const side of [-1, 1])
      parts.push(
        part(
          'board-iron-pin',
          'gem',
          [side * 0.32, 0.7 + row * 0.115, 0.122],
          [0.04, 0.04, 0.025],
          '#605D4D',
        ),
      );
  }
  return parts;
}
/** Open slatted box: four real sides and a visible floor, reused throughout the upgrades. */
export function woodenCrate(): Part[] {
  const parts: Part[] = [wood('crate-floor', [0, 0.035, 0], [0.43, 0.07, 0.43])];
  for (const x of [-0.21, 0.21])
    for (const z of [-0.21, 0.21]) {
      parts.push(wood('crate-post', [x, 0.23, z], [0.065, 0.46, 0.065], undefined, '#E4C09A'));
      for (const y of [0.09, 0.37])
        parts.push(
          part(
            'crate-iron-pin',
            'gem',
            [x, y, z + Math.sign(z) * 0.035],
            [0.025, 0.025, 0.018],
            '#69634E',
          ),
        );
    }
  for (let row = 0; row < 3; row++)
    for (const side of [-1, 1]) {
      parts.push(
        wood('crate-slat-front', [0, 0.115 + row * 0.135, side * 0.218], [0.4, 0.095, 0.04]),
      );
      parts.push(
        wood('crate-slat-side', [side * 0.218, 0.115 + row * 0.135, 0], [0.04, 0.095, 0.4]),
      );
    }
  return parts;
}
/** Rotate a reusable assembly about Y without replacing or flattening its geometry. */
export function mount(parts: Part[], position: V3, angle = 0, scale = 1): Part[] {
  const a = (angle * Math.PI) / 180;
  return move(
    parts.map((p) => ({
      ...p,
      position: [
        p.position[0] * Math.cos(a) + p.position[2] * Math.sin(a),
        p.position[1],
        -p.position[0] * Math.sin(a) + p.position[2] * Math.cos(a),
      ] as V3,
      rotation: [p.rotation?.[0] ?? 0, (p.rotation?.[1] ?? 0) + angle, p.rotation?.[2] ?? 0] as V3,
    })),
    position,
    scale,
  );
}
