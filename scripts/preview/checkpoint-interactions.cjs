/** Real pointer regression against an unmodified Cocos demo; inspection is read-only. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { inspect, until, ready, worldPoint, driver } = require('./ui-driver.cjs');
const { drag, pinch } = require('./pointer-input.cjs');
const { ACTIVE_RECIPE_DEFINITIONS } = require('../../.domain-build/domain/recipes.js');
const recipeIds = ACTIVE_RECIPE_DEFINITIONS.map((recipe) => recipe.id);
const recipeCount = recipeIds.length;
const stockDrop = require('./stock-input.cjs');

const ui = require('./checkpoint-ui.cjs');

module.exports = async (page, evidence, name, touch) => {
  const { click, button, townActions } = driver(page, touch);
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
  await townActions();
  await button('存档');
  await button('立即保存');
  await button('返回游戏');
  let state = await until(page, (s) => [10, 11].includes(s.save?.schemaVersion), 'saved demo');
  const warehouseId = state.save.buildings.find((b) => b.kind === 'warehouse')?.id;
  assert.ok(warehouseId, 'Original unexpanded warehouse remains available');
  await showTool('WoodStock', 'ProductsRightNext');
  for (let i = 0; i < 3; i++) {
    await stockDrop(page, 'WoodStock', warehouseId, touch);
    await until(
      page,
      (s) => s.save.fusion.attachments[warehouseId]?.wood === i + 1,
      `attach wood ${i + 1}`,
    );
  }
  await stockDrop(page, 'WoodStock', warehouseId, touch, 'cancel');
  assert.equal((await inspect(page)).save.fusion.attachments[warehouseId].wood, 3);
  await page.screenshot({ path: path.join(evidence, `${name}-checkpoint-materials.png`) });
  state = await inspect(page);
  await dragTool(
    'hammerTool',
    state.buildings.find((b) => b.id === warehouseId),
  );
  state = await until(
    page,
    (s) => s.save.buildings.find((b) => b.id === warehouseId)?.kind === 'expandedWarehouse',
    'hammer upgrade',
  );
  assert.ok(state.save.fusion.discoveries['expand-warehouse']);
  assert.equal(state.save.fusion.attachments[warehouseId].wood, 1);
  await page.reload();
  await ready(page);
  await button('游览演示岛');
  state = await until(
    page,
    (s) => s.save?.fusion.discoveries['expand-warehouse'],
    'upgrade persisted',
  );
  assert.equal(state.save.fusion.attachments[warehouseId].wood, 1);
  await click(state.buildings.find((b) => b.id === warehouseId));
  await button('取回木材');
  await until(page, (s) => !s.save.fusion.attachments[warehouseId], 'remaining wood retrieved');

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
  const pile = state.save.groundStacks.find((p) => p.item === 'wood' && p.amount === 4);
  assert.ok(pile, 'Demo four-wood pile');
  const pilePoint = await worldPoint(page, { x: pile.x + 0.5, z: pile.z + 0.5, y: 0.2 });
  await dragTool('hammerTool', pilePoint);
  await until(
    page,
    (s) => s.save.fusion.discoveries['build-house'],
    'hammer construction discovery',
  );

  await nodeClick('RecipeBookOpen');
  state = await inspect(page);
  assert.ok(state.labels.some((v) => v.text.includes(`3 / ${recipeCount}`)));
  await page.screenshot({ path: path.join(evidence, `${name}-checkpoint-directory.png`) });
  let directory = await ui(page);
  assert.ok(
    directory.handbookLabels.every((text) => !/[\p{Script=Han}A-Za-z]/u.test(text)),
    'Directory contains only pictograms, operators and numbers',
  );
  assert.ok(directory.nodes['RecipeItem-wood'], 'Directory shows material artwork');
  assert.ok(directory.nodes['RecipeItem-hammer'], 'Directory shows required tool');
  assert.ok(directory.nodes['RecipeItem-house'], 'Directory shows house result');
  assert.ok(directory.nodes['RecipeItem-treeSeed'], 'Directory shows the second axe output');
  assert.ok(!directory.nodes['RecipeItem-cooler'], 'Unknown recipe artwork remains hidden');
  assert.ok(
    state.labels.some((v) => v.text === '×4'),
    'Actual wood quantity is visible',
  );
  assert.ok(
    state.labels.some((v) => v.text === '='),
    'Directory uses pictorial equations',
  );
  for (const id of ['gather-wood', 'build-order-board', 'build-crate', 'build-house'])
    assert.ok(directory.nodes[`RecipeCategory-${id}`], `First directory page includes ${id}`);
  const pages = Math.ceil(recipeCount / 4);
  assert.equal(recipeCount, 36, 'Every approved schema10 handbook entry is present');
  for (let pageIndex = 1; pageIndex < pages; pageIndex++) {
    await nodeClick('RecipeDirectoryNext');
    directory = await ui(page);
    assert.deepEqual(
      Object.keys(directory.nodes).filter((id) => id.startsWith('RecipeCategory-')),
      recipeIds.slice(pageIndex * 4, pageIndex * 4 + 4).map((id) => `RecipeCategory-${id}`),
      `Directory page ${pageIndex + 1} has exactly the active entries, no omissions or blank rows`,
    );
    if (pageIndex === 1)
      assert.ok(directory.nodes['RecipeItem-expandedWarehouse'], 'Discovered upgrade is shown');
  }
  await nodeClick('RecipeDirectoryNext');
  assert.ok((await ui(page)).nodes['RecipeCategory-gather-wood'], 'Directory wraps to first page');
  await nodeClick('RecipeDirectoryPrevious');
  assert.ok(
    (await ui(page)).nodes[`RecipeCategory-${recipeIds.at(-1)}`],
    'Previous wraps to last page',
  );
  await nodeClick('RecipeDirectoryNext');
  await nodeClick('RecipeDirectoryNext');
  directory = await ui(page);
  for (const obsolete of ['RecipeZoomIn', 'RecipeZoomOut'])
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
  await nodeClick('RecipeCategory-dig-farm');
  state = await inspect(page);
  assert.ok((await ui(page)).nodes.RecipeUnknown, 'Unknown detail shows lock');
  assert.ok(!(await ui(page)).nodes['RecipeItem-farm'], 'Unknown result stays hidden');
  assert.ok(
    !state.labels.some((v) => v.text.includes('开垦田地')),
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
  await nodeClick('RecipeDirectoryPrevious');
  await nodeClick('RecipeCategory-gather-wood');
  state = await inspect(page);
  assert.ok((await ui(page)).nodes['RecipeItem-tree'], 'Discovered ingredient is illustrated');
  assert.ok((await ui(page)).nodes['RecipeItem-axe'], 'Discovered tool is illustrated');
  assert.ok((await ui(page)).nodes['RecipeItem-wood'], 'Discovered result is illustrated');
  assert.ok((await ui(page)).nodes['RecipeItem-treeSeed'], 'Second result is illustrated');
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
  await nodeClick('RecipePrevious');
  assert.ok(
    (await ui(page)).handbookLabels.includes(`${recipeCount} / ${recipeCount}`),
    'Detail wraps to last active page',
  );
  await nodeClick('RecipeNext');
  for (let index = 0; index < recipeCount; index++) {
    const detail = await ui(page);
    assert.ok(detail.handbookLabels.includes(`${index + 1} / ${recipeCount}`));
    assert.ok(!detail.nodes['RecipeItem-cooler'] && !detail.nodes['RecipeItem-coldWarehouse']);
    await nodeClick('RecipeNext');
  }
  assert.ok(
    (await ui(page)).handbookLabels.includes(`1 / ${recipeCount}`),
    'Detail wraps after every active entry',
  );
  assert.ok((await ui(page)).nodes['RecipeItem-tree'], 'Wrapped detail returns to first recipe');
  for (let i = 0; i < 3; i++) await nodeClick('RecipeNext');
  assert.ok((await ui(page)).nodes['RecipeItem-hammer'], 'Next page shows construction tool');
  assert.ok((await inspect(page)).labels.some((label) => label.text === '×4'));
  await page.screenshot({ path: path.join(evidence, `${name}-checkpoint-build-recipe.png`) });
  for (let i = 0; i < 3; i++) await nodeClick('RecipeNext');
  assert.ok((await ui(page)).nodes['RecipeItem-hammer'], 'Upgrade shows required tool');
  assert.ok(
    (await ui(page)).nodes['RecipeItem-expandedWarehouse'],
    'Upgrade shows distinct result',
  );
  await page.screenshot({ path: path.join(evidence, `${name}-checkpoint-upgrade-recipe.png`) });
  for (let i = 0; i < 6; i++) await nodeClick('RecipePrevious');
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
    hammerConstruction: true,
    newRoutes: await require('./route-checkpoint.cjs')(page, evidence, name, touch, {
      dragTool,
      showTool,
    }),
    compostAndRoast: await require('./compost-checkpoint.cjs')(page, evidence, name, touch, {
      showTool,
    }),
    handbook: true,
  };
};
