import { Node } from 'cc';
import { footprint, farmBoxCell } from '../domain/game';
import type { Building } from '../domain/game';
import type { ModelFactory } from './ModelFactory';
type Shape = Pick<Building, 'kind' | 'x' | 'z' | 'farmSize' | 'collectionBox' | 'bridge'> & {
  rotation?: Building['rotation'];
};
/** Main field and its outside container are separate occupied rectangles, not an enlarged crop grid. */
export function buildingOutline(
  parent: Node,
  factory: ModelFactory,
  b: Shape,
  shade: string,
  name: string,
  y = 0.09,
): Node {
  const rotated = { ...b, rotation: b.rotation ?? 0 },
    f = footprint(rotated);
  const root = new Node(name);
  parent.addChild(root);
  root.setPosition(b.x + f.width / 2, 0, b.z + f.depth / 2);
  const box = farmBoxCell({ ...rotated, id: 'preview' });
  const rects = [{ x: b.x, z: b.z, ...f }, ...(box ? [{ ...box, width: 1, depth: 1 }] : [])];
  for (const r of rects) {
    const x = r.x + r.width / 2 - (b.x + f.width / 2),
      z = r.z + r.depth / 2 - (b.z + f.depth / 2);
    for (const side of [-1, 1]) {
      factory.shape(root, 'Edge', x, y, z + (side * r.depth) / 2, r.width + 0.1, 0.08, 0.1, shade);
      factory.shape(root, 'Edge', x + (side * r.width) / 2, y, z, 0.1, 0.08, r.depth, shade);
    }
  }
  return root;
}
