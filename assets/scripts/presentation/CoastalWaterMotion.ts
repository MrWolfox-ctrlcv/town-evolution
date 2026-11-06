import { _decorator, Component, Mesh, MeshRenderer, utils } from 'cc';
import type { CoastalWaterData } from '../art/CoastalWater';
import { coastalWaveHeight, coastalFoamStrength } from '../art/CoastalWater';
/** Separate 20 Hz water-only upload. Reuses typed arrays, never animates terrain or save data. */
@_decorator.ccclass('CoastalWaterMotion')
export class CoastalWaterMotion extends Component {
  private mesh: Mesh | null = null;
  private renderer: MeshRenderer | null = null;
  private positions = new Float32Array();
  private colors = new Float32Array();
  private indices = new Uint16Array();
  private baseColors = new Float32Array();
  private shoreDistances = new Float32Array();
  private shoreBreaks = new Float32Array();
  private heightOffsets = new Float32Array();
  private seed = 0;
  private time = 0;
  private elapsed = 0;
  configure(renderer: MeshRenderer, data: CoastalWaterData, seed: number): void {
    if (data.positions.length / 3 > 65535 || data.indices.some((index) => index > 65534))
      throw new Error('Coastal water exceeds the 16-bit vertex budget');
    this.mesh?.destroy();
    this.renderer = renderer;
    this.seed = seed;
    this.positions = new Float32Array(data.positions);
    this.baseColors = new Float32Array(data.colors);
    this.colors = this.baseColors.slice();
    this.indices = new Uint16Array(data.indices);
    const count = data.positions.length / 3;
    this.shoreDistances = new Float32Array(data.shoreDistances ?? Array(count).fill(-1));
    this.shoreBreaks = new Float32Array(data.shoreBreaks ?? Array(count).fill(0));
    this.heightOffsets = new Float32Array(data.heightOffsets ?? Array(count).fill(0));
    this.sampleWave();
    this.mesh = utils.MeshUtils.createDynamicMesh(
      0,
      {
        positions: this.positions,
        colors: this.colors,
        indices16: this.indices,
        minPos: { x: data.min[0]!, y: -0.65, z: data.min[2]! },
        maxPos: { x: data.max[0]!, y: -0.58, z: data.max[2]! },
      },
      undefined,
      {
        maxSubMeshes: 1,
        maxSubMeshVertices: this.positions.length / 3,
        maxSubMeshIndices: this.indices.length,
      },
    );
    renderer.mesh = this.mesh;
  }
  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0 || !this.mesh) return;
    this.time += Math.min(dt, 0.25);
    this.elapsed += dt;
    if (this.elapsed < 0.05) return;
    this.elapsed = 0;
    this.sampleWave();
    this.mesh.updateSubMesh(0, {
      positions: this.positions,
      colors: this.colors,
      indices16: this.indices,
    });
  }
  private sampleWave(): void {
    for (let i = 0, c = 0; i < this.positions.length; i += 3, c += 4) {
      const h = coastalWaveHeight(this.positions[i]!, this.positions[i + 2]!, this.seed, this.time);
      const vertex = i / 3;
      this.positions[i + 1] = h + this.heightOffsets[vertex]!;
      const foam = coastalFoamStrength(
        this.shoreDistances[vertex]!,
        this.shoreBreaks[vertex]!,
        this.time,
      );
      const light = (h + 0.62) * 0.7;
      for (let k = 0; k < 3; k++)
        this.colors[c + k] = Math.max(
          0,
          Math.min(
            1,
            this.baseColors[c + k]! * (1 - foam) + (k === 0 ? 0.86 : 0.96) * foam + light,
          ),
        );
    }
  }
  onDestroy(): void {
    if (this.renderer) this.renderer.mesh = null;
    this.mesh?.destroy();
    this.mesh = null;
    this.renderer = null;
  }
}
