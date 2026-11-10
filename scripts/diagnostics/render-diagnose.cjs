/** Independent real-renderer diagnosis; never a gameplay acceptance result. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(process.env.DIAG_SOURCE_ROOT);
const old = (name) => require(path.join(root, 'scripts/preview', name));
const { verifyPackage, inventory } = old('provenance.cjs');
const { verifyFixtures } = old('acceptance-fixtures.cjs');
const { withDeadline } = old('acceptance-deadline.cjs');
const { sampleCameras } = require('./cameras.cjs');
const { captureTrace } = require('./trace.cjs');
const { readScene, entered, homeReady, pollScene } = old('profile-scene.cjs');
const { profileDevice } = old('profile-stats.cjs');
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
  notes: [
    'Independent SwiftShader diagnostic, not functional acceptance or physical-device FPS.',
    'Browser trace visibility is category/platform dependent; absent events do not prove idle.',
  ],
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
  write('diagnostic-tool-provenance.json', {
    diagnosticCommit: process.env.DIAG_TOOL_COMMIT ?? null,
    expectedArtifactSourceCommit: process.env.EXPECTED_SHA ?? null,
    artifactRunId: process.env.DIAG_ARTIFACT_RUN ?? null,
    files: Object.fromEntries(
      ['render-diagnose.cjs', 'cameras.cjs', 'trace.cjs'].map((name) => [
        name,
        crypto
          .createHash('sha256')
          .update(fs.readFileSync(path.join(__dirname, name)))
          .digest('hex'),
      ]),
    ),
  });
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
  const { driver, ready } = old('ui-driver.cjs');
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
  const waitScene = (predicate, milliseconds) =>
    pollScene(
      () => page.evaluate(readScene),
      predicate,
      milliseconds,
      (scene) => {
        result.lastScene = scene;
        write('profile-result.json', result);
      },
    );
  stage('enter actual v6 using player menu');
  await ui.button('自然挖填实验', { exact: true });
  stage('await actual game, hidden menu and published first overview');
  await waitScene(entered, 90000);
  await ui.named('TerrainView:回家');
  stage('await local home surface, not whole island');
  await waitScene(homeReady, 45000);
  await page.screenshot({ path: path.join(evidence, 'before.png'), timeout: 10000 });
  write('before-scene.json', await page.evaluate(readScene));
  stage('30 frames per-camera public counters');
  const cameras = await page.evaluate(sampleCameras, 30);
  write('camera-samples.json', cameras);
  write('after-counters-scene.json', await page.evaluate(readScene));
  stage('five seconds browser-level trace');
  const trace = await captureTrace(browser, path.join(evidence, 'browser-trace.json'));
  write('trace-result.json', trace);
  write('after-trace-scene.json', await page.evaluate(readScene));
  await page.screenshot({ path: path.join(evidence, 'after.png'), timeout: 10000 });
  result.cameraStatus = cameras.status;
  result.traceStatus = trace.status;
  verifyPackage(root, out, checked.provenanceSha256);
  assert.deepEqual(inventory(path.join(root, '.domain-build')), fixtures.manifest);
  result.status = result.errors.length
    ? 'collected-with-runtime-errors'
    : cameras.status === 'collected' && trace.status === 'collected'
      ? 'collected'
      : 'partial';
  result.notes = [
    'SwiftShader software-renderer results are not physical-device FPS.',
    'Browser trace visibility is category/platform dependent; absent events do not prove idle. Streaming may continue; surface status is recorded.',
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
