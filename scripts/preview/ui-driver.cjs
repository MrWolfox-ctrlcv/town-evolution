/** Read-only inspection and real browser input shared by runtime tests. */
const assert = require('node:assert/strict');
const { V5_GENERATOR_REVISION } = require('../../.domain-build/domain/v5-world');
async function inspect(page) {
  return page.evaluate(async (v5Revision) => {
    const cc = await System.import('cc');
    const scene = cc.director.getScene();
    const cameras = scene
      .getComponentsInChildren(cc.Camera)
      .filter((camera) => camera.node.activeInHierarchy);
    const ui =
      cameras.find((camera) => camera.node.name === 'UICamera') ??
      cameras.find((camera) => camera.node.name === 'StartCamera');
    const world =
      cameras.find((camera) => camera.node.name === 'WorldCamera') ??
      cameras.find((camera) => camera.node.name === 'TitleIslandCamera');
    const canvas = document.querySelector('#GameCanvas');
    const rect = canvas.getBoundingClientRect();
    const project = (camera, position) => {
      const point = camera.worldToScreen(position);
      return {
        x: rect.left + (point.x * rect.width) / canvas.width,
        y: rect.top + ((canvas.height - point.y) * rect.height) / canvas.height,
      };
    };
    const isAction = (node) =>
      node.name === 'Action' ||
      node.name.startsWith('Menu-') ||
      node.name.startsWith('ObjectAction-');
    const labels = scene
      .getComponentsInChildren(cc.Label)
      .filter((label) => label.node.activeInHierarchy)
      .map((label) => ({
        text: label.string,
        action: isAction(label.node.parent),
        ...project(
          ui,
          isAction(label.node.parent) ? label.node.parent.worldPosition : label.node.worldPosition,
        ),
      }));
    const find = (node, name) =>
      node.name === name && node.activeInHierarchy
        ? node
        : node.children.map((child) => find(child, name)).find(Boolean);
    const town = find(scene, 'TownWorld');
    const farm = town?.children.find((node) => node.getChildByName('Soil'));
    const position = farm?.getChildByName('Soil')?.worldPosition;
    return {
      labels,
      targets: scene
        .getComponentsInChildren(cc.UITransform)
        .filter(
          (transform) =>
            transform.node.activeInHierarchy && transform.node.name.startsWith('Menu-'),
        )
        .map((transform) => ({
          name: transform.node.name,
          ...project(ui, transform.node.worldPosition),
        })),
      cropImages: scene
        .getComponentsInChildren(cc.Sprite)
        .filter(
          (sprite) =>
            sprite.node.name === 'CropImage' && sprite.node.activeInHierarchy && sprite.spriteFrame,
        ).length,
      cameraHeight: world?.orthoHeight ?? null,
      now: Date.now(),
      tools: scene
        .getComponentsInChildren(cc.UITransform)
        .filter(
          (component) =>
            [
              'HarvestTool',
              'wateringCanTool',
              'fertilizerTool',
              'hammerTool',
              'sawTool',
              'axeTool',
              'VegetableStock',
              'WheatStock',
              'LettuceStock',
              'RiceStock',
              'SaplingStock',
              'MilledRiceStock',
              'FlourStock',
              'BreadStock',
              'SoilStock',
              'MudStock',
              'TreeSeedStock',
              'diggingTool',
              'WoodStock',
              'StoneStock',
            ].includes(component.node.name) && component.node.activeInHierarchy,
        )
        .map((component) => ({
          name: component.node.name,
          ...project(ui, component.node.worldPosition),
        })),
      buildings: (town?.children ?? [])
        .filter((node) => /^b\d+$/.test(node.name))
        .map((node) => ({
          id: node.name,
          ...project(
            world,
            new cc.Vec3(node.worldPosition.x, node.worldPosition.y + 0.4, node.worldPosition.z),
          ),
        })),
      drops: (find(scene, 'LooseDrops')?.children ?? [])
        .filter((node) => node.activeInHierarchy && node.name.startsWith('Drop:'))
        .map((node) => ({
          id: node.name.slice(5),
          ...project(
            world,
            new cc.Vec3(node.worldPosition.x, node.worldPosition.y + 0.04, node.worldPosition.z),
          ),
        })),
      farm: position ? project(world, position) : null,
      profile: localStorage.getItem('town-evolution.active-profile') || 'demo',
      save: JSON.parse(
        localStorage.getItem(
          (() => {
            const profile = localStorage.getItem('town-evolution.active-profile');
            return (
              (profile === 'normal'
                ? ''
                : profile === 'v5-preview' || profile === 'v5-bridge-demo'
                  ? `town-evolution.${profile}.${v5Revision}.`
                  : 'town-evolution.demo.') + 'town-evolution.save.v1'
            );
          })(),
        ) || 'null',
      ),
    };
  }, V5_GENERATOR_REVISION);
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
      .find((c) => c.node.name === 'WorldCamera' && c.node.activeInHierarchy);
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
  const named = async (name) => {
    const state = await until(
      page,
      (view) => view.targets.some((target) => target.name === name),
      name,
    );
    await click(state.targets.find((target) => target.name === name));
  };
  const townActions = async () => {
    await named('Menu-settings');
    await button('小镇事务');
  };
  return { click, button, named, townActions };
}
async function useTool(page, name, touch, buildingId) {
  const state = await inspect(page);
  const tool = state.tools.find((tool) => tool.name === name);
  const target = buildingId
    ? state.buildings.find((building) => building.id === buildingId)
    : state.farm;
  assert.ok(tool && target, `Rendered ${name} and farm target exist`);
  await require('./pointer-input.cjs').drag(page, tool, target, touch);
}
module.exports = { inspect, until, ready, worldPoint, driver, useTool };
