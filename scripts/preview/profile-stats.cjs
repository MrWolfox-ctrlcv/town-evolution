/** Pure summaries. CDP samples measure sampled CPU time, never GPU time. */
function quantiles(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = (p) => (sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null);
  return { count: sorted.length, p50: at(0.5), p95: at(0.95), max: at(1) };
}
function summarizeCPU(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const totals = new Map();
  let totalUs = 0;
  for (let i = 0; i < (profile.samples?.length ?? 0); i++) {
    const duration = profile.timeDeltas?.[i];
    if (!Number.isFinite(duration) || duration < 0) continue;
    const frame = nodes.get(profile.samples[i])?.callFrame;
    if (!frame) continue;
    const key = JSON.stringify([
      frame.functionName,
      frame.url,
      frame.lineNumber,
      frame.columnNumber,
    ]);
    const row = totals.get(key) ?? {
      functionName: frame.functionName,
      url: frame.url,
      lineNumber: frame.lineNumber,
      columnNumber: frame.columnNumber,
      selfUs: 0,
      samples: 0,
    };
    row.selfUs += duration;
    row.samples++;
    totals.set(key, row);
    totalUs += duration;
  }
  return {
    unit: 'sampled CPU microseconds (includes idle/program samples; not GPU time)',
    totalUs,
    top: [...totals.values()].sort((a, b) => b.selfUs - a.selfUs).slice(0, 20),
  };
}
function profileDevice(args) {
  if (args.length > 1) throw Error('Usage: profile.cjs [--device=desktop|mobile]');
  const value = (args[0] || 'desktop').replace(/^--device=/, '');
  if (!['desktop', 'mobile'].includes(value)) throw Error('Invalid profile device');
  return value;
}
module.exports = { quantiles, summarizeCPU, profileDevice };
