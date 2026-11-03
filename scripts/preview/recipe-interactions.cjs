/** Read-only Cocos inspection plus actual browser input. No game-state injection. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { drag, pinch } = require('./pointer-input.cjs');
async function inspect(page) {
  return page.evaluate(async () => {
    const cc = await System.import('cc');
    const scene = cc.director.getScene();
    const camera = scene.getComponentsInChildren(cc.Camera).find((c) => c.node.name === 'UICamera');
    const world = scene
      .getComponentsInChildren(cc.Camera)
      .find((c) => c.node.name === 'WorldCamera');
    const canvas = document.querySelector('#GameCanvas');
    const rect = canvas.getBoundingClientRect();
    const names = [
      'RecipeBookOpen',
      'RecipeDirectory',
      'RecipeDirectoryClose',
      'RecipeCategory-gather',
      'RecipeCategory-build',
      'RecipeCategory-missing',
      'RecipeHandbook',
      'RecipeBookBack',
      'RecipeBookClose',
      'RecipeZoomOut',
      'RecipeZoomIn',
    ];
    const nodes = {};
    for (const ui of scene.getComponentsInChildren(cc.UITransform)) {
      const node = ui.node;
      if (!names.includes(node.name) || !node.activeInHierarchy) continue;
      const p = camera.worldToScreen(node.worldPosition);
      nodes[node.name] = {
        x: rect.left + (p.x * rect.width) / canvas.width,
        y: rect.top + ((canvas.height - p.y) * rect.height) / canvas.height,
        scale: node.worldScale.x,
        width: ui.width * node.worldScale.x,
        height: ui.height * node.worldScale.y,
      };
    }
    return {
      nodes,
      labels: scene
        .getComponentsInChildren(cc.Label)
        .filter((v) => v.node.activeInHierarchy)
        .map((v) => v.string),
      camera: {
        height: world.orthoHeight,
        x: world.node.position.x,
        y: world.node.position.y,
        z: world.node.position.z,
      },
    };
  });
}
module.exports = async (page, evidence, name, touch) => {
  const click = async (name) => {
    const node = (await inspect(page)).nodes[name];
    assert.ok(node, `Visible ${name}`);
    if (touch) await page.touchscreen.tap(node.x, node.y);
    else await page.mouse.click(node.x, node.y);
    await page.waitForTimeout(100);
  };
  let state = await inspect(page);
  assert.ok(state.nodes.RecipeBookOpen);
  assert.ok(!state.nodes.RecipeHandbook && !state.nodes.RecipeDirectory);
  await click('RecipeBookOpen');
  assert.ok((await inspect(page)).nodes.RecipeDirectory);
  await page.screenshot({ path: path.join(evidence, `${name}-recipe-directory.png`) });
  await click('RecipeCategory-gather');
  state = await inspect(page);
  assert.ok(state.labels.some((s) => s.includes('林间采集')));
  assert.ok(!state.nodes.RecipeDirectory);
  const beforeCamera = state.camera;
  const paper = state.nodes.RecipeHandbook;
  await drag(page, paper, { x: paper.x - 45, y: paper.y - 55 }, touch);
  state = await inspect(page);
  assert.ok(Math.abs(state.nodes.RecipeHandbook.y - paper.y) > 10, 'Paper follows drag');
  assert.deepEqual(state.camera, beforeCamera, 'Paper drag never pans map');
  const scaleBefore = state.nodes.RecipeHandbook.scale;
  if (touch) await pinch(page, state.nodes.RecipeHandbook, 18, 27);
  else {
    await page.mouse.move(state.nodes.RecipeHandbook.x, state.nodes.RecipeHandbook.y);
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(100);
  }
  state = await inspect(page);
  assert.notEqual(state.nodes.RecipeHandbook.scale, scaleBefore, 'Paper responds to pinch/wheel');
  assert.deepEqual(state.camera, beforeCamera, 'Paper zoom never zooms map');
  await click('RecipeZoomOut');
  await click('RecipeZoomIn');
  await page.screenshot({ path: path.join(evidence, `${name}-recipe-paper.png`) });
  await click('RecipeBookBack');
  await click('RecipeCategory-build');
  assert.ok((await inspect(page)).labels.some((s) => s.includes('木材 ×3')));
  await click('RecipeBookBack');
  await click('RecipeCategory-missing');
  assert.ok((await inspect(page)).labels.some((s) => s.includes('没有已确认的配方')));
  await click('RecipeBookClose');
  for (let i = 0; i < 3; i++) {
    await click('RecipeBookOpen');
    await click('RecipeDirectoryClose');
  }
  assert.ok(!(await inspect(page)).nodes.RecipeHandbook);
  return {
    folder: true,
    directory: true,
    recipes: true,
    drag: true,
    zoom: true,
    mapIsolation: true,
    repeatedClose: true,
  };
};

/** Explicit high-DPI browser regression; run only in a supported browser executor. */
module.exports.runDpr2 = async (browser, url, evidence) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => window.__townPreview?.ready === true, undefined, {
      timeout: 45000,
    });
    assert.equal(await page.evaluate(() => window.devicePixelRatio), 2);
    return await module.exports(page, evidence, 'mobile-dpr2', true);
  } finally {
    await context.close();
  }
};
