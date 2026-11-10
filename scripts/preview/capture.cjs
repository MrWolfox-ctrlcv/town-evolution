/** Run only where browser graphics are available. Never accept a blank screenshot. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { verifyPackage, inventory } = require('./provenance.cjs');
const { verifyFixtures } = require('./acceptance-fixtures.cjs');
const { withDeadline } = require('./acceptance-deadline.cjs');
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
async function capture(browser, width, height, device, suite = 'legacy') {
  const name = suite === 'v6' ? `${device}-v6` : device;
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
        if (suite === 'v6') {
          const v6 = await require('./v6-interactions.cjs')(page, evidence, name, touch);
          assert.deepEqual(errors, [], 'Runtime errors after actual v6 interactions');
          fs.writeFileSync(
            path.join(evidence, `${name}.json`),
            JSON.stringify(
              { width, height, colors: colors.size, errors, browserWarnings, v6 },
              null,
              2,
            ),
          );
          return;
        }
        await trace('title interactions', () =>
          require('./title-interactions.cjs')(page, evidence, name, touch),
        );
        await trace('demo interactions', () =>
          require('./demo-interactions.cjs')(page, evidence, name, touch),
        );
        await trace('settings interactions', () =>
          require('./settings-interactions.cjs')(page, evidence, name, touch),
        );
        const checkpoint = [];
        for (let cycle = 0; cycle < 3; cycle++) {
          if (cycle) {
            const { button, townActions } = require('./ui-driver.cjs').driver(page, touch);
            await townActions();
            await button('存档');
            await button('重置演示岛');
            await button('确认');
          }
          checkpoint.push(
            await require('./checkpoint-interactions.cjs')(
              page,
              evidence,
              `${name}-round${cycle + 1}`,
              touch,
            ),
          );
        }
        assert.deepEqual(errors, [], 'Runtime errors after real interactions');
        fs.writeFileSync(
          path.join(evidence, `${name}.json`),
          JSON.stringify({
            width,
            height,
            colors: colors.size,
            errors,
            browserWarnings,
            checkpoint,
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
    JSON.stringify({ status: 'running', failures }),
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
    // Each suite gets fresh storage. A legacy failure must not prevent new v6 evidence,
    // and a v6 failure must not silently remove any existing acceptance assertions.
    for (const suite of ['v6', 'legacy']) {
      for (const [width, height, name] of [
        [1280, 800, 'desktop'],
        [390, 844, 'mobile'],
      ]) {
        try {
          await capture(browser, width, height, name, suite);
        } catch (error) {
          failures.push({ suite, device: name, error: String(error) });
          console.error(`${suite} ${name} acceptance failed:`, error);
        }
      }
    }
    verifyPackage(sourceRoot, out, checked.provenanceSha256);
    assert.deepEqual(
      inventory(path.join(sourceRoot, '.domain-build')),
      fixtures.manifest,
      'Acceptance fixtures changed during capture',
    );
    assert.deepEqual(failures, [], 'All actual browser acceptance suites must pass');
    fs.writeFileSync(
      path.join(evidence, 'suite-results.json'),
      JSON.stringify(
        { status: 'passed', provenanceSha256: checked.provenanceSha256, failures },
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
      JSON.stringify({ status: 'failed', error: String(error), failures }, null, 2),
    );
  console.error(error);
  process.exitCode = 1;
});
