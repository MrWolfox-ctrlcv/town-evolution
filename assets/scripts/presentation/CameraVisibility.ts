import type { WorldPoint } from '../application/WorldVisibility';
import { Camera, DirectionalLight, geometry, screen } from 'cc';
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

export function cameraContainsPoint(camera: Camera, point: { x: number; y: number }): boolean {
  const viewport = camera.rect,
    size = screen.windowSize;
  const x = point.x / size.width,
    y = point.y / size.height;
  return (
    x >= viewport.x &&
    y >= viewport.y &&
    x <= viewport.x + viewport.width &&
    y <= viewport.y + viewport.height
  );
}
/** Uses the actual camera clip planes and real box heights; unknown bounds stay visible. */
export function cameraBoxVisible(
  camera: Camera,
  min: Readonly<WorldPoint>,
  max: Readonly<WorldPoint>,
): boolean {
  if (
    ![min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite) ||
    min.x > max.x ||
    min.y > max.y ||
    min.z > max.z
  )
    return true;
  const frustum = camera.camera?.frustum;
  if (!frustum || !frustum.planes.length) return true;
  const box = new geometry.AABB(
    (min.x + max.x) / 2,
    (min.y + max.y) / 2,
    (min.z + max.z) / 2,
    (max.x - min.x) / 2 + 0.0001,
    (max.y - min.y) / 2 + 0.0001,
    (max.z - min.z) / 2 + 0.0001,
  );
  return geometry.intersect.aabbFrustum(box, frustum) !== 0;
}

/** A screen-space error threshold using physical viewport pixels, capped at a quarter cell. */
export function cameraTerrainError(camera: Camera, orthoHeight = camera.orthoHeight): number {
  const render = camera.camera;
  const height = render?.window?.height * render?.viewport?.height;
  return Number.isFinite(height) && height > 0 && Number.isFinite(orthoHeight)
    ? Math.max(0, Math.min(0.25, (0.75 * 2 * orthoHeight) / height))
    : 0;
}

/** Retain off-screen casters whose shadow can reach an on-screen receiver. */
export function cameraSceneBoxVisible(
  camera: Camera,
  min: Readonly<WorldPoint>,
  max: Readonly<WorldPoint>,
): boolean {
  if (cameraBoxVisible(camera, min, max)) return true;
  const sun = camera.node?.scene?.getChildByName('TownSun')?.getComponent(DirectionalLight);
  if (!sun?.shadowEnabled) return false;
  const direction = sun.node.forward;
  if (![direction.x, direction.y, direction.z].every(Number.isFinite) || direction.y >= -0.0001)
    return true;
  // Includes bank undersides and the exact same conservative floor used by cameraDepth.
  const floor = Math.min(-4, min.y),
    distance = (max.y - floor) / -direction.y;
  const x = direction.x * distance,
    z = direction.z * distance;
  return cameraBoxVisible(
    camera,
    { x: min.x + Math.min(0, x), y: floor, z: min.z + Math.min(0, z) },
    { x: max.x + Math.max(0, x), y: max.y, z: max.z + Math.max(0, z) },
  );
}
