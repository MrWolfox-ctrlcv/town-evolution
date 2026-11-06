import type { V6Hydrology } from './v6-hydrology';
import type { V6Starter } from './v6-build-starter';
import { v5Hash } from './v5-world';
import { perlin } from './v5-noise';
import { V6_SIZE, v6Smooth } from './v6-contracts';
const summits = [
  [66, 62, 23, 25, 28],
  [82, 72, 25, 26, 36],
  [99, 82, 27, 27, 42],
  [115, 91, 24, 26, 34],
  [134, 94, 22, 24, 26],
] as const;
const forests = [
  [45, 86, 17, 23],
  [58, 145, 23, 18],
  [151, 120, 20, 23],
  [114, 39, 22, 17],
] as const;
/** Immutable low-frequency landforms only; sampled into the separate Float32 authority. */
export class V6Landform {
  readonly size = V6_SIZE;
  readonly hydrology: V6Hydrology;
  readonly starter: V6Starter;
  private readonly shiftX: number;
  private readonly shiftZ: number;
  private readonly phase: number;
  private readonly reservedBounds: readonly [number, number, number, number];
  constructor(
    readonly seed: number,
    hydrology: V6Hydrology,
    starter: V6Starter,
    reservedBounds: readonly [number, number, number, number],
  ) {
    this.hydrology = hydrology;
    this.starter = starter;
    this.shiftX = (v5Hash(seed, 2, 7) - 0.5) * 6;
    this.shiftZ = (v5Hash(seed, 7, 2) - 0.5) * 6;
    this.phase = v5Hash(seed, 37, 13) * Math.PI * 2;
    this.reservedBounds = reservedBounds;
  }
  accessX(z: number): number {
    return 45 + 4 * Math.sin(z * 0.025 + this.phase);
  }
  forestness(x: number, z: number): number {
    if (x < 36 && z < 36)
      return this.starter.at(Math.floor(x), Math.floor(z))?.biome === 'forest' ? 0.3 : -1;
    let f = -1;
    for (const [cx, cz, rx, rz] of forests)
      f = Math.max(f, 1 - Math.hypot((x - cx - this.shiftX) / rx, (z - cz - this.shiftZ) / rz));
    return f + 0.16 * perlin(x / 7, z / 7, this.seed + 83);
  }
  /** Three long linked grass shelves, no radial/concentric island-wide cakes. */
  private terraceField(x: number, z: number): number {
    const q =
      z +
      0.22 * x +
      5 * Math.sin(x * 0.04 + this.phase) +
      2 * Math.sin(z * 0.03 + this.phase * 0.7);
    const ramp =
      1 + 9 * Math.exp(-(((x - this.accessX(z)) / 7) ** 2)) + 7 * Math.exp(-(((x - 153) / 8) ** 2));
    return (
      2 * v6Smooth((q - 64) / (1.5 * ramp)) +
      2.4 * v6Smooth((q - 103) / (1.7 * ramp)) +
      2 * v6Smooth((q - 140) / (1.8 * ramp))
    );
  }
  private safetyEnvelope(x: number, z: number): number {
    const dry = this.hydrology.fields(x, z).dry;
    if (dry <= 2) return 0;
    const [x0, z0, x1, z1] = this.reservedBounds;
    const reserveDistance = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
    const starterDistance = Math.hypot(Math.max(x - 36, 0), Math.max(z - 36, 0));
    return v6Smooth((dry - 2) / 8) * v6Smooth(reserveDistance / 6) * v6Smooth(starterDistance / 8);
  }
  sample(x: number, z: number): { ground: number; stone: number; soil: number } {
    const hydro = this.hydrology.sample(x, z),
      safe = this.safetyEnvelope(x, z);
    const ground = hydro.height + this.terraceField(x, z) * safe;
    const wx = x - this.shiftX + 1.3 * perlin(x / 17, z / 17, this.seed + 41),
      wz = z - this.shiftZ + 1.3 * perlin(x / 17, z / 17, this.seed + 227);
    let rockPower = 0;
    for (const [cx, cz, rx, rz, h] of summits) {
      const d = ((wx - cx) / rx) ** 2 + ((wz - cz) / rz) ** 2;
      if (d < 1) rockPower += (h * (1 - d) ** 2.5) ** 6;
    }
    let stone = rockPower ** (1 / 6) * safe;
    // Shallow elongated soil seams along grass slopes, not a soil mask on every plateau.
    const band = (
      cx: number,
      cz: number,
      length: number,
      width: number,
      height: number,
      angle: number,
    ) => {
      const dx = x - cx - this.shiftX,
        dz = z - cz - this.shiftZ,
        c = Math.cos(angle),
        s = Math.sin(angle);
      const u = (dx * c + dz * s) / length,
        v = (-dx * s + dz * c) / width,
        d = u * u + v * v;
      return d < 1 ? height * (1 - d) ** 3 : 0;
    };
    let soil =
      Math.max(
        band(45, 64, 17, 4.5, 1.5, -0.23),
        band(53, 114, 20, 5, 1.7, -0.14),
        band(94, 146, 22, 4, 1.35, -0.3),
        band(149, 55, 15, 5, 1.6, -0.2),
      ) *
      safe *
      v6Smooth((Math.abs(x - this.accessX(z)) - 3) / 3);
    // Preserve small accessible starter pockets, while using smooth analytic support.
    if (x < 36 && z < 36) {
      const [x0, z0, x1, z1] = this.reservedBounds;
      const coast =
        v6Smooth((this.hydrology.fields(x, z).dry - 2) / 2.5) *
        v6Smooth(Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)) / 6);
      for (const p of this.starter.pockets) {
        const dx = x - 0.5 - p.x,
          dz = z - 0.5 - p.z,
          c = Math.cos(p.angle),
          s = Math.sin(p.angle);
        const d = ((dx * c + dz * s) / p.rx) ** 2 + ((-dx * s + dz * c) / p.rz) ** 2;
        const h = p.peak * Math.max(0, 1 - d) ** 3 * coast;
        if (p.biome === 'mountain') stone = Math.max(stone, h);
        else soil = Math.max(soil, h);
      }
    }
    return { ground, stone, soil };
  }
}
