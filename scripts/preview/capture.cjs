/** Run only where browser graphics are available. Never accept a blank screenshot. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const engine = path.resolve(process.env.COCOS_ENGINE || 'temp/cocos-engine');
const out = path.resolve(process.env.PREVIEW_OUT || 'build/preview');
const { chromium } = require(path.join(engine, 'node_modules/playwright'));
const { PNG } = require(path.join(engine, 'node_modules/pngjs'));
const evidence = path.resolve('build/screenshots');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
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
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error(error.stack);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
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
    fs.writeFileSync(
      path.join(evidence, `${name}.json`),
      JSON.stringify({ width, height, colors: colors.size, errors }),
    );
  } catch (error) {
    await page.screenshot({ path: path.join(evidence, `${name}-FAILED.png`) });
    fs.writeFileSync(
      path.join(evidence, `${name}-errors.json`),
      JSON.stringify({ error: String(error), errors }, null, 2),
    );
    throw error;
  } finally {
    await page.close();
  }
}
async function main() {
  fs.mkdirSync(evidence, { recursive: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      chromiumSandbox: true,
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
