/** Real Cocos pixels and pointer rotation, for environments that can launch sandboxed browsers. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const tools = process.env.PREVIEW_TOOLS;
const { chromium } = tools
  ? require(path.join(tools, 'node_modules/playwright'))
  : require('playwright');
const out = path.resolve('build/screenshots');
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    chromiumSandbox: true,
    ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1560, height: 780 } });
    const errors = [],
      textures = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (
        msg.type() === 'error' ||
        (msg.type() === 'warning' && /16370|Building wood texture/.test(msg.text()))
      )
        errors.push(msg.text());
    });
    page.on('response', (response) => {
      if (response.url().includes('buildings/warm-wood.png')) textures.push(response.status());
    });
    await page.goto(
      (process.env.PREVIEW_URL || 'http://127.0.0.1:4178/') + '?art-review=buildings',
    );
    await page.waitForFunction(() => window.__townPreview?.ready);
    await page.waitForFunction(async () => {
      const cc = await System.import('cc');
      const wood = cc.director
        .getScene()
        .getComponentsInChildren(cc.MeshRenderer)
        .filter((r) => r.node.name === 'GeneratedWoodMaterial');
      return (
        wood.length >= 2 &&
        wood.every((r) => r.getMaterial(0)?.getProperty('mainTexture')?.width > 1)
      );
    });
    const texturedPasses = await page.evaluate(async () => {
      const cc = await System.import('cc');
      return cc.director
        .getScene()
        .getComponentsInChildren(cc.MeshRenderer)
        .filter((r) => r.node.name === 'GeneratedWoodMaterial')
        .every((r) => r.getMaterial(0).passes.every((pass) => pass.defines.USE_TEXTURE === true));
    });
    assert.ok(texturedPasses, 'The rendered shared material actually enables USE_TEXTURE');
    assert.deepEqual(textures, [200], 'The actual shared PNG was loaded once');
    await page.screenshot({ path: path.join(out, 'building-inheritance-front.png') });
    const angles = () =>
      page.evaluate(async () => {
        const cc = await System.import('cc');
        return ['house', 'warehouse-base', 'shop'].map(
          (id) => cc.director.getScene().getChildByName(id).eulerAngles.y,
        );
      });
    const before = await angles();
    await page.mouse.move(580, 380);
    await page.mouse.down();
    await page.mouse.move(980, 380, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    const after = await angles();
    assert.ok(
      after.every((angle, i) => Math.abs(angle - before[i]) > 90),
      'Real pointer drag rotates all three 3D meshes',
    );
    await page.screenshot({ path: path.join(out, 'building-inheritance-back.png') });
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(out, 'building-inheritance.json'),
      JSON.stringify({ engine: 'Cocos 3.8.8', textures, before, after, errors }, null, 2),
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
