import { game, sys, view } from 'cc';

type Area = { x: number; y: number; width: number; height: number };

function valid(area: Area): boolean {
  return (
    [area.x, area.y, area.width, area.height].every(Number.isFinite) &&
    area.width >= 0 &&
    area.height >= 0
  );
}

function intersect(a: Area, b: Area): Area {
  // Clamp the empty intersection's origin too, so it stays within a.
  const x = Math.min(a.x + a.width, Math.max(a.x, b.x));
  const y = Math.min(a.y + a.height, Math.max(a.y, b.y));
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
}

function webSafeArea(): Area | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  const canvas = game.canvas;
  const root = document.documentElement;
  if (!canvas || !root) return null;
  const bounds = canvas.getBoundingClientRect();
  const layoutWidth = root.clientWidth;
  const layoutHeight = root.clientHeight;
  if (
    ![bounds.left, bounds.top, bounds.width, bounds.height, layoutWidth, layoutHeight].every(
      Number.isFinite,
    ) ||
    Math.min(bounds.width, bounds.height, layoutWidth, layoutHeight) <= 0
  )
    return null;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);';
  let edges: number[];
  try {
    root.appendChild(probe);
    const css = window.getComputedStyle(probe);
    edges = [css.paddingLeft, css.paddingTop, css.paddingRight, css.paddingBottom].map((value) =>
      Number.parseFloat(value),
    );
  } finally {
    probe.remove();
  }
  if (!edges.every((edge) => Number.isFinite(edge) && edge >= 0)) return null;
  const [left, top, right, bottom] = edges;
  let safe: Area = {
    x: Math.min(left, layoutWidth),
    y: Math.min(top, layoutHeight),
    // Finite insets may consume the whole viewport; that is empty, not invalid.
    width: Math.max(0, layoutWidth - left - right),
    height: Math.max(0, layoutHeight - top - bottom),
  };
  if (!valid(safe)) return null;
  const visual = window.visualViewport;
  if (visual) {
    const visible = {
      x: visual.offsetLeft,
      y: visual.offsetTop,
      width: visual.width,
      height: visual.height,
    };
    if (!valid(visible)) return null;
    safe = intersect(safe, visible);
  }
  safe = intersect(
    { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height },
    safe,
  );
  const viewport = view.getViewportRect();
  const sx = view.getScaleX();
  const sy = view.getScaleY();
  if (!valid(viewport) || ![sx, sy].every((scale) => Number.isFinite(scale) && scale > 0))
    return null;
  // The official public conversion owns capped DPR and forced frame rotation
  // using screen.windowSize.width. This is not identical to every input path:
  // web touch uses canvasRect.height when rotated, which can differ with extra
  // CSS scaling. Do not introduce another DPR division here.
  const points = [
    [safe.x, safe.y],
    [safe.x + safe.width, safe.y],
    [safe.x, safe.y + safe.height],
    [safe.x + safe.width, safe.y + safe.height],
  ].map(([x, y]) => {
    const point = view.convertToLocationInView(x, y, bounds);
    return { x: (point.x - viewport.x) / sx, y: (point.y - viewport.y) / sy };
  });
  const x = Math.min(...points.map((point) => point.x));
  const y = Math.min(...points.map((point) => point.y));
  return {
    x,
    y,
    width: Math.max(...points.map((point) => point.x)) - x,
    height: Math.max(...points.map((point) => point.y)) - y,
  };
}

/** Bottom-left logical canvas coordinates. Call after setDesignResolutionSize. */
export function safeViewport(width: number, height: number): Area {
  const full = {
    x: 0,
    y: 0,
    width: Number.isFinite(width) ? Math.max(0, width) : 0,
    height: Number.isFinite(height) ? Math.max(0, height) : 0,
  };
  try {
    // Native/minigame results are already UI units. Never combine these edges
    // with browser env insets or apply another DPR conversion.
    const safe = sys.isBrowser ? webSafeArea() : sys.getSafeAreaRect(false);
    return safe && valid(safe) ? intersect(full, safe) : full;
  } catch {
    return full;
  }
}

/** Browser viewport changes that do not necessarily resize the game canvas. */
export function bindSafeViewportChanges(changed: () => void): () => void {
  if (!sys.isBrowser || typeof window === 'undefined') return () => {};
  const win = window;
  const visual = win.visualViewport;
  let released = false;
  const notify = () => {
    if (!released) changed();
  };
  const events = ['resize', 'scroll', 'orientationchange'] as const;
  for (const event of events) win.addEventListener(event, notify, true);
  visual?.addEventListener('resize', notify);
  visual?.addEventListener('scroll', notify);
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(notify) : null;
  if (game.canvas) observer?.observe(game.canvas);
  return () => {
    released = true;
    for (const event of events) win.removeEventListener(event, notify, true);
    visual?.removeEventListener('resize', notify);
    visual?.removeEventListener('scroll', notify);
    observer?.disconnect();
  };
}
