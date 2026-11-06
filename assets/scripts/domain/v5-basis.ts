/** Separable cubic stencil: first X/Z index, four X weights, four Z weights.
 * Ten packed numbers replace sixteen nested index/weight pairs per sample. */
export type FieldStencil = readonly number[];
/** Gaussian splats and cubic B-spline interpolation have nonnegative weights.
 * Lowering a resource can therefore never raise any sampled neighbor. */
export class PositiveField {
  private readonly data: Float64Array;
  private readonly kernel: number[];
  private readonly radius: number;
  constructor(
    private readonly size: number,
    sigma: number,
    private readonly origin = -1.5,
    private readonly scale = 1,
  ) {
    this.data = new Float64Array(size * size);
    this.radius = Math.floor(sigma * 4 + 0.5);
    this.kernel = Array.from({ length: this.radius * 2 + 1 }, (_, i) =>
      Math.exp(-0.5 * ((i - this.radius) / sigma) ** 2),
    );
    const sum = this.kernel.reduce((a, b) => a + b, 0);
    this.kernel = this.kernel.map((v) => v / sum);
  }
  add(x: number, z: number, delta: number): void {
    for (let i = -this.radius; i <= this.radius; i++) {
      const a = x + i;
      if (a < 0 || a >= this.size) continue;
      for (let j = -this.radius; j <= this.radius; j++) {
        const b = z + j;
        if (b >= 0 && b < this.size)
          this.data[a * this.size + b]! +=
            delta * this.kernel[i + this.radius]! * this.kernel[j + this.radius]!;
      }
    }
  }
  /** A compact immutable stencil can be reused after any stock change. */
  stencil(x: number, z: number): FieldStencil {
    x = (x - this.origin) * this.scale;
    z = (z - this.origin) * this.scale;
    const ix = Math.floor(x),
      iz = Math.floor(z);
    const weights = (t: number) => [
      (1 - t) ** 3 / 6,
      (3 * t ** 3 - 6 * t * t + 4) / 6,
      (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6,
      t ** 3 / 6,
    ];
    return [ix - 1, iz - 1, ...weights(x - ix), ...weights(z - iz)];
  }
  sample(stencil: FieldStencil): number {
    let sum = 0;
    for (let i = 0; i < 4; i++) {
      const a = stencil[0]! + i;
      if (a < 0 || a >= this.size) continue;
      for (let j = 0; j < 4; j++) {
        const b = stencil[1]! + j;
        if (b >= 0 && b < this.size)
          sum += this.data[a * this.size + b]! * (stencil[i + 2]! * stencil[j + 6]!);
      }
    }
    return Math.max(0, sum);
  }
  at(x: number, z: number): number {
    return this.sample(this.stencil(x, z));
  }
}
