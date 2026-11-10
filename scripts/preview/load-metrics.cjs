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
  const safely = (read) => {
    try {
      return read() ?? null;
    } catch {
      return null;
    }
  };
  const text = (value) =>
    typeof value === 'string'
      ? value
          .replace(/https?:\/\/[^\s]+/g, clean)
          .replace(/[\u0000-\u001f\u007f]/g, '')
          .slice(0, 256)
      : null;
  // Resolve an already loaded module only. Never import/fetch or wait for frames.
  const cc = safely(() => window.cc) ?? safely(() => System.get(System.resolve('cc')));
  const device = safely(() => cc.director.root.device);
  const memory = safely(() => device.memoryStatus);
  const canvas = safely(() => document.querySelector('#GameCanvas'));
  const width = number(safely(() => canvas.width)),
    height = number(safely(() => canvas.height));
  const deviceSnapshot = {
    numDrawCalls: number(safely(() => device.numDrawCalls)),
    numTris: number(safely(() => device.numTris)),
    numInstances: number(safely(() => device.numInstances)),
    memoryStatus: memory ? fields(memory, ['bufferSize', 'textureSize']) : null,
    renderer: text(safely(() => device.renderer)),
    vendor: text(safely(() => device.vendor)),
    canvas: {
      width,
      height,
      pixels: width !== null && height !== null ? number(width * height) : null,
    },
    activeMeshRenderers: number(
      safely(() => {
        if (!cc?.MeshRenderer) return null;
        const scene = cc.director.getScene();
        if (!scene) return null;
        return scene
          .getComponentsInChildren(cc.MeshRenderer)
          .filter((r) =>
            typeof r.enabledInHierarchy === 'boolean'
              ? r.enabledInHierarchy
              : r.enabled && r.node?.activeInHierarchy,
          ).length;
      }),
    ),
  };
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
    device: deviceSnapshot,
    timeOrigin: number(p.timeOrigin),
    elapsedMs: number(p.now()),
    frames: number(window.__townPreview?.frames),
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
      'Device fields are a single read of Cocos currently recorded counters, not a frame average or CPU/GPU profile. Unavailable fields are null.',
      'activeMeshRenderers counts enabled scene components, not actual draw calls; device memoryStatus is Cocos allocated buffer/texture memory, not total process/GPU residency.',
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
