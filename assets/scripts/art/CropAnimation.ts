import type { Crop, Job } from '../domain/game';
export interface CropPose {
  leanX: number;
  leanZ: number;
  width: number;
  height: number;
}
/** Pure, frame-rate independent pose. Soil anchors and simulation state never move. */
export function cropPose(job: Job, now: number, phase: number, ready: boolean): CropPose {
  const crop: Crop = job.crop ?? 'vegetable';
  const progress = Math.max(
    0,
    Math.min(1, (now - job.startedAt) / Math.max(1, job.readyAt - job.startedAt)),
  );
  const time = now / 1000;
  const strength = crop === 'wheat' ? 2.1 : crop === 'lettuce' ? 0.55 : 1.2;
  const wind = Math.sin(time * 1.7 + phase) * 0.7 + Math.sin(time * 0.73 + phase * 0.4) * 0.3;
  const age = (now - job.readyAt) / 1000;
  // One restrained ripening stretch, never a repeating bounce or delayed replay on reload.
  const ripe = ready && age >= 0 && age < 0.8 ? Math.sin((age / 0.8) * Math.PI) * 0.065 : 0;
  const growth = ready ? 1 : 0.78 + 0.22 * progress;
  return {
    leanX: wind * strength,
    leanZ: Math.sin(time * 1.31 + phase + 1.4) * strength * 0.6,
    width: growth - ripe * 0.3,
    height: growth + ripe,
  };
}
/** Stable spatial phase: adjacent plots do not sway in robotic unison. */
export function cropPhase(x: number, z: number, cell: number): number {
  return (((x * 71 + z * 137 + cell * 47) % 997) / 997) * Math.PI * 2;
}

/** Resume follows elapsed wall time, while clock rollback cannot reverse crop motion. */
export function cropClock(current: number, dt: number, wallNow: number): number {
  return Math.max(current + Math.max(0, dt) * 1000, wallNow);
}
