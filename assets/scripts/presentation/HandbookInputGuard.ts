import { Node, EventTouch, EventMouse, input } from 'cc';
import { hasInputConflict, inputOwner } from './InputProvenance';

/** Paper consumes every wheel event, but only valid vertical motion requests zoom. */
export function handleHandbookWheel(event: EventMouse, zoom: (factor: number) => void): void {
  event.propagationStopped = true;
  const delta = event.getScrollY();
  if (!Number.isFinite(delta) || delta === 0) return;
  zoom(delta > 0 ? 1.1 : 1 / 1.1);
}

type Phase = 'start' | 'move' | 'end' | 'cancel';
/** Keep source ownership through the handbook's parent-capture routing. */
export class HandbookInputGuard {
  private readonly owners = new Map<number, string>();
  private readonly releases: Array<() => void> = [];
  constructor(
    parent: Node,
    callbacks: Record<Phase, (event: EventTouch) => void>,
    cancel: () => void,
    covers: (point: { x: number; y: number }) => boolean,
  ) {
    const types = {
      start: Node.EventType.TOUCH_START,
      move: Node.EventType.TOUCH_MOVE,
      end: Node.EventType.TOUCH_END,
      cancel: Node.EventType.TOUCH_CANCEL,
    };
    for (const phase of Object.keys(types) as Phase[]) {
      const listener = (event: EventTouch) => {
        const id = event.getID() ?? 0;
        const owner = inputOwner(event);
        if (
          hasInputConflict(input) ||
          (phase !== 'start' &&
            phase !== 'cancel' &&
            this.owners.has(id) &&
            this.owners.get(id) !== owner)
        ) {
          cancel();
          if (phase === 'start' && covers(event.getLocation())) event.propagationStopped = true;
          return;
        }
        if (phase === 'start') this.owners.set(id, owner);
        callbacks[phase](event);
        if (phase === 'end' || phase === 'cancel') this.owners.delete(id);
      };
      parent.on(types[phase], listener, this, true);
      this.releases.push(() => parent.off(types[phase], listener, this, true));
    }
  }
  clear(): void {
    this.owners.clear();
  }
  dispose(): void {
    this.clear();
    this.releases.forEach((release) => release());
  }
}
