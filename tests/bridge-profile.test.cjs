const test = require('node:test'),
  assert = require('node:assert/strict');
const g = require('../.domain-build/domain/game');
const {
  townSession,
  profileStorage,
  profileLabel,
  activeProfile,
} = require('../.domain-build/application/TownProfiles');
const { GameStart } = require('../.domain-build/application/GameStart');
const { startMenu } = require('../.domain-build/application/StartMenu');
const { startLayout } = require('../.domain-build/application/StartLayout');
const { profileFrame } = require('../.domain-build/application/ProfileFraming');
const { SAVE_KEY, GAME_SAVE_KEYS } = require('../.domain-build/domain/storage');
const { fittedOrthoHeight, homeZoom } = require('../.domain-build/application/CameraFraming');
function memory() {
  const data = new Map();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
}
function other(store) {
  return [...store.data].filter(
    ([k]) =>
      !k.startsWith('town-evolution.v5-bridge-demo.') && k !== 'town-evolution.active-profile',
  );
}
test('new bridge title action isolates all automatic/manual/recovery/reset keys without changing existing profiles', () => {
  const store = memory();
  for (const p of ['normal', 'demo', 'v5-preview']) {
    const s = profileStorage(store, p);
    for (const k of GAME_SAVE_KEYS) s.setItem(k, 'untouched ' + p + ' ' + k);
    s.setItem('town-evolution.manual.1', 'manual ' + p);
  }
  const before = other(store),
    flow = new GameStart(store, () => 100000),
    menu = startMenu(flow, () => {});
  menu.actions.find((a) => a.id === 'v5-bridge-demo').run();
  assert.equal(flow.profile, 'v5-bridge-demo');
  assert.equal(activeProfile(store), 'v5-bridge-demo');
  assert.equal(profileLabel(flow.profile), '木桥演示');
  assert.match(flow.session.message, /独立实验/);
  assert.deepEqual(other(store), before);
  const state = flow.session.state,
    piers = state.buildings.filter((b) => b.kind === 'woodenPier');
  assert.equal(piers.length, 2);
  assert.equal(
    flow.session.run({
      type: 'dragMerge',
      sourceId: piers[1].id,
      targetId: piers[0].id,
      sources: piers.map((b) => ({ ...b })),
    }),
    true,
  );
  const bridge = g.exportSave(flow.session.state);
  flow.chooseSlot(1);
  flow.saveSlot();
  assert.deepEqual(other(store), before);
  assert.equal(g.exportSave(townSession(store, 'v5-bridge-demo', () => 100000).state), bridge);
  flow.newGame();
  assert.match(flow.pending.text, /木桥演示/);
  flow.back();
  assert.equal(g.exportSave(flow.session.state), bridge);
  flow.newGame();
  flow.confirm();
  assert.equal(flow.session.state.buildings.filter((b) => b.kind === 'woodenPier').length, 2);
  assert.deepEqual(other(store), before);
  flow.chooseSlot(1);
  flow.loadSlot();
  flow.confirm();
  assert.equal(g.exportSave(flow.session.state), bridge);
  assert.deepEqual(other(store), before);
});
test('bridge corrupt bytes remain intact; ordinary new world remains v4 and v5 preview remains original seed', () => {
  const store = memory();
  profileStorage(store, 'v5-bridge-demo').setItem(SAVE_KEY, '{broken bridge');
  const before = [...store.data];
  const flow = new GameStart(store, () => 0);
  assert.equal(flow.start('v5-bridge-demo'), false);
  assert.equal(flow.page, 'saves');
  assert.deepEqual([...store.data], before);
  assert.equal(townSession(memory(), 'normal', () => 0).state.terrainVersion, 4);
  assert.equal(townSession(memory(), 'v5-preview', () => 0).state.mapSeed, 42173);
});
test('framing derives from real source/result positions, works after reload and ignores historical IDs', () => {
  const state = g.createBridgeDemo(100000),
    piers = state.buildings.filter((b) => b.kind === 'woodenPier');
  piers.forEach((b, i) => (b.id = 'b' + (99000 + i)));
  state.nextId = 99002;
  const frame = profileFrame('v5-bridge-demo', state);
  assert.equal(frame.x, 140.5);
  assert.equal(frame.z, 136);
  assert.ok(frame.zoomScale > 2);
  const merged = g.dispatch(
    state,
    { type: 'dragMerge', sourceId: piers[1].id, targetId: piers[0].id, sources: piers },
    100000,
  );
  assert.ok(merged.ok, merged.error);
  assert.deepEqual(profileFrame('v5-bridge-demo', merged.state), frame);
  assert.deepEqual(
    profileFrame('v5-bridge-demo', g.importSave(g.exportSave(merged.state), 100000)),
    frame,
  );
  assert.equal(profileFrame('normal', state), undefined);
  assert.equal(profileFrame('v5-preview', state), undefined);
  // Real orthographic directional projection, conservative room for fixed trays.
  const right = [18 / Math.hypot(18, 15), -15 / Math.hypot(18, 15)];
  for (const [w, h] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [1280, 720],
  ]) {
    const ortho = fittedOrthoHeight(w / h, 192) * homeZoom(192) * frame.zoomScale;
    for (const x of [133, 148])
      for (const z of [135, 137]) {
        const px =
          (((x - frame.x) * right[0] + (z - frame.z) * right[1]) * h) / (ortho * 2) + w / 2;
        assert.ok(px >= 35 && px <= w - 50, `${w}x${h}: pier x ${px}`);
      }
  }
});
test('eight title choices retain 44px targets, no overlap, readable headings at small and wide sizes', () => {
  const menu = startMenu(new GameStart(memory(), () => 0), () => {});
  assert.equal(menu.actions.length, 8);
  for (const [w, h] of [
    [320, 568],
    [360, 640],
    [390, 844],
    [844, 390],
    [568, 320],
    [1024, 768],
  ]) {
    const l = startLayout(w, h, menu.actions.length, true);
    assert.equal(l.buttonHeight, 44);
    l.buttons.forEach((p, i) => {
      assert.ok(Math.abs(p.x) + l.buttonWidth / 2 <= w / 2);
      assert.ok(Math.abs(p.y) + 22 < h / 2);
      assert.ok(
        p.y + 22 < l.detailY - l.detailHeight / 2 - 4,
        `${w}x${h} button ${i} overlaps details`,
      );
      for (const q of l.buttons.slice(i + 1))
        assert.ok(Math.abs(p.x - q.x) >= l.buttonWidth + 8 || Math.abs(p.y - q.y) >= 53);
    });
  }
});
