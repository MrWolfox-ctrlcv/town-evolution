import type { MeshData, V3 } from './AssetTypes';
/** Stable world scenery. The entire legal grid stays level; irregular coasts are outside it. */
export function islandTerrain(
  size: number,
  seed = 73129,
  isLand: (x: number, z: number) => boolean = () => true,
): MeshData {
  const mesh: MeshData = {
    positions: [],
    normals: [],
    colors: [],
    indices: [],
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  const hash = (n: number): number => {
    let v = (n ^ seed) >>> 0;
    v = Math.imul(v ^ (v >>> 16), 0x45d9f3b);
    v = Math.imul(v ^ (v >>> 16), 0x45d9f3b);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
  };
  function triangle(a: V3, b: V3, c: V3, hex: string, shade = 1) {
    const upward = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (upward < 0) [b, c] = [c, b];
    const u = b.map((n, i) => n - a[i]!),
      v = c.map((n, i) => n - a[i]!);
    const normal = [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
    const length = Math.hypot(...normal);
    const start = mesh.positions.length / 3;
    const rgb = [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255) * shade);
    for (const p of [a, b, c]) {
      mesh.positions.push(...p);
      mesh.normals.push(...normal.map((n) => n / length));
      const meadowTone =
        0.94 + 0.055 * Math.sin(p[0] * 0.47 + seed) + 0.035 * Math.cos(p[2] * 0.38 + seed * 0.1);
      mesh.colors.push(
        ...(hex === '#93AD66' ? [0x93, 0xad, 0x66].map((c) => (c / 255) * meadowTone) : rgb),
        1,
      );
      p.forEach((n, i) => {
        mesh.min[i] = Math.min(mesh.min[i]!, n);
        mesh.max[i] = Math.max(mesh.max[i]!, n);
      });
    }
    mesh.indices.push(start, start + 1, start + 2);
  }
  function quad(a: V3, b: V3, c: V3, d: V3, hex: string, shade = 1) {
    triangle(a, b, c, hex, shade);
    triangle(a, c, d, hex, shade);
  }
  quad(
    [-size, -0.44, -size],
    [-size, -0.44, size * 2],
    [size * 2, -0.44, size * 2],
    [size * 2, -0.44, -size],
    '#579DA8',
  );
  // Broad, softly varying meadow patches instead of permanent graph-paper grid lines.
  for (let x = 0; x < size; x++)
    for (let z = 0; z < size; z++) {
      if (!isLand(x, z)) continue;
      const tone =
        0.94 +
        0.055 * Math.sin(x * 0.47 + seed) +
        0.035 * Math.cos(z * 0.38 + seed * 0.1) +
        hash(x * 97 + z) * 0.035;
      quad(
        [x, 0.015, z],
        [x, 0.015, z + 1],
        [x + 1, 0.015, z + 1],
        [x + 1, 0.015, z],
        '#93AD66',
        tone,
      );
    }
  // Trace legal land/water boundaries. Rings share vertices, including the old harbour bay.
  const edges = new Map<string, [number, number]>();
  const land = (x: number, z: number) => x >= 0 && z >= 0 && x < size && z < size && isLand(x, z);
  const edge = (x: number, z: number, nx: number, nz: number) => edges.set(`${x},${z}`, [nx, nz]);
  for (let x = 0; x < size; x++)
    for (let z = 0; z < size; z++)
      if (land(x, z)) {
        if (!land(x - 1, z)) edge(x, z, x, z + 1);
        if (!land(x, z + 1)) edge(x, z + 1, x + 1, z + 1);
        if (!land(x + 1, z)) edge(x + 1, z + 1, x + 1, z);
        if (!land(x, z - 1)) edge(x + 1, z, x, z);
      }
  const boundary: Array<[number, number]> = [];
  const start = edges.keys().next().value!;
  let key = start;
  do {
    boundary.push(key.split(',').map(Number) as [number, number]);
    const next = edges.get(key);
    if (!next) throw new Error('Broken island contour');
    key = next.join(',');
  } while (key !== start && boundary.length <= edges.size);
  if (boundary.length !== edges.size)
    throw new Error('Island must have a single connected shoreline');
  const smooth = boundary.map((_, i) => {
    const result = [0, 0];
    for (let offset = -2; offset <= 2; offset++) {
      const weight = 3 - Math.abs(offset),
        p = boundary[(i + offset + boundary.length) % boundary.length]!;
      result[0]! += (p[0] * weight) / 9;
      result[1]! += (p[1] * weight) / 9;
    }
    return result;
  });
  const rings: V3[][] = [[], [], [], []];
  for (let i = 0; i < boundary.length; i++) {
    const point = boundary[i]!,
      prev = boundary[(i + boundary.length - 1) % boundary.length]!,
      next = boundary[(i + 1) % boundary.length]!;
    const dx = next[0] - prev[0],
      dz = next[1] - prev[1],
      length = Math.hypot(dx, dz);
    const nx = -dz / length,
      nz = dx / length;
    const noise =
      Math.sin(i * 0.33 + hash(11) * 6.28) * 0.13 + Math.sin(i * 0.81 + hash(17) * 6.28) * 0.06;
    const dockFacing = nz > 0.6;
    const sand = dockFacing ? 0.42 + noise : 1.3 + noise * 3.5;
    const widths = [0, 0.14 + noise * 0.4, sand, sand + 0.85 + noise];
    const before = smooth[(i + boundary.length - 1) % boundary.length]!,
      after = smooth[(i + 1) % boundary.length]!;
    const sx = after[0]! - before[0]!,
      sz = after[1]! - before[1]!,
      sl = Math.hypot(sx, sz);
    for (let r = 0; r < 4; r++)
      rings[r]!.push([
        r < 2 ? point[0] + nx * widths[r]! : smooth[i]![0]! - (sz / sl) * widths[r]!,
        [0.015, 0.006, -0.23, -0.38][r]!,
        r < 2 ? point[1] + nz * widths[r]! : smooth[i]![1]! + (sx / sl) * widths[r]!,
      ]);
  }
  for (let r = 0; r < 3; r++)
    for (let i = 0; i < boundary.length; i++) {
      const j = (i + 1) % boundary.length;
      quad(
        rings[r]![i]!,
        rings[r]![j]!,
        rings[r + 1]![j]!,
        rings[r + 1]![i]!,
        ['#93AD66', '#DCC392', '#85BDB4'][r]!,
        0.94 + hash(r * 100 + i) * 0.09,
      );
    }
  for (let i = 0; i < boundary.length; i += 3) {
    const a = rings[2]![i]!,
      b = rings[3]![i]!,
      t = 0.65;
    const x = a[0] + (b[0] - a[0]) * t,
      z = a[2] + (b[2] - a[2]) * t,
      w = 0.14 + hash(i + 201) * 0.18;
    quad(
      [x - w, -0.321, z - 0.018],
      [x - w, -0.321, z + 0.018],
      [x + w, -0.321, z + 0.018],
      [x + w, -0.321, z - 0.018],
      '#B4DAD0',
    );
  }
  return mesh;
}
