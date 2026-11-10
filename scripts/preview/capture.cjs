/** Run only where browser graphics are available. Never accept a blank screenshot. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { verifyPackage, inventory } = require('./provenance.cjs');
const { verifyFixtures } = require('./acceptance-fixtures.cjs');
const { withDeadline } = require('./acceptance-deadline.cjs');
const { capturePlan } = require('./capture-plan.cjs');
const selection = capturePlan(process.argv.slice(2));
const engine = path.resolve(process.env.COCOS_ENGINE || 'temp/cocos-engine');
const out = path.resolve(process.env.PREVIEW_OUT || 'build/preview');
const tools = path.resolve(process.env.PREVIEW_TOOLS || engine);
const { chromium } = require(path.join(tools, 'node_modules/playwright'));
const { PNG } = require(path.join(tools, 'node_modules/pngjs'));
const sourceRoot = path.resolve(__dirname, '../..');
const evidence = path.resolve(
  process.env.PREVIEW_EVIDENCE || path.join(sourceRoot, 'build/screenshots'),
);
let evidenceStarted = false;
const failures = [];
let verifiedFiles;
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
};
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/favicon.ico') {
    res.writeHead(204).end();
    return;
  }
  const file = path.resolve(out, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(out + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  // Serve the exact bytes verified at preflight, never a later filesystem replacement.
  const data = verifiedFiles.get(path.relative(out, file).split(path.sep).join('/'));
  if (!data) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  res.end(data);
});
async function capture(browser, width, height, device, suite = 'checkpoint') {
  const name = `${device}-${suite}`;
  const touch = device === 'mobile';
  const trace = require('./phase-trace.cjs')(evidence, `${name}-capture`);
  let setupExpired = false;
  const context = await withDeadline(
    async () => {
      const created = await browser.newContext({ viewport: { width, height }, hasTouch: touch });
      if (setupExpired) void created.close().catch((error) => console.error(error));
      return created;
    },
    15000,
    `${suite} ${device} context setup`,
    () => {
      setupExpired = true;
    },
  );
  let page;
  try {
    page = await withDeadline(
      () => context.newPage(),
      15000,
      `${suite} ${device} page setup`,
      () => context.close(),
    );
  } catch (error) {
    await withDeadline(() => context.close(), 5000, `${suite} ${device} setup cleanup`).catch(
      (cleanupError) => console.error(cleanupError),
    );
    throw error;
  }
  const errors = [];
  const browserWarnings = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error(error.stack);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      // Official 3.8.8 TouchInputSource calls preventDefault even for a non-cancelable
      // touchcancel. Keep Chromium's intervention in evidence; cancellation state is tested.
      if (
        message.text() ===
        'Ignored attempt to cancel a touchcancel event with cancelable=false, for example because scrolling is in progress and cannot be interrupted.'
      ) {
        browserWarnings.push(message.text());
        return;
      }
      errors.push(message.text());
      console.error(message.text());
    }
  });
  try {
    await withDeadline(
      async () => {
        await trace('initial navigation', () =>
          page.goto(`http://127.0.0.1:${server.address().port}/`),
        );
        await trace('initial engine ready', () =>
          page.waitForFunction(() => window.__townPreview?.ready === true, undefined, {
            timeout: 45000,
          }),
        );
        const pixels = PNG.sync.read(
          await trace('canvas screenshot', () => page.locator('#GameCanvas').screenshot()),
        );
        const colors = new Set();
        for (let i = 0; i < pixels.data.length; i += 16)
          colors.add(pixels.data.subarray(i, i + 3).toString('hex'));
        assert.ok(
          colors.size > 30,
          `Canvas looks blank: only ${colors.size} distinct sampled colors`,
        );
        assert.deepEqual(errors, [], 'Runtime console errors');
        await trace('initial page screenshot', () =>
          page.screenshot({ path: path.join(evidence, `${name}.png`) }),
        );
        const scenario = await trace(`${suite} interactions`, () =>
          require('./scenario-runner.cjs').runScenario(suite, page, evidence, name, touch),
        );
        assert.deepEqual(errors, [], 'Runtime errors after real interactions');
        fs.writeFileSync(
          path.join(evidence, `${name}.json`),
          JSON.stringify({
            width,
            height,
            colors: colors.size,
            errors,
            browserWarnings,
            suite,
            scenario,
          }),
        );
      },
      suite === 'v6' ? 300000 : 360000,
      `${suite} ${device}`,
      () => context.close(),
    );
  } catch (error) {
    await page
      .screenshot({ path: path.join(evidence, `${name}-FAILED.png`), timeout: 5000 })
      .catch((captureError) =>
        console.error(`${name} failure screenshot unavailable:`, captureError),
      );
    fs.writeFileSync(
      path.join(evidence, `${name}-errors.json`),
      JSON.stringify(
        { error: String(error), suite, width, height, errors, browserWarnings },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await withDeadline(() => context.close(), 5000, `${suite} ${device} context cleanup`).catch(
      (error) => console.error(error),
    );
  }
}
async function main() {
  if (fs.existsSync(evidence) && fs.readdirSync(evidence).length)
    throw new Error('PREVIEW_EVIDENCE must be empty; never mix acceptance runs');
  fs.mkdirSync(evidence, { recursive: true });
  evidenceStarted = true;
  fs.writeFileSync(
    path.join(evidence, 'suite-results.json'),
    JSON.stringify({ status: 'running', selection, failures }),
  );
  const checked = verifyPackage(sourceRoot, out, process.env.PREVIEW_PROVENANCE_SHA256);
  const fixtures = verifyFixtures(sourceRoot);
  // Load every suite and late checkpoint helper before the long browser run.
  for (const name of [
    'v6-interactions',
    'title-interactions',
    'demo-interactions',
    'settings-interactions',
    'checkpoint-interactions',
    'route-checkpoint',
    'compost-checkpoint',
  ])
    require(`./${name}.cjs`);
  require('./scenario-runner.cjs');
  assert.deepEqual(
    inventory(path.join(sourceRoot, '.domain-build')),
    fixtures.manifest,
    'Acceptance fixtures changed during module loading',
  );
  verifyPackage(sourceRoot, out, checked.provenanceSha256);
  fs.writeFileSync(
    path.join(evidence, 'acceptance-fixtures.json'),
    JSON.stringify(fixtures, null, 2),
  );
  verifiedFiles = checked.files;
  fs.writeFileSync(
    path.join(evidence, 'source-provenance.json'),
    checked.files.get('provenance.json'),
  );
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  let browser;
  try {
    browser = await chromium.launch({
      chromiumSandbox: true,
      ...(process.env.CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
        : {}),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
    });
    // Fresh contexts isolate independent scenarios; all checkpoint rounds remain sequential.
    for (const { suite, device, width, height } of selection) {
      try {
        await capture(browser, width, height, device, suite);
      } catch (error) {
        failures.push({ suite, device, error: String(error) });
        console.error(`${suite} ${device} acceptance failed:`, error);
      }
    }
    verifyPackage(sourceRoot, out, checked.provenanceSha256);
    assert.deepEqual(
      inventory(path.join(sourceRoot, '.domain-build')),
      fixtures.manifest,
      'Acceptance fixtures changed during capture',
    );
    assert.deepEqual(failures, [], 'All selected actual browser acceptance suites must pass');
    fs.writeFileSync(
      path.join(evidence, 'suite-results.json'),
      JSON.stringify(
        { status: 'passed', selection, provenanceSha256: checked.provenanceSha256, failures },
        null,
        2,
      ),
    );
  } finally {
    await withDeadline(() => browser?.close(), 5000, 'browser cleanup').catch((error) =>
      console.error(error),
    );
    server.close();
  }
}
main().catch((error) => {
  if (evidenceStarted)
    fs.writeFileSync(
      path.join(evidence, 'suite-results.json'),
      JSON.stringify({ status: 'failed', selection, error: String(error), failures }, null, 2),
    );
  console.error(error);
  process.exitCode = 1;
});
