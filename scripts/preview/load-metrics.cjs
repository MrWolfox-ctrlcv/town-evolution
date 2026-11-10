/** Read-only browser timing evidence. Zero transfers are not proof of cache hits. */
const fs = require('node:fs');
const sessions = new WeakMap();
function readPerformance() {
  const p = performance;
  const clean = (value) => {
    try {
      const url = new URL(value);
      return `${url.protocol}//${url.host}${url.pathname}`;
    } catch {
      return '[non-URL resource]';
    }
  };
  const number = (value) => (Number.isFinite(value) ? value : null);
  const fields = (entry, keys) => Object.fromEntries(keys.map((key) => [key, number(entry[key])]));
  const resources = p.getEntriesByType('resource');
  const navigation = p.getEntriesByType('navigation')[0];
  const names = new Map();
  for (const entry of resources) {
    const name = clean(entry.name),
      row = names.get(name) ?? { url: name, count: 0, transferBytes: 0 };
    row.count++;
    row.transferBytes += entry.transferSize || 0;
    names.set(name, row);
  }
  const total = (key) => resources.reduce((n, e) => n + (e[key] || 0), 0);
  return {
    timeOrigin: p.timeOrigin,
    elapsedMs: p.now(),
    frames: window.__townPreview?.frames ?? null,
    ready: window.__townPreview?.ready ?? null,
    document: clean(location.href),
    navigation: navigation
      ? {
          type: navigation.type,
          ...fields(navigation, [
            'startTime',
            'duration',
            'requestStart',
            'responseStart',
            'responseEnd',
            'domInteractive',
            'domContentLoadedEventEnd',
            'loadEventEnd',
            'transferSize',
            'encodedBodySize',
            'decodedBodySize',
          ]),
        }
      : null,
    resources: {
      count: resources.length,
      transferBytes: total('transferSize'),
      encodedBytes: total('encodedBodySize'),
      decodedBytes: total('decodedBodySize'),
      zeroTransferWithBodyCount: resources.filter(
        (e) => e.transferSize === 0 && e.decodedBodySize > 0,
      ).length,
      latestResponseEndMs: resources.reduce((n, e) => Math.max(n, e.responseEnd || 0), 0),
      // Browser timing buffers can omit older entries; this does not change their capacity.
      mayBeTruncated: resources.length >= 250,
      duplicateUrls: [...names.values()]
        .filter((e) => e.count > 1)
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      slowest: [...resources]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 15)
        .map((e) => ({
          url: clean(e.name),
          initiatorType: e.initiatorType,
          ...fields(e, [
            'startTime',
            'duration',
            'requestStart',
            'responseStart',
            'responseEnd',
            'transferSize',
            'encodedBodySize',
            'decodedBodySize',
          ]),
        })),
    },
    heap: p.memory
      ? fields(p.memory, ['usedJSHeapSize', 'totalJSHeapSize', 'jsHeapSizeLimit'])
      : null,
  };
}
function start(page, file, provenance) {
  const data = {
    provenance: {
      buildMode: provenance.buildMode,
      debug: provenance.debug,
      compressed: provenance.compressed,
      sourceCommit: provenance.sourceCommit,
      provenanceSha256: provenance.provenanceSha256,
    },
    notes: [
      'Resource sizes are Resource Timing bytes, not GPU memory or decoded texture memory.',
      'Zero transfer can mean cache reuse or timing visibility limits; it does not prove a cache hit.',
      'Snapshots overlap within a timeOrigin. Do not sum them; a new timeOrigin identifies reload.',
      'Elapsed time after responses includes scripting, initialization, rendering and scheduling; it is not a CPU profile.',
      'Query strings, fragments and URL userinfo are omitted; duplicate counts group sanitized URLs.',
    ],
    snapshots: [],
  };
  sessions.set(page, { file, data });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
async function collect(page, phase) {
  const session = sessions.get(page);
  if (!session) return;
  const row = { phase, recordedAt: Date.now(), status: 'entered' };
  session.data.snapshots.push(row);
  const save = () => fs.writeFileSync(session.file, JSON.stringify(session.data, null, 2));
  save();
  let timer;
  try {
    // Diagnostics may not extend a stuck renderer's existing acceptance deadline.
    const metrics = await Promise.race([
      page.evaluate(readPerformance),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('metrics unavailable')), 1500);
      }),
    ]);
    Object.assign(row, { status: 'collected', metrics });
  } catch {
    row.status = 'unavailable';
  } finally {
    clearTimeout(timer);
    row.collectionMs = Date.now() - row.recordedAt;
    save();
  }
}
module.exports = { start, collect, readPerformance };
