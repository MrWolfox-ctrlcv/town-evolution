import type { V3 } from './AssetTypes';
/** Small deterministic polyhedra: rounded crowns and tapered six-sided timber. */
function crown() {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ];
  const normalized = (v: number[]): V3 =>
    v.map((n) => (n / Math.hypot(...v)) * 0.5) as unknown as V3;
  const vertices: V3[] = raw.map(normalized);
  const base = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  const edges = new Map<string, number>();
  const midpoint = (a: number, b: number): number => {
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    const old = edges.get(key);
    if (old !== undefined) return old;
    const index = vertices.length;
    vertices.push(normalized(vertices[a]!.map((n, i) => n + vertices[b]![i]!)));
    edges.set(key, index);
    return index;
  };
  const faces: number[][] = [];
  for (const [a, b, c] of base) {
    const ab = midpoint(a!, b!),
      bc = midpoint(b!, c!),
      ca = midpoint(c!, a!);
    faces.push([a!, ab, ca], [b!, bc, ab], [c!, ca, bc], [ab, bc, ca]);
  }
  return { vertices, faces };
}
function timber() {
  const vertices: V3[] = [];
  for (const y of [-0.5, 0.5])
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3,
        r = y < 0 ? 0.5 : 0.3;
      vertices.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
  const faces: number[][] = [
    [0, 1, 2, 3, 4, 5],
    [11, 10, 9, 8, 7, 6],
  ];
  for (let i = 0; i < 6; i++) faces.push([i, i + 6, ((i + 1) % 6) + 6, (i + 1) % 6]);
  return { vertices, faces };
}
export const CROWN = crown();
export const TIMBER = timber();
