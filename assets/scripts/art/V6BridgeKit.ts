import type { TerrainVersion } from '../domain/world';
import type { Building } from '../domain/types';
import { v6BridgeProfile } from '../domain/v6-bridge-profile';
import { woodenBridgeParts, BRIDGE_DECK_TOP } from './WoodenBridgeKit';
import { compileAsset } from './MeshCompiler';
import type { MeshData, V3, Part } from './AssetTypes';

/** Per-instance geometry, never a coordinate-keyed cache entry. Both ramps stay inside
 * the original two endpoint platforms, so art, picking and occupancy have one extent. */
export function v6BridgeParts(
  building: Building,
  seed: number,
  version: TerrainVersion = 6,
): Part[] {
  if (!building.bridge) throw Error('Bridge state required');
  const length = building.bridge.length,
    profile = v6BridgeProfile(seed, { ...building, length }, version);
  return woodenBridgeParts(length)
    .filter(
      (p) =>
        !['pier-deck-plank', 'pier-iron-nail', 'pier-under-beam', 'bridge-bank-plank'].includes(
          p.name,
        ),
    )
    .map((p) => {
      if (p.name.endsWith('rope-rail')) {
        const angle = (p.rotation![0] * Math.PI) / 180,
          half = (p.size[1] - 0.006) / 2;
        const endpoint = (sign: number): V3 => {
          const z = p.position[2] + sign * Math.sin(angle) * half;
          return [
            p.position[0],
            p.position[1] +
              sign * Math.cos(angle) * half +
              profile.height(p.position[0], z) -
              profile.deck,
            z,
          ];
        };
        const a = endpoint(-1),
          b = endpoint(1),
          dy = b[1] - a[1],
          dz = b[2] - a[2],
          distance = Math.hypot(dy, dz);
        return {
          ...p,
          position: [a[0], (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] as V3,
          size: [p.size[0], distance + 0.006, p.size[2]] as V3,
          rotation: [(Math.acos(dy / distance) * 180) / Math.PI, 0, 0] as V3,
        };
      }
      return {
        ...p,
        position: [
          p.position[0],
          p.position[1] + profile.height(p.position[0], p.position[2]) - profile.deck,
          p.position[2],
        ] as V3,
      };
    });
}
export function v6BridgeMesh(
  building: Building,
  seed: number,
  version: TerrainVersion = 6,
): MeshData {
  if (!building.bridge) throw Error('Bridge state required');
  const length = building.bridge.length,
    profile = v6BridgeProfile(seed, { ...building, length }, version);
  const parts = v6BridgeParts(building, seed, version);
  const mesh = compileAsset({ id: 'v6-bridge-instance', footprint: [2, length], parts });
  function triangle(a: V3, b: V3, c: V3, shade: number): void {
    const u = b.map((v, i) => v - a[i]!),
      v = c.map((q, i) => q - a[i]!);
    const n = [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
    const magnitude = Math.hypot(...n),
      start = mesh.positions.length / 3;
    for (const p of [a, b, c]) {
      mesh.positions.push(...p);
      mesh.normals.push(...n.map((q) => q / magnitude));
      mesh.colors.push(0.9 * shade, 0.76 * shade, 0.57 * shade, 1);
      mesh.uvs?.push((p[0] + 1) * 0.4, (p[2] + length / 2) * 0.3);
      for (let k = 0; k < 3; k++) {
        mesh.min[k] = Math.min(mesh.min[k]!, p[k]!);
        mesh.max[k] = Math.max(mesh.max[k]!, p[k]!);
      }
    }
    mesh.indices.push(start, start + 1, start + 2);
    mesh.texturedIndices!.push(start, start + 1, start + 2);
  }
  const point = (x: number, z: number, lower = false): V3 => [
    x,
    profile.height(x, z) - profile.deck + BRIDGE_DECK_TOP - (lower ? 0.12 : 0),
    z,
  ];
  for (const end of [-1, 1])
    for (let j = 0; j < 8; j++)
      for (let i = 0; i < 8; i++) {
        const x = i / 4 - 1,
          z = end < 0 ? -length / 2 + j / 4 : length / 2 - 2 + j / 4;
        const a = point(x, z),
          b = point(x, z + 0.25),
          c = point(x + 0.25, z + 0.25),
          d = point(x + 0.25, z);
        const shade = j % 2 ? 1 : 0.94;
        // Preserve the world terrain's triangle diagonal through every quarter turn.
        if (building.rotation % 2) {
          triangle(a, b, d, shade);
          triangle(b, c, d, shade);
        } else {
          triangle(a, b, c, shade);
          triangle(a, c, d, shade);
        }
        for (const [p, q] of [
          [a, d],
          [d, c],
          [c, b],
          [b, a],
        ]) {
          const lowP: V3 = [p![0], p![1] - 0.12, p![2]],
            lowQ: V3 = [q![0], q![1] - 0.12, q![2]];
          triangle(p!, q!, lowP, shade * 0.85);
          triangle(q!, lowQ, lowP, shade * 0.85);
        }
      }
  return mesh;
}
