const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = (filename) =>
  fs.readFileSync(path.join(__dirname, '../assets/scripts/presentation', filename), 'utf8');

// Source-level UI contract guards, not a claim of rendered Cocos interaction coverage.
test('navigation exposes no ordinary construction tab and sizes the remaining tabs dynamically', () => {
  const navigation = source('BottomActions.ts');
  assert.doesNotMatch(navigation, /\['build',\s*'建造'\]/);
  assert.doesNotMatch(navigation, /build:\s*'建造小镇'/);
  assert.match(navigation, /\(this\.tabs\.length - 1\) \/ 2/);
});

test('HUD and controller cannot dispatch disabled construction or coin expansion', () => {
  for (const filename of ['HudActions.ts', 'TownController.ts']) {
    const code = source(filename);
    assert.doesNotMatch(code, /type:\s*'(?:place|upgrade)'/);
    assert.doesNotMatch(code, /handlers\.(?:build|confirm)\b/);
    assert.doesNotMatch(code, /ui\.(?:placing|preview)\b/);
    assert.doesNotMatch(code, /确认建造|金币扩容\s*·/);
  }
  assert.doesNotMatch(source('UiContracts.ts'), /\b(?:placing|preview|build|confirm):/);
  assert.match(source('HudActions.ts'), /text: '暂无订单板',\s*enabled: false/);
  assert.doesNotMatch(source('HudActions.ts'), /订单板合成配方尚未开放/);
  assert.match(source('HudActions.ts'), /还没有订单板/);
});

test('existing facility selection, rotation, material return and legacy recovery remain exposed', () => {
  const actions = source('HudActions.ts');
  for (const action of ['打开订单板', 'detachMaterial', 'rotateBuilding', 'repurposeToBoard'])
    assert.ok(actions.includes(action), action);
  assert.match(source('TownController.ts'), /pickObject\(this\.ui, this\.town, ray\)/);
  assert.match(source('ObjectContext.ts'), /town\.pickBuilding\(ray\)/);
});
