import { _decorator, Component, Node } from 'cc';
import type { Job } from '../domain/game';
import { cropClock, cropPose } from '../art/CropAnimation';
export interface MovingCrop {
  node: Node;
  job: Job;
  phase: number;
  ready: boolean;
}
/** One lightweight updater per farm, no tweens/timers/listeners or mesh allocation per frame. */
@_decorator.ccclass('CropMotion')
export class CropMotion extends Component {
  private crops: MovingCrop[] = [];
  private time = 0;
  configure(crops: MovingCrop[], now: number): void {
    this.crops = crops;
    this.time = now;
    this.apply();
  }
  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.time = cropClock(this.time, dt, Date.now());
    this.apply();
  }
  private apply(): void {
    for (const crop of this.crops) {
      const pose = cropPose(crop.job, this.time, crop.phase, crop.ready);
      crop.node.setRotationFromEuler(pose.leanX, 0, pose.leanZ);
      crop.node.setScale(pose.width, pose.height, pose.width);
    }
  }
  onDestroy(): void {
    this.crops = [];
  }
}
