type BrowserWindow = Pick<Window, 'addEventListener' | 'removeEventListener'>;
type BrowserInputRelease = (() => void) & { reset(): void };

function browserWindow(): BrowserWindow | null {
  return typeof window !== 'undefined' &&
    typeof window.addEventListener === 'function' &&
    typeof window.removeEventListener === 'function'
    ? window
    : null;
}

/** Cancel before Cocos turns a missed mouse release into another simulated touch move. */
export function bindBrowserInputGuard(
  cancel: (reason?: 'blur' | 'mouse') => void,
  target: BrowserWindow | null = browserWindow(),
): BrowserInputRelease {
  if (!target) return Object.assign(() => {}, { reset() {} });
  const mouseHeld = new Set<number>();
  const lostPress = (reason: 'blur' | 'mouse' = 'mouse') => {
    mouseHeld.clear();
    cancel(reason);
  };
  const blur = (event: FocusEvent) => {
    // Focusing the canvas also blurs other DOM elements; only window focus loss
    // invalidates the press. Otherwise canvas.focus() would erase our tracking.
    if (event.target === target) lostPress('blur');
  };
  const down = (event: MouseEvent) => {
    // A new press after a missed release must not inherit the old pointer ID.
    const button = event.button ?? 0;
    if (mouseHeld.has(button)) lostPress();
    mouseHeld.add(button);
  };
  const up = (event: MouseEvent) => {
    mouseHeld.delete(event.button ?? 0);
  };
  const move = (event: MouseEvent) => {
    // Cocos 3.8.8 simulates touch ID 0 for every mouse button, not only the left.
    if (
      Number.isInteger(event.buttons) &&
      [...mouseHeld].some((button) => {
        const mask = button === 1 ? 4 : button === 2 ? 2 : 1 << button;
        return !(event.buttons & mask);
      })
    )
      lostPress();
  };
  target.addEventListener('blur', blur, true);
  target.addEventListener('mousedown', down, true);
  target.addEventListener('mouseup', up, true);
  target.addEventListener('mousemove', move, true);
  return Object.assign(
    () => {
      mouseHeld.clear();
      target.removeEventListener('blur', blur, true);
      target.removeEventListener('mousedown', down, true);
      target.removeEventListener('mouseup', up, true);
      target.removeEventListener('mousemove', move, true);
    },
    { reset: () => mouseHeld.clear() },
  );
}
