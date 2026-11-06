const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { titleIsland, TITLE_ISLAND_TIME } = require('../.domain-build/application/TitleIsland.js');
const { createDemoGame } = require('../.domain-build/domain/demo.js');
const { cropPose } = require('../.domain-build/art/CropAnimation.js');
const read = (name) => fs.readFileSync(`assets/scripts/${name}.ts`, 'utf8');
test('title is the actual playable demo template, independent, frozen and deterministic', () => {
  const first = titleIsland(),
    second = titleIsland();
  assert.deepEqual(first, createDemoGame(TITLE_ISLAND_TIME));
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first.buildings, second.buildings);
  const check = (value) => {
    assert.ok(Object.isFrozen(value));
    for (const child of Object.values(value))
      if (child !== null && typeof child === 'object') check(child);
  };
  check(first);
  assert.throws(() => first.buildings.push(first.buildings[0]));
  assert.ok(first.buildings.some((building) => building.kind === 'dock'));
  assert.ok(first.buildings.some((building) => building.kind === 'residence'));
});
test('title wind stays live for all crop stages without advancing growth or changing jobs', () => {
  const island = titleIsland(),
    before = JSON.stringify(island);
  let moving = 0;
  for (const farm of island.buildings.filter((building) => building.kind === 'farm'))
    for (const job of farm.cropJobs.filter(Boolean)) {
      const ready = job.readyAt <= TITLE_ISLAND_TIME;
      const first = cropPose(job, TITLE_ISLAND_TIME, 1, ready, TITLE_ISLAND_TIME);
      for (const elapsed of [1000, 30000, 3600000, 86400000]) {
        const pose = cropPose(job, TITLE_ISLAND_TIME + elapsed, 1, ready, TITLE_ISLAND_TIME);
        assert.equal(pose.width, first.width);
        assert.equal(pose.height, first.height);
        if (pose.leanX !== first.leanX) moving++;
      }
    }
  assert.ok(moving > 0);
  assert.equal(JSON.stringify(island), before);
});
test('title render has no storage, session, input controller or raster-image dependency', () => {
  const view = read('presentation/StartArtwork');
  const model = read('application/TitleIsland');
  assert.match(view, /new TownView\(this\.root\)/);
  assert.match(view, /const island = titleIsland\(\)/);
  assert.match(view, /this\.town\.sync\(island, null, null, TITLE_ISLAND_TIME\)/);
  assert.match(view, /worldSize\(island\.terrainVersion\)/);
  assert.match(view, /motion\.freezeGrowth\(TITLE_ISLAND_TIME\)/);
  assert.doesNotMatch(
    view + model,
    /GameSession|GameStart|localStorage|profileStorage|loadGame|saveGame|MapCamera|assetManager|ImageAsset|SpriteFrame|\.png/,
  );
  assert.doesNotMatch(view.slice(view.indexOf('  tick(')), /town\.sync|createMesh|new TownView/);
});
test('native menu overlays the 3D camera and gameplay releases the background', () => {
  const screen = read('presentation/StartScreen');
  const bootstrap = read('presentation/TownBootstrap');
  assert.match(screen, /Camera\.ClearFlag\.DEPTH_ONLY/);
  assert.match(screen, /consumeTouches\(this\.canvas\)/);
  assert.match(screen, /this\.artwork \?\?= new StartArtwork\(this\.root\)/);
  assert.match(
    screen,
    /hide\(\): void \{[\s\S]*?this\.artwork\?\.dispose\(\);[\s\S]*?this\.artwork = null/,
  );
  assert.match(bootstrap, /if \(playing\) this\.menu\.hide\(\)/);
  assert.match(bootstrap, /else this\.menu\.tick\(dt\)/);
  const build = fs.readFileSync('scripts/preview/build.cjs', 'utf8');
  assert.doesNotMatch(build, /title\/island|resources\/title/);
});
test('background template remains available with unavailable locks and malformed player/demo saves', () => {
  const { ExclusiveGameStorage } = require('../.domain-build/application/ExclusiveGameStorage.js');
  const { GameStart } = require('../.domain-build/application/GameStart.js');
  const { startMenu } = require('../.domain-build/application/StartMenu.js');
  const { SAVE_KEY } = require('../.domain-build/domain/storage.js');
  const data = new Map([
    [SAVE_KEY, 'corrupt player'],
    [`town-evolution.demo.${SAVE_KEY}`, '{"schemaVersion":999}'],
  ]);
  let writes = 0;
  const storage = new ExclusiveGameStorage(
    {
      getItem: (key) => data.get(key) ?? null,
      setItem: () => {
        writes++;
      },
      removeItem: () => {
        writes++;
      },
    },
    null,
  );
  const before = [...data];
  const flow = new GameStart(
    storage,
    () => TITLE_ISLAND_TIME,
    () => storage.warning,
  );
  const background = titleIsland();
  startMenu(flow, () => {});
  flow.saves();
  flow.chooseProfile('demo');
  startMenu(flow, () => {});
  assert.equal(flow.start('demo'), false);
  assert.equal(flow.session, null);
  assert.match(flow.storageWarning, /Web Locks/);
  assert.deepEqual(background, createDemoGame(TITLE_ISLAND_TIME));
  assert.deepEqual([...data], before);
  assert.equal(writes, 0);
});
