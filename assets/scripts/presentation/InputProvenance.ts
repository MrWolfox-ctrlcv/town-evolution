import type { EventTouch } from 'cc';

interface TouchEventSource {
  getTouches(): Array<{ getID(): number }>;
}
interface MouseEventSource {
  getButton(): number;
}
interface Emitter {
  emit(type: string, ...args: unknown[]): unknown;
}
interface EngineInput {
  _touchInput?: { _eventTarget?: Emitter };
  _mouseInput?: { _eventTarget?: Emitter };
  getAllTouches?(): Array<{ getID(): number }>;
}
interface Binding {
  refs: number;
  fingers: Set<number>;
  buttons: Set<number>;
  release: Array<() => void>;
  sources: number;
}
const bindings = new WeakMap<object, Binding>();
const realTouches = new WeakSet<object>();
let mouseOwner: string | null = null;
const touchCodes = new Set(['touch-start', 'touch-move', 'touch-end', 'touch-cancel']);

/** Cocos 3.8.8 web/native/minigame touch sources all synchronously emit here.
 * Mouse simulation bypasses this source. EventTouch.simulate and numeric IDs
 * do not identify a device. A missing/changed engine adapter stays exact. */
export function bindInputProvenance(engine: object): () => void {
  const existing = bindings.get(engine);
  if (existing) {
    existing.refs++;
    return releaseBinding(engine, existing);
  }
  const binding: Binding = {
    refs: 1,
    fingers: new Set(),
    buttons: new Set(),
    release: [],
    sources: 0,
  };
  bindings.set(engine, binding);
  const input = engine as EngineInput;
  const wrap = (target: Emitter | undefined, touch: boolean) => {
    if (!target || typeof target.emit !== 'function') return;
    const original = target.emit;
    let active = true;
    const wrapped = function (this: Emitter, type: string, ...args: unknown[]) {
      const event = args[0];
      const object = typeof event === 'object' && event !== null ? event : null;
      const real = active && touch && touchCodes.has(type) && object;
      const previous = real ? realTouches.has(real) : false;
      if (active && object) {
        if (touch && typeof (object as TouchEventSource).getTouches === 'function') {
          for (const contact of (object as TouchEventSource).getTouches()) {
            const id = contact.getID();
            if (!Number.isInteger(id)) continue;
            if (type === 'touch-start') binding.fingers.add(id);
            if (type === 'touch-end' || type === 'touch-cancel') binding.fingers.delete(id);
          }
        } else if (!touch && typeof (object as MouseEventSource).getButton === 'function') {
          const button = (object as MouseEventSource).getButton();
          if (Number.isInteger(button) && button >= 0) {
            if (type === 'mouse-down') binding.buttons.add(button);
            if (type === 'mouse-up') binding.buttons.delete(button);
          }
        }
      }
      const previousMouse = mouseOwner;
      if (active && !touch && object)
        mouseOwner = `mouse:${(object as MouseEventSource).getButton?.() ?? 'unknown'}`;
      if (real) realTouches.add(real);
      try {
        return original.call(this, type, ...args);
      } finally {
        if (real && !previous) realTouches.delete(real);
        mouseOwner = previousMouse;
      }
    };
    try {
      target.emit = wrapped;
      if (target.emit !== wrapped) return;
    } catch {
      return;
    }
    binding.sources++;
    binding.release.push(() => {
      active = false;
      // Do not overwrite another consumer's later wrapper.
      if (target.emit === wrapped) {
        try {
          target.emit = original;
        } catch {
          // A now-frozen emitter can retain an inert pass-through wrapper.
        }
      }
    });
  };
  wrap(input._touchInput?._eventTarget, true);
  wrap(input._mouseInput?._eventTarget, false);
  return releaseBinding(engine, binding);
}
function releaseBinding(engine: object, binding: Binding): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--binding.refs) return;
    binding.release.forEach((release) => release());
    binding.fingers.clear();
    binding.buttons.clear();
    bindings.delete(engine);
  };
}
export function clearInputProvenance(engine: object, scope: 'all' | 'mouse' = 'all'): void {
  const binding = bindings.get(engine);
  if (scope === 'all') binding?.fingers.clear();
  binding?.buttons.clear();
}
/** Ownership is copied at START; device IDs and simulate are never device evidence. */
export function inputOwner(event: EventTouch): string {
  return realTouches.has(event) ? 'touch' : (mouseOwner ?? 'unknown');
}
export function isTouchEvent(event: EventTouch): boolean {
  return realTouches.has(event);
}
/** Cocos retains manager touches across hide/blur. Only post-reset observed fingers
 * belong to a new gesture; keep simultaneous source batches intact. */
export function liveInputTouches(
  event: EventTouch,
  engine?: object,
): ReturnType<EventTouch['getAllTouches']> {
  const binding = engine && bindings.get(engine);
  const touches = event.getAllTouches();
  return binding && isTouchEvent(event)
    ? touches.filter((touch) => binding.fingers.has(touch.getID()))
    : touches;
}
/** Source counts also detect a finger and mouse sharing Cocos's numeric ID 0. */
export function hasMultipleContacts(event: EventTouch, engine?: object): boolean {
  const binding = engine && bindings.get(engine);
  if (binding) {
    const count = binding.fingers.size + binding.buttons.size;
    if (count > 1) return true;
    // Our observed sources survive ID collisions and ignore contacts cleared on hide/blur.
    if (binding.sources === 2 && inputOwner(event) !== 'unknown') return false;
  }
  const ids = (engine as EngineInput | undefined)?.getAllTouches?.().map((t) => t.getID());
  if (
    ids?.includes(event.getID() ?? 0) &&
    ids.every(Number.isInteger) &&
    new Set(ids).size === ids.length
  )
    return ids.length > 1;
  return event.getAllTouches().length > 1;
}

/** Two real fingers may pinch; mixed devices and multiple mouse buttons may not. */
export function hasInputConflict(engine?: object): boolean {
  const binding = engine && bindings.get(engine);
  return (
    !!binding &&
    (binding.buttons.size > 1 || (binding.buttons.size > 0 && binding.fingers.size > 0))
  );
}
