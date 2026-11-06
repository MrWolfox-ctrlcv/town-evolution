/** Deterministic mesh occlusion check at the game's orthographic camera angle, not a GPU screenshot. */
function visibleUnitPixels(units) {
  const size = 160,
    scale = 128;
  const normalize = (v) => v.map((n) => n / Math.hypot(...v));
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const forward = normalize([15, 20, 18]),
    right = normalize(cross([0, 1, 0], forward)),
    up = cross(forward, right);
  const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
  const depth = new Float64Array(size * size).fill(-Infinity),
    owner = new Int16Array(size * size).fill(-1);
  units.forEach((mesh, unit) => {
    const points = [];
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const p = mesh.positions.slice(i, i + 3);
      points.push([
        dot(p, right) * scale + size / 2,
        -dot(p, up) * scale + size * 0.72,
        dot(p, forward),
      ]);
    }
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const [a, b, c] = mesh.indices.slice(i, i + 3).map((index) => points[index]);
      const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(denominator) < 1e-8) continue;
      const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))),
        maxX = Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0]))),
        minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))),
        maxY = Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
          const u =
              ((b[1] - c[1]) * (x + 0.5 - c[0]) + (c[0] - b[0]) * (y + 0.5 - c[1])) / denominator,
            v = ((c[1] - a[1]) * (x + 0.5 - c[0]) + (a[0] - c[0]) * (y + 0.5 - c[1])) / denominator,
            w = 1 - u - v;
          if (u < 0 || v < 0 || w < 0) continue;
          const z = u * a[2] + v * b[2] + w * c[2],
            pixel = y * size + x;
          if (z > depth[pixel]) {
            depth[pixel] = z;
            owner[pixel] = unit;
          }
        }
    }
  });
  const counts = units.map(() => 0);
  for (const id of owner) if (id >= 0) counts[id]++;
  return counts;
}
module.exports = { visibleUnitPixels };
