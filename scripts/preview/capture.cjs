/** Run only where browser graphics are available. Never accept a blank screenshot. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const engine = path.resolve(process.env.COCOS_ENGINE || 'temp/cocos-engine');
const out = path.resolve(process.env.PREVIEW_OUT || 'build/preview');
const tools = path.resolve(process.env.PREVIEW_TOOLS || engine);
const { chromium } = require(path.join(tools, 'node_modules/playwright'));
const { PNG } = require(path.join(tools, 'node_modules/pngjs'));
const evidence = path.resolve('build/screenshots');
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
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});
async function capture(browser, width, height, name) {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: name === 'mobile',
  });
  const page = await context.newPage();
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
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.__townPreview?.ready === true, undefined, {
      timeout: 45000,
    });
    const pixels = PNG.sync.read(await page.locator('#GameCanvas').screenshot());
    const colors = new Set();
    for (let i = 0; i < pixels.data.length; i += 16)
      colors.add(pixels.data.subarray(i, i + 3).toString('hex'));
    assert.ok(colors.size > 30, `Canvas looks blank: only ${colors.size} distinct sampled colors`);
    assert.deepEqual(errors, [], 'Runtime console errors');
    await page.screenshot({ path: path.join(evidence, `${name}.png`) });
    await require('./title-interactions.cjs')(page, evidence, name, name === 'mobile');
    await require('./demo-interactions.cjs')(page, evidence, name, name === 'mobile');
    await require('./settings-interactions.cjs')(page, evidence, name, name === 'mobile');
    const checkpoint = [];
    for (let cycle = 0; cycle < 3; cycle++) {
      if (cycle) {
        const { button, townActions } = require('./ui-driver.cjs').driver(page, name === 'mobile');
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
          name === 'mobile',
        ),
      );
    }
    assert.deepEqual(errors, [], 'Runtime errors after real interactions');
    fs.writeFileSync(
      path.join(evidence, `${name}.json`),
      JSON.stringify({ width, height, colors: colors.size, errors, browserWarnings, checkpoint }),
    );
  } catch (error) {
    await page.screenshot({ path: path.join(evidence, `${name}-FAILED.png`) });
    fs.writeFileSync(
      path.join(evidence, `${name}-errors.json`),
      JSON.stringify({ error: String(error), errors }, null, 2),
    );
    throw error;
  } finally {
    await context.close();
  }
}
async function main() {
  fs.mkdirSync(evidence, { recursive: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      chromiumSandbox: true,
      ...(process.env.CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
        : {}),
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
    });
    await capture(browser, 1280, 800, 'desktop');
    await capture(browser, 390, 844, 'mobile');
  } finally {
    await browser?.close();
    server.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
