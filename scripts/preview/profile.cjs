/** Independent real-renderer diagnosis; never a gameplay acceptance result. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { verifyPackage, inventory } = require('./provenance.cjs');
const { verifyFixtures } = require('./acceptance-fixtures.cjs');
const { withDeadline } = require('./acceptance-deadline.cjs');
const { sampleFrames } = require('./profile-sample.cjs');
const { quantiles, summarizeCPU, profileDevice } = require('./profile-stats.cjs');
const root = path.resolve(__dirname, '../..');
const out = path.resolve(process.env.PREVIEW_OUT || 'build/preview');
const evidence = path.resolve(process.env.PREVIEW_EVIDENCE || 'build/profile');
const device = profileDevice(process.argv.slice(2));
const tools = path.resolve(
  process.env.PREVIEW_TOOLS || process.env.COCOS_ENGINE || 'temp/cocos-engine',
);
const write = (name, value) =>
  fs.writeFileSync(path.join(evidence, name), JSON.stringify(value, null, 2));
const result = {
  kind: 'independent performance diagnosis; not functional acceptance',
  device,
  status: 'running',
  stages: [],
  errors: [],
};
let browser,
  server,
  started = false;
function stage(name) {
  result.stages.push({ name, at: Date.now() });
  write('profile-result.json', result);
}
async function main() {
  assert.ok(
    !fs.existsSync(evidence) || !fs.readdirSync(evidence).length,
    'Evidence directory must be empty',
  );
  fs.mkdirSync(evidence, { recursive: true });
  started = true;
  const checked = verifyPackage(root, out, process.env.PREVIEW_PROVENANCE_SHA256);
  assert.equal(
    checked.provenance.buildMode,
    'release',
    'Only verified release packages may be profiled',
  );
  assert.equal(
    checked.provenance.sourceSnapshot,
    false,
    'Profiling requires a Git source checkout',
  );
  assert.equal(
    checked.provenance.sourceTrackedChanges,
    '',
    'Profiling requires Git-clean tracked source',
  );
  const fixtures = verifyFixtures(root);
  const { driver, ready } = require('./ui-driver.cjs');
  assert.deepEqual(inventory(path.join(root, '.domain-build')), fixtures.manifest);
  fs.writeFileSync(
    path.join(evidence, 'source-provenance.json'),
    checked.files.get('provenance.json'),
  );
  result.provenanceSha256 = checked.provenanceSha256;
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
  };
  server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (pathname === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    const file = path.resolve(out, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(out + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    const data = checked.files.get(path.relative(out, file).split(path.sep).join('/'));
    if (!data) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { chromium } = require(path.join(tools, 'node_modules/playwright'));
  stage('launch');
  browser = await chromium.launch({
    chromiumSandbox: true,
    timeout: 15000,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
  });
  const context = await browser.newContext({
    viewport: device === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    hasTouch: device === 'mobile',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => result.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
  await ready(page);
  const ui = driver(page, device === 'mobile');
  stage('enter v6 through real UI');
  await ui.button('自然挖填实验', { exact: true });
  await page.waitForFunction(
    async () => {
      const cc = await System.import('cc');
      const b = cc.director.getScene().getChildByName('Town')?.getComponent('TownBootstrap');
      return (
        b?.flow.page === 'game' &&
        b.flow.profile === 'v6-preview' &&
        b.controller?.town.surfaceStatus?.overviewVisible &&
        !b.controller.v6Navigation?.navigation.awaitingOverview
      );
    },
    undefined,
    { timeout: 90000 },
  );
  await ui.named('TerrainView:回家');
  stage('await local home surface, not whole island');
  await page.waitForFunction(
    async () => {
      const cc = await System.import('cc');
      const c = cc.director
        .getScene()
        .getChildByName('Town')
        .getComponent('TownBootstrap').controller;
      return c.map.focus.x === 6 && c.map.focus.z === 6 && c.town.isGroundReady(6, 6);
    },
    undefined,
    { timeout: 45000 },
  );
  stage('60 unprofiled engine frames');
  const frames = await page.evaluate(sampleFrames, 60);
  write('frame-samples.json', frames);
  result.frameIntervalsMs = quantiles(frames.samples.map((s) => s.intervalMs));
  result.drawCalls = quantiles(frames.samples.map((s) => s.drawCalls));
  result.triangles = quantiles(frames.samples.map((s) => s.triangles));
  stage('7 second CPU sampling, separate from frame timings');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  await new Promise((resolve) => setTimeout(resolve, 7000));
  const { profile } = await cdp.send('Profiler.stop');
  write('runtime.cpuprofile', profile);
  write('cpu-summary.json', summarizeCPU(profile));
  await cdp.detach();
  await page.screenshot({ path: path.join(evidence, 'fixed-home-view.png'), timeout: 10000 });
  verifyPackage(root, out, checked.provenanceSha256);
  assert.deepEqual(inventory(path.join(root, '.domain-build')), fixtures.manifest);
  result.status = result.errors.length ? 'collected-with-runtime-errors' : 'collected';
  result.notes = [
    'SwiftShader software-renderer results are not physical-device FPS.',
    'CPU samples are not GPU time. Streaming may continue; surface status is recorded.',
    'No visual quality, LOD, map size, save contents or functional acceptance budgets changed.',
  ];
}
withDeadline(main, 180000, 'independent performance diagnosis', () => browser?.close())
  .catch((error) => {
    result.status = 'incomplete';
    result.error = String(error);
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (started) write('profile-result.json', result);
    await withDeadline(() => browser?.close(), 5000, 'profile cleanup').catch(() => {});
    server?.closeAllConnections();
    server?.close();
  });
