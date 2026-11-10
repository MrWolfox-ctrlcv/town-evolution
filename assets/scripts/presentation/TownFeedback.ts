import { v5TreeVisual } from '../art/V5TreeGeometry';
import { resourceTreeVisual } from '../art/TreeKit';
import { woodChipPose } from '../art/FeedbackMath';
import { _decorator, Component, Node, isValid } from 'cc';
import type { Building } from '../domain/game';
import type { SurfacePoint } from '../application/NaturalPicking';
import type { ModelFactory } from './ModelFactory';
interface Effect {
  root: Node;
  age: number;
  duration: number;
  pose: (t: number) => void;
  finish?: () => void;
}
/** Bounded presentation-only feedback. No timers, economy mutations or per-frame mesh creation. */
@_decorator.ccclass('TownFeedback')
export class TownFeedback extends Component {
  private effects: Effect[] = [];
  private factory!: ModelFactory;
  configure(factory: ModelFactory): void {
    this.factory = factory;
  }
  private add(effect: Effect): void {
    while (this.effects.length >= 12) this.release(this.effects.shift()!);
    this.node.addChild(effect.root);
    this.effects.push(effect);
    effect.pose(0);
  }
  chop(x: number, z: number, seed = 1, v5 = false, origin?: SurfacePoint): void {
    const root = new Node('CommittedTreeChop');
    const wide = v5 ? v5TreeVisual(seed, x, z) : null;
    root.setPosition(
      origin?.x ?? x + 0.5 + (wide?.offset[0] ?? 0),
      origin?.y ?? (v5 ? 0.015 : 0),
      origin?.z ?? z + 0.5 + (wide?.offset[2] ?? 0),
    );
    const visual = wide ?? resourceTreeVisual(seed, x, z);
    const tree = this.factory.asset(visual.asset, 'FallingTree');
    tree.setScale(...visual.scale);
    root.addChild(tree);
    const axe = new Node('AxeSwing');
    root.addChild(axe);
    this.factory.shape(axe, 'Handle', 0, 0, 0, 0.07, 0.75, 0.07, '#94633E');
    this.factory.shape(axe, 'Blade', 0.13, 0.3, 0, 0.36, 0.23, 0.1, '#C1D2D3');
    const chips = Array.from({ length: 6 }, (_, i) =>
      this.factory.shape(
        root,
        'WoodChip',
        0,
        0.3,
        0,
        0.11,
        0.09,
        0.19,
        i % 2 ? '#DDB57A' : '#AA7548',
      ),
    );
    this.add({
      root,
      age: 0,
      duration: 0.8,
      pose: (t) => {
        const hit = Math.min(1, t / 0.26);
        axe.active = t < 0.4;
        axe.setPosition(-0.55 + hit * 0.6, 0.75, 0.05);
        axe.setRotationFromEuler(0, 0, 65 - hit * 135);
        const fall = Math.max(0, (t - 0.2) / 0.8);
        tree.setRotationFromEuler(
          0,
          visual.yaw,
          t < 0.2 ? Math.sin(t * 110) * 5 : -fall * fall * 88,
        );
        const shrink = 1 - Math.max(0, (t - 0.72) / 0.28);
        tree.setScale(visual.scale[0] * shrink, visual.scale[1] * shrink, visual.scale[2] * shrink);
        chips.forEach((chip, i) => {
          const p = Math.max(0, (t - 0.23) / 0.77);
          const pose = woodChipPose(i, t);
          chip.active = t > 0.23;
          chip.setPosition(pose.x, pose.y, pose.z);
          chip.setRotationFromEuler(p * 260, i * 43, p * 180);
          const chipScale = 1 - Math.max(0, (t - 0.85) / 0.15);
          chip.setScale(0.11 * chipScale, 0.09 * chipScale, 0.19 * chipScale);
        });
      },
    });
  }
  construct(target: Node, b: Building): void {
    const root = new Node('CommittedConstruction');
    root.setPosition(target.position);
    const pieces = Array.from({ length: 6 }, (_, i) =>
      this.factory.shape(
        root,
        'GatheringMaterial',
        0,
        0,
        0,
        0.2,
        0.16,
        0.38,
        i % 2 ? '#C5B99E' : '#AA7548',
      ),
    );
    this.add({
      root,
      age: 0,
      duration: 0.58,
      finish: () => {
        if (isValid(target)) target.setScale(1, 1, 1);
      },
      pose: (t) => {
        if (isValid(target)) {
          const pop = 1 + Math.sin(Math.PI * t) * 0.12;
          target.setScale(
            pop,
            Math.max(0.4, 1 - Math.exp(-t * 8) * 0.6) + Math.sin(t * Math.PI) * 0.12,
            pop,
          );
        }
        pieces.forEach((piece, i) => {
          const a = (i * Math.PI) / 3 + b.rotation,
            radius = (1 - t) * 1.5;
          piece.setPosition(
            Math.cos(a) * radius,
            0.15 + Math.sin(t * Math.PI) * 0.55,
            Math.sin(a) * radius,
          );
          piece.setRotationFromEuler(t * 180, i * 37, 0);
          const s = Math.max(0, 1 - t);
          piece.setScale(0.2 * s, 0.16 * s, 0.38 * s);
        });
      },
    });
  }
  stack(x: number, z: number, origin?: SurfacePoint): void {
    const root = new Node('CommittedStackPulse');
    root.setPosition(origin?.x ?? x + 0.5, origin ? origin.y + 0.09 : 0.09, origin?.z ?? z + 0.5);
    const bars = [-1, 1].map((side) =>
      this.factory.shape(root, 'StackSpark', side * 0.48, 0, 0, 0.08, 0.08, 0.65, '#F3D37C'),
    );
    this.add({
      root,
      age: 0,
      duration: 0.35,
      pose: (t) => {
        bars.forEach((bar, i) => {
          bar.setPosition((i ? 1 : -1) * (0.48 + t * 0.2), Math.sin(t * Math.PI) * 0.25, 0);
          bar.setScale(0.08 * (1 - t), 0.08, 0.65);
        });
      },
    });
  }
  drop(point: { x: number; y: number; z: number }): void {
    const root = new Node('CommittedDropPulse');
    root.setPosition(point.x, point.y + 0.02, point.z);
    const bars = [-1, 1].map((side) =>
      this.factory.shape(root, 'DropSpark', side * 0.18, 0, 0, 0.035, 0.035, 0.24, '#F3D37C'),
    );
    this.add({
      root,
      age: 0,
      duration: 0.35,
      pose: (t) => {
        bars.forEach((bar, i) => {
          bar.setPosition((i ? 1 : -1) * (0.18 + t * 0.08), Math.sin(t * Math.PI) * 0.06, 0);
          bar.setScale(0.035 * (1 - t), 0.035, 0.24);
        });
      },
    });
  }
  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.age += dt;
      effect.pose(Math.min(1, effect.age / effect.duration));
      if (effect.age >= effect.duration) {
        this.effects.splice(i, 1);
        this.release(effect);
      }
    }
  }
  private release(effect: Effect): void {
    effect.finish?.();
    effect.root.destroy();
  }
  clear(): void {
    for (const effect of this.effects) this.release(effect);
    this.effects = [];
  }
  onDestroy(): void {
    this.clear();
  }
}
