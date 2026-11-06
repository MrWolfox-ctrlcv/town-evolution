import { Camera, geometry, screen } from 'cc';
import type { WorldViewBounds } from '../application/TreeStreaming';
/** Conservative visible XZ extent from the actual Cocos viewport, including raised geometry. */
export function cameraVisibleBounds(camera: Camera, maxHeight = 64): WorldViewBounds {
  const rect = camera.rect,
    size = screen.windowSize,
    points: Array<{ x: number; z: number }> = [];
  for (const x of [rect.x, rect.x + rect.width])
    for (const y of [rect.y, rect.y + rect.height]) {
      const ray = new geometry.Ray();
      camera.screenPointToRay(x * size.width, y * size.height, ray);
      if (Math.abs(ray.d.y) < 1e-8) continue;
      for (const height of [0, maxHeight]) {
        const t = (height - ray.o.y) / ray.d.y;
        if (t >= 0) points.push({ x: ray.o.x + ray.d.x * t, z: ray.o.z + ray.d.z * t });
      }
    }
  if (!points.length) return { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minZ: Math.min(...points.map((p) => p.z)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxZ: Math.max(...points.map((p) => p.z)),
  };
}
