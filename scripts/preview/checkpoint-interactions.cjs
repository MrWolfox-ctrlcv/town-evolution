/** Real pointer regression against an unmodified Cocos demo; inspection is read-only. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { inspect, until, ready, worldPoint, driver } = require('./ui-driver.cjs');
const { drag, pinch } = require('./pointer-input.cjs');
const stockDrop = require('./stock-input.cjs');

async function ui(page) {
  return page.evaluate(async () => {
    const cc = await System.import('cc');
    const scene = cc.director.getScene();
    const cameras = scene.getComponentsInChildren(cc.Camera);
    const camera = cameras.find((c) => c.node.name === 'UICamera');
    const world = cameras.find((c) => c.node.name === 'WorldCamera');
    const canvas = document.querySelector('#GameCanvas');
    const rect = canvas.getBoundingClientRect();
    const nodes = {};
    for (const transform of scene.getComponentsInChildren(cc.UITransform)) {
      const node = transform.node;
      if (!node.activeInHierarchy) continue;
      const p = camera.worldToScreen(node.worldPosition);
      nodes[node.name] = {
        x: rect.left + (p.x * rect.width) / canvas.width,
        y: rect.top + ((canvas.height - p.y) * rect.height) / canvas.height,
        width: (transform.width * node.worldScale.x * rect.width) / canvas.width,
        height: (transform.height * node.worldScale.y * rect.height) / canvas.height,
        scale: node.scale.x,
      };
    }
    return {
      nodes,
      allNames: scene.getComponentsInChildren(cc.UITransform).map((t) => t.node.name),
      handbookLabels: scene
        .getComponentsInChildren(cc.Label)
        .filter((label) => {
          if (!label.enabled || !label.node.activeInHierarchy) return false;
          for (let node = label.node; node; node = node.parent)
            if (node.name === 'RecipeDirectory' || node.name === 'RecipeHandbook') return true;
          return false;
        })
        .map((label) => label.string),
      navigationSkins: scene
        .getComponentsInChildren(cc.Sprite)
        .filter(
          (s) =>
            s.node.name === 'HandbookSkin' &&
            s.node.activeInHierarchy &&
            s.spriteFrame?.texture?.width === 1254,
        )
        .map((s) => s.node.parent.name),
      camera: {
        x: world.node.position.x,
        y: world.node.position.y,
        z: world.node.position.z,
        height: world.orthoHeight,
      },
      atlasSprites: scene
        .getComponentsInChildren(cc.Sprite)
        .filter(
          (s) =>
            s.node.name === 'HandbookSkin' &&
            s.node.activeInHierarchy &&
            s.spriteFrame?.texture?.width === 1254,
        ).length,
    };
  });
}

module.exports = async (page, evidence, name, touch) => {
  const { click, button } = driver(page, touch);
  const nodeClick = async (nodeName) => {
    const node = (await ui(page)).nodes[nodeName];
    assert.ok(node, `Visible ${nodeName}`);
    await click(node);
  };
  const showTool = async (toolName, pager) => {
    for (let i = 0; i < 8; i++) {
      if ((await inspect(page)).tools.some((tool) => tool.name === toolName)) return;
      await nodeClick(pager);
    }
    assert.fail(`Could not page to ${toolName}`);
  };
  const dragTool = async (toolName, target) => {
    await showTool(toolName, 'ToolsLeftNext');
    const from = (await inspect(page)).tools.find((tool) => tool.name === toolName);
    await drag(page, from, target, touch);
  };
  assert.equal((await inspect(page)).profile, 'demo');
  await button('工具');
  await button('保存进度');
  let state = await until(page, (s) => s.save?.schemaVersion === 8, 'saved demo');
  assert.equal(state.save.buildings.find((b) => b.id === 'b7')?.kind, 'warehouse');
  await showTool('WoodStock', 'ProductsRightNext');
  for (let i = 0; i < 3; i++) {
    await stockDrop(page, 'WoodStock', 'b7', touch);
    await until(page, (s) => s.save.fusion.attachments.b7?.wood === i + 1, `attach wood ${i + 1}`);
  }
  await stockDrop(page, 'WoodStock', 'b7', touch, 'cancel');
  assert.equal((await inspect(page)).save.fusion.attachments.b7.wood, 3);
  await page.screenshot({ path: path.join(evidence, `${name}-checkpoint-materials.png`) });
  state = await inspect(page);
  await dragTool(
    'hammerTool',
    state.buildings.find((b) => b.id === 'b7'),
  );
  state = await until(
    page,
    (s) => s.save.buildings.find((b) => b.id === 'b7')?.kind === 'expandedWarehouse',
    'hammer upgrade',
  );
  assert.ok(state.save.fusion.discoveries['expand-warehouse']);
  assert.equal(state.save.fusion.attachments.b7.wood, 1);
  await page.reload();
  await ready(page);
  state = await until(
    page,
    (s) => s.save?.fusion.discoveries['expand-warehouse'],
    'upgrade persisted',
  );
  assert.equal(state.save.fusion.attachments.b7.wood, 1);
  await click(state.buildings.find((b) => b.id === 'b7'));
  await button('取回木材');
  await until(page, (s) => !s.save.fusion.attachments.b7, 'remaining wood retrieved');

  state = await inspect(page);
  const viewport = page.viewportSize();
  let treeTarget;
  for (const tree of state.save.trees) {
    const point = await worldPoint(page, { x: tree.x + 0.5, z: tree.z + 0.5, y: 0.8 });
    if (
      point.x > 85 &&
      point.x < viewport.width - 85 &&
      point.y > 90 &&
      point.y < viewport.height - 220
    ) {
      treeTarget = point;
      break;
    }
  }
  assert.ok(treeTarget, 'Visible tree in map area');
  await dragTool('axeTool', treeTarget);
  state = await until(page, (s) => s.save.fusion.discoveries['gather-wood'], 'axe discovery');
  await page.screenshot({ path: path.join(evidence, `${name}-checkpoint-chop.png`) });
  const pile = state.save.groundStacks.find((p) => p.item === 'wood' && p.amount === 3);
  assert.ok(pile, 'Demo three-wood pile');
  const pilePoint = await worldPoint(page, { x: pile.x + 0.5, z: pile.z + 0.5, y: 0.2 });
  await dragTool('sawTool', pilePoint);
  await until(page, (s) => s.save.fusion.discoveries['build-warehouse'], 'saw discovery');

  await nodeClick('RecipeBookOpen');
  state = await inspect(page);
  assert.ok(state.labels.some((v) => v.text.includes('3 / 4')));
  await page.screenshot({ path: path.join(evidence, `${name}-checkpoint-directory.png`) });
  let directory = await ui(page);
  assert.ok(
    directory.handbookLabels.every((text) => !/[\p{Script=Han}A-Za-z]/u.test(text)),
    'Directory contains only pictograms, operators and numbers',
  );
  assert.ok(directory.nodes['RecipeItem-wood'], 'Directory shows material artwork');
  assert.ok(directory.nodes['RecipeItem-saw'], 'Directory shows required tool');
  assert.ok(directory.nodes['RecipeItem-expandedWarehouse'], 'Directory shows upgrade result');
  assert.ok(!directory.nodes['RecipeItem-cooler'], 'Unknown recipe artwork remains hidden');
  assert.ok(
    state.labels.some((v) => v.text === '×3'),
    'Actual wood quantity is visible',
  );
  assert.ok(
    state.labels.some((v) => v.text === '='),
    'Directory uses pictorial equations',
  );
  for (const id of ['gather-wood', 'build-warehouse', 'expand-warehouse', 'merge-cold'])
    assert.ok(directory.nodes[`RecipeCategory-${id}`], `Single-screen directory includes ${id}`);
  for (const obsolete of [
    'RecipeDirectoryPrevious',
    'RecipeDirectoryNext',
    'RecipeZoomIn',
    'RecipeZoomOut',
  ])
    assert.ok(!directory.allNames.includes(obsolete), `${obsolete} is removed`);
  const folder = directory.nodes.RecipeDirectory;
  const margin = { x: folder.x - folder.width * 0.46, y: folder.y };
  await drag(page, margin, { x: margin.x - 35, y: margin.y - 35 }, touch);
  let moved = await ui(page);
  assert.deepEqual(moved.camera, directory.camera, 'Directory drag leaves map camera still');
  assert.ok(
    Math.hypot(moved.nodes.RecipeDirectory.x - folder.x, moved.nodes.RecipeDirectory.y - folder.y) >
      2,
    'Directory really moves',
  );
  const sheet = moved.nodes.RecipeDirectory;
  const zoomPoint = { x: sheet.x, y: sheet.y - sheet.height * 0.43 };
  if (touch) await pinch(page, zoomPoint, 30, 22);
  else {
    await page.mouse.move(zoomPoint.x, zoomPoint.y);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(100);
  }
  directory = await ui(page);
  assert.deepEqual(directory.camera, moved.camera, 'Directory zoom leaves map camera still');
  assert.notEqual(
    directory.nodes.RecipeDirectory.scale,
    sheet.scale,
    'Directory supports pointer zoom',
  );
  const pose = (node) => ({ x: node.x, y: node.y, scale: node.scale });
  const directoryPose = pose(directory.nodes.RecipeDirectory);
  await nodeClick('RecipeCategory-merge-cold');
  state = await inspect(page);
  assert.ok((await ui(page)).nodes.RecipeUnknown, 'Unknown detail shows lock');
  assert.ok(!(await ui(page)).nodes['RecipeItem-coldWarehouse'], 'Unknown result stays hidden');
  assert.ok(
    !state.labels.some((v) => v.text.includes('冷藏融合')),
    'Unknown detail does not reveal title',
  );
  assert.deepEqual(
    pose((await ui(page)).nodes.RecipeHandbook),
    directoryPose,
    'Fourth entry preserves directory position and zoom',
  );
  await nodeClick('RecipeBookBack');
  assert.deepEqual(
    pose((await ui(page)).nodes.RecipeDirectory),
    directoryPose,
    'Returning preserves shared position and zoom',
  );
  await nodeClick('RecipeCategory-gather-wood');
  state = await inspect(page);
  assert.ok((await ui(page)).nodes['RecipeItem-tree'], 'Discovered ingredient is illustrated');
  assert.ok((await ui(page)).nodes['RecipeItem-axe'], 'Discovered tool is illustrated');
  assert.ok((await ui(page)).nodes['RecipeItem-wood'], 'Discovered result is illustrated');
  assert.deepEqual(
    pose((await ui(page)).nodes.RecipeHandbook),
    directoryPose,
    'Discovered entry preserves shared position and zoom',
  );
  let paper;
  for (let i = 0; i < 50; i++) {
    paper = await ui(page);
    if (
      ['RecipeBookBack', 'RecipeBookClose', 'RecipePrevious', 'RecipeNext'].every((id) =>
        paper.navigationSkins.includes(id),
      )
    )
      break;
    await page.waitForTimeout(100);
  }
  assert.ok(paper.atlasSprites > 0, 'Discovered recipe shows atlas sprite');
  assert.ok(
    paper.handbookLabels.every((text) => !/[\p{Script=Han}A-Za-z]/u.test(text)),
    'Detail contains only pictograms, operators and numbers',
  );
  for (const id of ['RecipeBookBack', 'RecipeBookClose', 'RecipePrevious', 'RecipeNext'])
    assert.ok(paper.navigationSkins.includes(id), `${id} has HandbookSkin navigation texture 1254`);
  await page.screenshot({ path: path.join(evidence, `${name}-checkpoint-recipe.png`) });
  await nodeClick('RecipeNext');
  assert.ok((await ui(page)).nodes['RecipeItem-saw'], 'Next page shows construction tool');
  assert.ok((await inspect(page)).labels.some((label) => label.text === '×3'));
  await page.screenshot({ path: path.join(evidence, `${name}-checkpoint-build-recipe.png`) });
  await nodeClick('RecipeNext');
  assert.ok((await ui(page)).nodes['RecipeItem-hammer'], 'Upgrade shows required tool');
  assert.ok(
    (await ui(page)).nodes['RecipeItem-expandedWarehouse'],
    'Upgrade shows distinct result',
  );
  await page.screenshot({ path: path.join(evidence, `${name}-checkpoint-upgrade-recipe.png`) });
  await nodeClick('RecipePrevious');
  await nodeClick('RecipePrevious');
  const before = await ui(page);
  const paperMargin = {
    x: before.nodes.RecipeHandbook.x - before.nodes.RecipeHandbook.width * 0.46,
    y: before.nodes.RecipeHandbook.y,
  };
  await drag(page, paperMargin, { x: paperMargin.x - 25, y: paperMargin.y - 25 }, touch);
  const afterPaperDrag = await ui(page);
  assert.deepEqual(afterPaperDrag.camera, before.camera, 'Paper drag leaves map camera still');
  await nodeClick('RecipeBookBack');
  assert.deepEqual(
    pose((await ui(page)).nodes.RecipeDirectory),
    pose(afterPaperDrag.nodes.RecipeHandbook),
    'Paper drag updates shared directory position',
  );
  assert.ok(
    (await ui(page)).navigationSkins.includes('RecipeDirectoryClose'),
    'Directory close uses navigation sprite',
  );
  await nodeClick('RecipeCategory-gather-wood');
  await nodeClick('RecipeBookClose');
  for (let i = 0; i < 3; i++) {
    await nodeClick('RecipeBookOpen');
    await nodeClick('RecipeDirectoryClose');
  }
  return {
    attachment: true,
    cancellation: true,
    hammer: true,
    persistence: true,
    retrieval: true,
    axe: true,
    saw: true,
    handbook: true,
  };
};
