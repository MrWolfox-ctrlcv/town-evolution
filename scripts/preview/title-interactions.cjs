/** Real Cocos/browser acceptance. Read-only inspection; all navigation uses pointer input. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { driver, ready, until } = require('./ui-driver.cjs');
async function titleState(page) {
  return page.evaluate(async () => {
    const cc = await System.import('cc');
    const scene = cc.director.getScene();
    const boot = scene.getChildByName('Town').getComponent('TownBootstrap');
    const backdrop = boot.menu.artwork;
    const nodes = (node) => [node, ...node.children.flatMap(nodes)];
    const active = nodes(scene).filter((node) => node.activeInHierarchy);
    const point = (value) => [value.x, value.y, value.z];
    const motions = (backdrop?.root.getComponentsInChildren(cc.Component) ?? []).filter(
      (component) => cc.js.getClassName(component) === 'CropMotion',
    );
    return {
      page: boot.flow.page,
      session: Boolean(boot.flow.session),
      titleWorlds: active.filter((node) => node.name === 'TitleDemoIsland').length,
      gameWorlds: active.filter((node) => node.name === 'TownSession').length,
      cameras: scene
        .getComponentsInChildren(cc.Camera)
        .filter((camera) => camera.node.activeInHierarchy)
        .map((camera) => camera.node.name),
      meshes: active.filter((node) => node.getComponent(cc.MeshRenderer)?.mesh).length,
      template: backdrop ? JSON.stringify(backdrop.town.previous) : null,
      frozen: backdrop ? Object.isFrozen(backdrop.town.previous) : false,
      camera: backdrop ? point(backdrop.camera.node.position) : null,
      wind: motions.flatMap((motion) => motion.crops.map((crop) => point(crop.node.eulerAngles))),
      growth: motions.flatMap((motion) => motion.crops.map((crop) => point(crop.node.scale))),
      saves: Object.fromEntries(
        Object.keys(localStorage)
          .sort()
          .map((key) => [key, localStorage.getItem(key)]),
      ),
      frames: window.__townPreview.frames,
      warning: boot.flow.storageWarning,
    };
  });
}
async function namedPoint(page, name) {
  return page.evaluate(async (name) => {
    const cc = await System.import('cc');
    const scene = cc.director.getScene();
    const nodes = (node) => [node, ...node.children.flatMap(nodes)];
    const target = nodes(scene).find((node) => node.name === name && node.activeInHierarchy);
    if (!target) return null;
    const camera = scene
      .getComponentsInChildren(cc.Camera)
      .find((camera) => camera.node.name === 'StartCamera' && camera.node.activeInHierarchy);
    const canvas = document.querySelector('#GameCanvas');
    const rect = canvas.getBoundingClientRect();
    const position = camera.worldToScreen(target.worldPosition);
    return {
      x: rect.left + (position.x / canvas.width) * rect.width,
      y: rect.top + (1 - position.y / canvas.height) * rect.height,
    };
  }, name);
}
module.exports = async function titleInteractions(page, evidence, name, touch) {
  const { button, click, townActions } = driver(page, touch);
  const before = await titleState(page);
  assert.equal(before.page, 'title');
  assert.equal(before.session, false);
  assert.equal(before.titleWorlds, 1);
  assert.equal(before.gameWorlds, 0);
  assert.equal(before.frozen, true);
  assert.ok(before.meshes > 20, 'Actual Cocos terrain and model meshes are visible');
  assert.deepEqual(before.cameras.sort(), ['StartCamera', 'TitleIslandCamera']);
  await page.waitForTimeout(1200);
  const after = await titleState(page);
  assert.ok(after.frames > before.frames, 'Real engine frames advance');
  assert.notDeepEqual(after.camera, before.camera, 'Real camera moves');
  assert.notDeepEqual(after.wind, before.wind, 'Real crops sway');
  assert.deepEqual(after.growth, before.growth, 'Background crop stages stay fixed');
  assert.equal(after.template, before.template);
  assert.deepEqual(after.saves, before.saves);
  assert.equal(after.meshes, before.meshes, 'No per-frame mesh rebuilding');
  await page.screenshot({ path: path.join(evidence, `${name}-live-title.png`) });
  await button('图鉴');
  await click(await namedPoint(page, 'RecipeDirectoryClose'));
  for (let repeat = 0; repeat < 2; repeat++) {
    await button('存档');
    await button('返回标题');
    await button('退出');
    await button('返回标题');
  }
  assert.deepEqual((await titleState(page)).saves, before.saves, 'Menus never write saves');
  // Another tab waits for Web Locks but renders the same independent title island.
  const waiting = await page.context().newPage();
  const waitingDiagnostics = [];
  const waitingStarted = Date.now();
  let waitingInitializationMs = null;
  const pendingRequests = new Map();
  waiting.on('request', (request) => pendingRequests.set(request, Date.now()));
  waiting.on('requestfinished', (request) => pendingRequests.delete(request));
  waiting.on('load', () => waitingDiagnostics.push({ event: 'load' }));
  waiting.on('console', (message) => {
    if (message.type() === 'error')
      waitingDiagnostics.push({ event: 'consoleerror', message: message.text() });
  });
  waiting.on('pageerror', (error) =>
    waitingDiagnostics.push({ event: 'pageerror', message: error.message }),
  );
  waiting.on('requestfailed', (request) =>
    waitingDiagnostics.push({
      event: 'requestfailed',
      url: request.url(),
      error: request.failure()?.errorText,
    }),
  );
  try {
    // Engine readiness below is the gate; the document load event is not.
    await waiting.goto(page.url(), { waitUntil: 'domcontentloaded' });
    waitingDiagnostics.push({ event: 'domcontentloaded', elapsedMs: Date.now() - waitingStarted });
    // CI software WebGL renders two independent islands here. Keep a bounded
    // startup budget while preserving the real-frame and behavioral gates.
    await ready(waiting, 120000);
    waitingInitializationMs = Date.now() - waitingStarted;
    console.log(`${name} waiting-tab real engine ready after ${waitingInitializationMs}ms`);
    const blocked = await titleState(waiting);
    assert.match(blocked.warning, /只读/);
    assert.equal(blocked.titleWorlds, 1);
    assert.ok(blocked.meshes > 20);
    await driver(waiting, touch).button('开始游戏');
    assert.equal((await titleState(waiting)).session, false);
    assert.deepEqual((await titleState(waiting)).saves, before.saves);
  } catch (error) {
    fs.writeFileSync(
      path.join(evidence, `${name}-waiting-errors.json`),
      JSON.stringify(
        {
          error: String(error),
          elapsedMs: Date.now() - waitingStarted,
          events: waitingDiagnostics,
          pendingRequests: [...pendingRequests].map(([request, started]) => ({
            url: request.url(),
            type: request.resourceType(),
            elapsedMs: Date.now() - started,
          })),
        },
        null,
        2,
      ),
    );
    await waiting
      .screenshot({ path: path.join(evidence, `${name}-waiting-FAILED.png`), timeout: 5000 })
      .catch((screenshotError) => console.error('Waiting-tab screenshot failed:', screenshotError));
    throw error;
  } finally {
    await waiting.close();
  }
  for (let repeat = 0; repeat < 2; repeat++) {
    await button(repeat ? '继续游戏' : '开始游戏');
    await until(page, (state) => state.profile === 'normal' && state.save !== null, 'normal game');
    // Profile persistence precedes the scheduled Cocos render and deferred node destruction.
    // Wait for the actual scene transition, then keep the ownership assertions below.
    await page.waitForFunction(
      async () => {
        const cc = await System.import('cc');
        const scene = cc.director.getScene();
        const boot = scene.getChildByName('Town').getComponent('TownBootstrap');
        const nodes = (node) => [node, ...node.children.flatMap(nodes)];
        const active = nodes(scene).filter((node) => node.activeInHierarchy);
        return (
          boot.flow.page === 'game' &&
          !boot.menu.root.activeInHierarchy &&
          boot.menu.artwork === null &&
          !active.some((node) => node.name === 'TitleDemoIsland') &&
          active.filter((node) => node.name === 'TownSession').length === 1
        );
      },
      undefined,
      { timeout: 10000 },
    );
    const playing = await titleState(page);
    assert.equal(playing.titleWorlds, 0);
    assert.equal(playing.gameWorlds, 1);
    assert.equal(playing.template, null, 'No hidden background retained during gameplay');
    await townActions();
    await button('退出到标题');
    await button('取消');
    assert.equal((await titleState(page)).page, 'game');
    await button('退出到标题');
    await button('确认');
    await until(page, (state) => state.labels.some((label) => label.text === '小镇进化'), 'title');
    const returned = await titleState(page);
    assert.equal(returned.titleWorlds, 1);
    assert.equal(returned.gameWorlds, 0);
    assert.equal(returned.template, before.template);
    await page.waitForTimeout(600);
    assert.deepEqual((await titleState(page)).saves, returned.saves, 'Title does not autosave');
  }
  fs.writeFileSync(
    path.join(evidence, `${name}-live-title.json`),
    JSON.stringify(
      {
        passed: true,
        input: touch ? 'touch' : 'mouse',
        waitingInitializationMs,
        checks: [
          'real mesh renderer, camera and live crop wind',
          'fixed immutable demo template and growth',
          'no storage writes while browsing title',
          'handbook open/close and repeated saves/exit/back',
          'Web Locks waiting tab renders without entering gameplay',
          'repeated normal start, exit cancellation, saved exit and fresh title',
          'one active island and camera set; background disposed during play',
        ],
      },
      null,
      2,
    ),
  );
};
