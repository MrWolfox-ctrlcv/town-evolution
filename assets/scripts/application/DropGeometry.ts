import { ASSETS } from '../art/AssetCatalog';
import { compileAsset } from '../art/MeshCompiler';
import { dropPosition } from '../domain/game';
import type { LooseDrop } from '../domain/game';
const shapes = new Map<
  string,
  { asset: string; scale: number; x: number; z: number; minY: number; width: number; depth: number }
>();
/** Shared rendered footprint for coast protection, support and the persistent drop model. */
export function dropShape(drop: Pick<LooseDrop, 'item' | 'amount'>) {
  const asset = `pile-${drop.item}-${drop.amount}`;
  if (!shapes.has(asset)) {
    const mesh = compileAsset(ASSETS[asset]!);
    const width = mesh.max[0]! - mesh.min[0]!,
      depth = mesh.max[2]! - mesh.min[2]!;
    const scale = Math.min(1, 0.28 / Math.max(width, depth));
    shapes.set(asset, {
      asset,
      scale,
      x: (mesh.min[0]! + mesh.max[0]!) / 2,
      z: (mesh.min[2]! + mesh.max[2]!) / 2,
      minY: mesh.min[1]!,
      width: width * scale,
      depth: depth * scale,
    });
  }
  return shapes.get(asset)!;
}
export function dropRect(drop: LooseDrop) {
  const shape = dropShape(drop),
    p = dropPosition(drop);
  return {
    x: p.x - shape.width / 2,
    z: p.z - shape.depth / 2,
    width: shape.width,
    depth: shape.depth,
  };
}
