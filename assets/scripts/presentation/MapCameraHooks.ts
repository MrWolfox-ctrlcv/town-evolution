import type { Vec3, geometry } from 'cc';
import type { Point } from '../application/MapGesture';
/** Input and picking boundary for the map camera. */
export interface MapHooks {
  covered(point: Point): boolean;
  ground?(ray: geometry.Ray): { x: number; y: number; z: number } | null;
  tap(point: { x: number; z: number }, ray: geometry.Ray): void;
  candidate(ray: geometry.Ray): string | null;
  drag(id: string, point: Vec3, ray: geometry.Ray | null, screen: Point): void;
  drop(id: string, ray: geometry.Ray | null, screen: Point): void;
  cancel(): void;
}
