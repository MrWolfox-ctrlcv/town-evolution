/** Read-only inspection and real browser input shared by runtime tests. */
const assert = require('node:assert/strict');
async function inspect(page) {
  return page.evaluate(async () => {
    const cc = await System.import('cc');
    const scene = cc.director.getScene();
    const cameras = scene.getComponentsInChildren(cc.Camera);
    const ui = cameras.find((camera) => camera.node.name === 'UICamera');
    const world = cameras.find((camera) => camera.node.name === 'WorldCamera');
    const canvas = document.querySelector('#GameCanvas');
    const rect = canvas.getBoundingClientRect();
    const project = (camera, position) => {
      const point = camera.worldToScreen(position);
      return {
        x: rect.left + (point.x * rect.width) / canvas.width,
        y: rect.top + ((canvas.height - point.y) * rect.height) / canvas.height,
      };
    };
    const labels = scene
      .getComponentsInChildren(cc.Label)
      .filter((label) => label.node.activeInHierarchy)
      .map((label) => ({
        text: label.string,
        action: label.node.parent.name === 'Action',
        ...project(ui, label.node.worldPosition),
      }));
    const town = scene.getChildByName('Town').getChildByName('TownWorld');
    const farm = town.children.find((node) => node.getChildByName('Soil'));
    const position = farm?.getChildByName('Soil')?.worldPosition;
    return {
      labels,
      buildings: town.children
        .filter((node) => /^b\d+$/.test(node.name))
        .map((node) => ({
          id: node.name,
          ...project(
            world,
            new cc.Vec3(node.worldPosition.x, node.worldPosition.y + 0.4, node.worldPosition.z),
          ),
        })),
      farm: position ? project(world, position) : null,
      save: JSON.parse(localStorage.getItem('town-evolution.save.v1') || 'null'),
    };
  });
}
async function until(page, predicate, message, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await inspect(page);
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`UI verification timed out: ${message}; ${JSON.stringify(await inspect(page))}`);
}
async function ready(page) {
  await page.waitForFunction(() => window.__townPreview?.ready === true, undefined, {
    timeout: 45000,
  });
}
async function worldPoint(page, point) {
  return page.evaluate(async (point) => {
    const cc = await System.import('cc');
    const camera = cc.director
      .getScene()
      .getComponentsInChildren(cc.Camera)
      .find((c) => c.node.name === 'WorldCamera');
    const projected = camera.worldToScreen(new cc.Vec3(point.x, point.y || 0, point.z));
    const canvas = document.querySelector('#GameCanvas');
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (projected.x * rect.width) / canvas.width,
      y: rect.top + ((canvas.height - projected.y) * rect.height) / canvas.height,
    };
  }, point);
}
function driver(page, touch) {
  const click = async (point) => {
    assert.ok(
      point && Number.isFinite(point.x) && Number.isFinite(point.y),
      'Rendered target exists',
    );
    if (touch) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  };
  const button = async (text) => {
    const state = await until(
      page,
      (state) => state.labels.some((label) => label.action && label.text.includes(text)),
      text,
    );
    const targets = state.labels.filter((label) => label.action && label.text.includes(text));
    assert.equal(targets.length, 1, `Unique rendered button: ${text}`);
    await click(targets[0]);
  };
  return { click, button };
}
module.exports = { inspect, until, ready, worldPoint, driver };
