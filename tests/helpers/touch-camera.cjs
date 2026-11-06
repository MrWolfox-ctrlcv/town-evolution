/** Analytic orthographic projection matching the town camera, without a GPU. */
const { touch } = require('./resource-picking-ui.cjs');
function camera(scale = 18, dpr = 1, direction = [-15, -20, -18]) {
  const length = Math.hypot(...direction),
    d = { x: direction[0] / length, y: direction[1] / length, z: direction[2] / length },
    planar = Math.hypot(d.x, d.z),
    right = { x: -d.z / planar, y: 0, z: d.x / planar },
    up = { x: (-d.x * d.y) / planar, y: planar, z: (-d.z * d.y) / planar };
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const project = (p) => ({
    x: (195 + dot(p, right) * scale) * dpr,
    y: (400 + dot(p, up) * scale) * dpr,
  });
  const ray = (p) => {
    const x = (p.x / dpr - 195) / scale,
      y = (p.y / dpr - 400) / scale;
    return {
      o: {
        x: right.x * x + up.x * y - d.x * 50,
        y: up.y * y - d.y * 50,
        z: right.z * x + up.z * y - d.z * 50,
      },
      d,
    };
  };
  const contains = (p) => p.x >= 0 && p.x <= 390 * dpr && p.y >= 0 && p.y <= 800 * dpr;
  const contact = (p, allows = contains) =>
    touch.markTouchRay(ray(p), { point: p, radius: 6 * dpr, project, ray, contains: allows });
  return { ray, project, contact, contains, direction: d };
}
module.exports = { camera };
