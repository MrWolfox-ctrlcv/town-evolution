/** Serialized read-only sampler. No draw interception, state mutation, or graphics toggles. */
async function sampleCameras(count) {
  const cc = await System.import('cc');
  const root = cc.director.root;
  if (root.usesCustomPipeline || !Array.isArray(root.pipeline.commandBuffers))
    return { status: 'unsupported', reason: 'Classic command-buffer pipeline required' };
  const events = root.pipelineEvent;
  const samples = [],
    pending = new Map();
  let frame = 0,
    timer,
    after;
  const counters = () =>
    root.pipeline.commandBuffers.map((buffer) => ({
      buffer,
      values: [buffer.numDrawCalls, buffer.numTris, buffer.numInstances],
    }));
  const begin = (camera) => pending.set(camera, { at: performance.now(), counters: counters() });
  const end = (camera) => {
    const start = pending.get(camera),
      finish = counters();
    pending.delete(camera);
    const valid =
      start &&
      finish.length > 0 &&
      finish.length === start.counters.length &&
      finish.every(
        (v, i) =>
          v.buffer === start.counters[i].buffer &&
          v.values.every(
            (n, j) =>
              Number.isFinite(n) &&
              Number.isFinite(start.counters[i].values[j]) &&
              n >= start.counters[i].values[j],
          ),
      );
    samples.push({
      frame,
      name: String(camera.name ?? camera.node?.name ?? 'unknown'),
      visibility: camera.visibility,
      status: valid ? 'collected' : 'unavailable',
      delta: valid
        ? finish.reduce(
            (sum, v, i) => sum.map((n, j) => n + v.values[j] - start.counters[i].values[j]),
            [0, 0, 0],
          )
        : null,
      cpuWallMs: start ? performance.now() - start.at : null,
    });
  };
  let status = 'collected';
  try {
    await new Promise((resolve) => {
      after = () => {
        frame++;
        if (frame >= count) resolve();
      };
      events.on('render-camera-begin', begin);
      events.on('render-camera-end', end);
      cc.director.on(cc.Director.EVENT_AFTER_DRAW, after);
      timer = setTimeout(() => {
        status = 'partial-timeout';
        resolve();
      }, 25000);
    });
  } finally {
    clearTimeout(timer);
    events.off('render-camera-begin', begin);
    events.off('render-camera-end', end);
    cc.director.off(cc.Director.EVENT_AFTER_DRAW, after);
  }
  if (!samples.length) status = 'unavailable';
  else if (pending.size || samples.some((s) => s.status !== 'collected')) status = 'partial';
  return {
    status,
    frames: frame,
    samples,
    unmatchedBeginCount: pending.size,
    deltaFields: ['drawCalls', 'triangles', 'instances'],
    note: 'Per-camera submissions, not GPU time. Clear operations are not counted.',
  };
}
module.exports = { sampleCameras };
