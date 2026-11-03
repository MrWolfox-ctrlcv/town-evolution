import type { MeshData, V3 } from './AssetTypes';
export interface GroundActor {
  x: number;
  z: number;
  width: number;
  depth: number;
  tree: boolean;
  prop?: boolean;
  rotation: number;
}
export function sceneGroundArt(
  size: number,
  seed: number,
  actors: GroundActor[],
  land: (x: number, z: number) => boolean,
): MeshData {
  const m: MeshData = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  const key = (x: number, z: number) => `${x},${z}`;
  const occupied = new Set<string>();
  for (const a of actors.filter((actor) => !actor.prop))
    for (let x = a.x; x < a.x + a.width; x++)
      for (let z = a.z; z < a.z + a.depth; z++) occupied.add(key(x, z));
  const roads = new Set<string>();
  const walk = (x: number, z: number) =>
    x >= 0 && z >= 0 && x < size && z < size && land(x, z) && !occupied.has(key(x, z));
  const buildings = actors.filter((a) => !a.tree && !a.prop);
  function entrance(a: GroundActor): [number, number] | null {
    const ends: [[number, number], [number, number], [number, number], [number, number]] = [
      [Math.floor(a.x + a.width / 2), a.z + a.depth],
      [a.x + a.width, Math.floor(a.z + a.depth / 2)],
      [Math.floor(a.x + a.width / 2), a.z - 1],
      [a.x - 1, Math.floor(a.z + a.depth / 2)],
    ];
    for (let i = 0; i < 4; i++) {
      const p = ends[(a.rotation + i) % 4]!;
      if (walk(...p)) return p;
    }
    return null;
  }
  const anchors = buildings.map(entrance).filter((a): a is [number, number] => a !== null);
  for (let i = 1; i < anchors.length; i++) {
    const start = anchors[i]!,
      goal = anchors
        .slice(0, i)
        .sort(
          (a, b) =>
            Math.abs(a[0] - start[0]) +
            Math.abs(a[1] - start[1]) -
            Math.abs(b[0] - start[0]) -
            Math.abs(b[1] - start[1]),
        )[0]!;
    const queue: [number, number][] = [start],
      previous = new Map<string, string | null>([[key(...start), null]]);
    for (let head = 0; head < queue.length; head++) {
      const p = queue[head]!;
      if (key(...p) === key(...goal)) break;
      for (const [dx, dz] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]) {
        const next: [number, number] = [p[0] + dx!, p[1] + dz!],
          k = key(...next);
        if (walk(...next) && !previous.has(k)) {
          previous.set(k, key(...p));
          queue.push(next);
        }
      }
    }
    let current: string | null = key(...goal);
    if (previous.has(current))
      while (current !== null) {
        roads.add(current);
        current = previous.get(current) ?? null;
      }
  }
  const meadow = (x: number, z: number) => {
    const tone = 0.94 + 0.055 * Math.sin(x * 0.47 + seed) + 0.035 * Math.cos(z * 0.38 + seed * 0.1);
    return [147, 173, 102].map((c) => (c / 255) * tone);
  };
  const base = (x: number, z: number) =>
    roads.has(key(Math.floor(x), Math.floor(z))) ? [0.8, 0.69, 0.46] : meadow(x, z);
  function triangle(a: V3, b: V3, c: V3, colors: number[][]) {
    const start = m.positions.length / 3;
    for (const [i, p] of [a, b, c].entries()) {
      m.positions.push(...p);
      m.normals.push(0, 1, 0);
      m.colors.push(...colors[i]!, 1);
      p.forEach((v, k) => {
        m.min[k] = Math.min(m.min[k]!, v);
        m.max[k] = Math.max(m.max[k]!, v);
      });
    }
    m.indices.push(start, start + 1, start + 2);
  }
  function paving(x: number, z: number, width: number, y: number, color: number[]) {
    const a: V3 = [x, y, z],
      b: V3 = [x, y, z + width],
      c: V3 = [x + width, y, z + width],
      d: V3 = [x + width, y, z];
    triangle(a, b, c, [color, color, color]);
    triangle(a, c, d, [color, color, color]);
  }
  for (const road of roads) {
    const [x, z] = road.split(',').map(Number) as [number, number];
    paving(x, z, 1, 0.02, [0.72, 0.61, 0.4]);
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 2; col++)
        paving(x + col * 0.5 + 0.012, z + row * 0.5 + 0.012, 0.476, 0.022, [0.8, 0.69, 0.46]);
  }
  for (const actor of actors) {
    const cx = actor.x + actor.width / 2 + 0.035,
      cz = actor.z + actor.depth / 2 + 0.035;
    const rx = actor.tree ? 0.28 : actor.prop ? 0.43 : actor.width * 0.53,
      rz = actor.tree ? 0.24 : actor.prop ? 0.4 : actor.depth * 0.52;
    const segments = 16;
    for (let i = 0; i < segments; i++) {
      const a = (i * Math.PI * 2) / segments,
        b = ((i + 1) * Math.PI * 2) / segments;
      const points: V3[] = [
        [cx, 0.028, cz],
        [cx + Math.cos(b) * rx, 0.028, cz + Math.sin(b) * rz],
        [cx + Math.cos(a) * rx, 0.028, cz + Math.sin(a) * rz],
      ];
      if (points.some((p) => !land(Math.floor(p[0]), Math.floor(p[2])))) continue;
      const cols = points.map((p, j) =>
        base(p[0], p[2]).map(
          (v, k) => v * (j === 0 ? 0.57 : 1) + (j === 0 ? [0.025, 0.035, 0.012][k]! : 0),
        ),
      );
      triangle(points[0]!, points[1]!, points[2]!, cols);
    }
  }
  // Short meadow tufts are scenery, never tree-shaped resources or collision nodes.
  for (let x = 1; x < size - 1; x++)
    for (let z = 1; z < size - 1; z++) {
      if (!walk(x, z) || roads.has(key(x, z)) || (x * 71 + z * 37 + seed) % 19 !== 0) continue;
      const cx = x + 0.44,
        cz = z + 0.5;
      for (const side of [-1, 0, 1]) {
        const a: V3 = [cx + side * 0.1 - 0.045, 0.019, cz],
          b: V3 = [cx + side * 0.14, 0.16 + Math.abs(side) * 0.035, cz + 0.035],
          c: V3 = [cx + side * 0.1 + 0.045, 0.019, cz + 0.06];
        const color = side === 0 ? [0.47, 0.61, 0.23] : [0.57, 0.69, 0.29];
        triangle(a, b, c, [color, color, color]);
        triangle(c, b, a, [color, color, color]);
      }
    }
  if (!m.positions.length) m.min = m.max = [0, 0, 0];
  return m;
}
export function appendGroundMesh(target: MeshData, detail: MeshData): MeshData {
  const offset = target.positions.length / 3;
  target.positions.push(...detail.positions);
  target.normals.push(...detail.normals);
  target.colors.push(...detail.colors);
  target.indices.push(...detail.indices.map((i) => i + offset));
  for (let i = 0; i < 3; i++) {
    target.min[i] = Math.min(target.min[i]!, detail.min[i]!);
    target.max[i] = Math.max(target.max[i]!, detail.max[i]!);
  }
  return target;
}
