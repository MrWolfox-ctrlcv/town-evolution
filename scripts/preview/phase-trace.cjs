/** Node-side timestamps survive a blocked renderer or the outer acceptance deadline. */
const fs = require('node:fs');
const path = require('node:path');
module.exports = function phaseTrace(evidence, name) {
  const started = Date.now();
  const events = [];
  let nextId = 0;
  const record = (event) => {
    events.push({ ...event, elapsedMs: Date.now() - started });
    fs.writeFileSync(path.join(evidence, `${name}-phases.json`), JSON.stringify(events, null, 2));
  };
  return async (phase, run) => {
    const id = ++nextId,
      entered = Date.now();
    record({ id, phase, status: 'entered' });
    try {
      const result = await run();
      record({ id, phase, status: 'completed', durationMs: Date.now() - entered });
      return result;
    } catch (error) {
      record({
        id,
        phase,
        status: 'failed',
        durationMs: Date.now() - entered,
        error: String(error),
      });
      throw error;
    }
  };
};
