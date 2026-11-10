/** Small Node-owned progress journal, surviving a renderer/context shutdown. */
const fs = require('node:fs');
const STATUS_KEYS = [
  'page',
  'profile',
  'frames',
  'surface',
  'homeReady',
  'focusReady',
  'problem',
  'camera',
  'awaitingOverview',
  'mode',
  'material',
  'selection',
  'operation',
  'overhead',
  'groundReady',
  'clear',
  'cell',
  'height',
  'point',
  'dropPoint',
];
function compactStatus(status) {
  const result = Object.fromEntries(
    STATUS_KEYS.filter((k) => k in status).map((k) => [k, status[k]]),
  );
  for (const key of ['warning', 'message', 'flowMessage'])
    if (typeof status[key] === 'string') result[key] = status[key].slice(0, 200);
  return result;
}
module.exports = function progressJournal(file, now = Date.now) {
  const started = now(),
    data = { startedAt: started, stages: [], activities: [] };
  let previousStage,
    lastWrite = -Infinity;
  const elapsed = () => now() - started;
  const persist = () => {
    data.updatedMs = elapsed();
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    lastWrite = now();
  };
  const begin = (kind, label, details) => {
    const activity = {
      kind,
      label,
      status: 'entered',
      startedMs: elapsed(),
      ...(details ? { details } : {}),
    };
    data.activities.push(activity);
    persist();
    return activity;
  };
  const end = (activity, error) => {
    activity.status = error ? 'failed' : 'completed';
    activity.durationMs = elapsed() - activity.startedMs;
    if (error) activity.error = String(error).slice(0, 1000);
    persist();
  };
  return {
    stage(label) {
      if (previousStage) previousStage.durationMs = elapsed() - previousStage.startedMs;
      previousStage = { label, startedMs: elapsed() };
      data.stages.push(previousStage);
      persist();
    },
    begin,
    sample(activity, status) {
      activity.samples = (activity.samples ?? 0) + 1;
      activity.lastSampleMs = elapsed();
      activity.last = compactStatus(status);
      // Overwrite a compact last observation, not the entire map or a per-frame log.
      if (now() - lastWrite >= 1000) persist();
    },
    end,
    async run(kind, label, work) {
      const activity = begin(kind, label);
      try {
        const result = await work();
        end(activity);
        return result;
      } catch (error) {
        end(activity, error);
        throw error;
      }
    },
  };
};
module.exports.compactStatus = compactStatus;
