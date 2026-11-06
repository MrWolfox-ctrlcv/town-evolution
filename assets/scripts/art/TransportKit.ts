import { ART as C, move, part } from './AssetTypes';
import type { AssetRecipe, Part } from './AssetTypes';
import { wood } from './BuildingCore';
import { warehouse } from './WarehouseKit';

/** An open plank cart with real hollow, spoked wheels and two projecting handles. */
export function handcartParts(): Part[] {
  const parts: Part[] = [wood('handcart-axle', [0, 0.25, -0.12], [0.71, 0.08, 0.08])];
  for (let i = 0; i < 5; i++)
    parts.push(wood('handcart-floor-plank', [-0.18 + i * 0.09, 0.32, -0.1], [0.085, 0.055, 0.48]));
  for (const side of [-1, 1]) {
    parts.push(
      wood('handcart-underframe', [side * 0.2, 0.27, -0.1], [0.07, 0.07, 0.56]),
      wood('handcart-handle', [side * 0.18, 0.31, 0.3], [0.055, 0.055, 0.38], [-12, 0, 0]),
      wood('handcart-rest-leg', [side * 0.21, 0.14, 0.12], [0.06, 0.28, 0.06]),
      part(
        'handcart-wheel-rim',
        'binding',
        [side * 0.29, 0.25, -0.12],
        [0.47, 0.47, 0.065],
        C.woodDark,
        [0, 90, 0],
      ),
      part(
        'handcart-wheel-hub',
        'log',
        [side * 0.29, 0.25, -0.12],
        [0.11, 0.12, 0.11],
        C.wood,
        [0, 0, 90],
      ),
    );
    for (let spoke = 0; spoke < 3; spoke++)
      parts.push(
        wood(
          'handcart-wheel-spoke',
          [side * 0.29, 0.25, -0.12],
          [0.035, 0.395, 0.035],
          [spoke * 60, 0, 0],
        ),
      );
    for (const z of [-0.35, 0.15])
      parts.push(wood('handcart-corner-post', [side * 0.25, 0.47, z], [0.06, 0.36, 0.06]));
    for (let row = 0; row < 3; row++) {
      const y = 0.4 + row * 0.1;
      parts.push(
        wood('handcart-side-slat', [side * 0.25, y, -0.1], [0.045, 0.07, 0.5]),
        wood('handcart-end-slat', [0, y, -0.1 + side * 0.25], [0.48, 0.07, 0.045]),
      );
      for (const x of [-0.21, 0.21])
        parts.push(
          part(
            'handcart-iron-pin',
            'gem',
            [x, y, -0.1 + side * 0.278],
            [0.022, 0.022, 0.016],
            '#69634E',
          ),
        );
    }
  }
  return parts;
}

export function handcart(): AssetRecipe {
  return { id: 'handcart', footprint: [1, 1], parts: handcartParts(), category: 'buildings' };
}

/** Keep the entire existing warehouse; park the same cart on its front loading ramp. */
export function transportWarehouse(): AssetRecipe {
  const base = warehouse('warehouse-base');
  return {
    ...base,
    id: 'warehouse-transport',
    category: 'buildings',
    parts: [...base.parts, ...move(handcartParts(), [0.61, 0.22, 0.585], 0.8)],
    sockets: { ...base.sockets, cart: [0.61, 0.22, 0.585] },
  };
}
