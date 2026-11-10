/** Browser reads and Node-side polling keep asynchronous module imports out of predicates. */
async function readScene() {
  const cc = await System.import('cc');
  const b = cc.director.getScene()?.getChildByName('Town')?.getComponent('TownBootstrap');
  const c = b?.controller;
  return {
    page: b?.flow.page ?? null,
    profile: b?.flow.profile ?? null,
    menuVisible: b?.menu.root.activeInHierarchy ?? null,
    surface: c?.town.surfaceStatus ?? null,
    awaitingOverview: c?.v6Navigation?.navigation.awaitingOverview ?? null,
    focus: c ? { x: c.map.focus.x, z: c.map.focus.z } : null,
    homeReady: c?.town.isGroundReady(6, 6) ?? false,
    preparation: b?.flow.preparation.progress ?? null,
  };
}
const entered = (s) =>
  s.page === 'game' &&
  s.profile === 'v6-preview' &&
  s.menuVisible === false &&
  s.surface?.overviewVisible === true &&
  s.awaitingOverview === false;
const homeReady = (s) => entered(s) && s.focus?.x === 6 && s.focus?.z === 6 && s.homeReady === true;
async function pollScene(
  read,
  predicate,
  milliseconds,
  observe = () => {},
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
) {
  const start = now();
  while (now() - start < milliseconds) {
    const scene = await read();
    observe(scene);
    if (predicate(scene)) return scene;
    await sleep(200);
  }
  throw Error('Performance setup scene deadline exceeded');
}
module.exports = { readScene, entered, homeReady, pollScene };
