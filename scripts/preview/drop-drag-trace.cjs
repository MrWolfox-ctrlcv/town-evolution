/** Only observes an existing real drag. No game commands, input retries or state writes. */
const fs = require('node:fs');
module.exports = (page, file, ids) => {
  const started = Date.now(),
    events = [];
  return async (phase, point) => {
    const detail = await page.evaluate(
      async ({ point, ids }) => {
        const cc = await System.import('cc');
        const scene = cc.director.getScene();
        const control = scene.getChildByName('Town')?.getComponent('TownBootstrap')?.controller;
        const map = control?.map,
          gesture = map?.gesture,
          drag = control?.drag?.drops;
        const canvas = document.querySelector('#GameCanvas'),
          rect = canvas.getBoundingClientRect();
        const camera = map?.camera;
        const ray = camera?.screenPointToRay(
          ((point.x - rect.left) * canvas.width) / rect.width,
          ((rect.bottom - point.y) * canvas.height) / rect.height,
        );
        const hit = ray ? control.town.visibleHit(ray) : null;
        return {
          point,
          cameraHeight: camera?.orthoHeight,
          gesture: {
            mode: gesture?.mode,
            candidate: gesture?.candidate,
            contacts: gesture?.pointers?.size,
            heldMs: Date.now() - (gesture?.startedAt ?? Date.now()),
          },
          drag: {
            source: drag?.source,
            invalid: drag?.invalid,
            ghostActive: drag?.ghost?.activeInHierarchy,
            targets: drag?.targets ? [...drag.targets.entries()] : [],
          },
          hit,
          message: control?.session?.message,
          sessionMode: control?.session?.mode,
          drops: control?.session?.state.looseDrops.filter((d) => ids.includes(d.id)),
        };
      },
      { point, ids },
    );
    events.push({ phase, elapsedMs: Date.now() - started, ...detail });
    fs.writeFileSync(file, JSON.stringify(events, null, 2));
  };
};
