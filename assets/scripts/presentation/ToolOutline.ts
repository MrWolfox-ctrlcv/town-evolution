import type { Node } from 'cc';
import type { ModelFactory } from './ModelFactory';
export function toolOutline(factory: ModelFactory, marker: Node, originX: number, originZ: number) {
  return (x: number, z: number, width: number, depth: number, shade: string, height = 0.14) => {
    for (const side of [-1, 1]) {
      factory.shape(
        marker,
        'EdgeX',
        x + width / 2 + side * width * 0.48 - originX,
        height,
        z + depth / 2 - originZ,
        0.08,
        0.06,
        depth,
        shade,
      );
      factory.shape(
        marker,
        'EdgeZ',
        x + width / 2 - originX,
        height,
        z + depth / 2 + side * depth * 0.48 - originZ,
        width,
        0.06,
        0.08,
        shade,
      );
    }
  };
}
