import {
  game,
  Game,
  director,
  Director,
  Scene,
  Node,
  EffectAsset,
  Material,
  builtinResMgr,
  tween,
  Tween,
  TweenSystem,
} from 'cc';
import { effects } from 'cocos-preview-effects';
import { TownBootstrap } from '../../assets/scripts/presentation/TownBootstrap';
if (typeof tween !== 'function' || typeof Tween !== 'function' || typeof TweenSystem !== 'function')
  throw new Error('Preview engine is missing required Cocos tween exports');
game.on(Game.EVENT_POST_SUBSYSTEM_INIT, () => {
  if (!TweenSystem.instance || director.getSystem(TweenSystem.ID) !== TweenSystem.instance)
    throw new Error('Cocos TweenSystem was not registered with the director');
  for (const data of effects) {
    const e = Object.assign(new EffectAsset(), data);
    e.onLoaded();
  }
  const defs = [
    ['missing-effect-material', 'builtin-unlit', { USE_COLOR: true }],
    ['missing-material', 'builtin-unlit', { USE_COLOR: true }],
    ['default-clear-stencil', 'builtin-clear-stencil', { USE_TEXTURE: false }],
    ['ui-base-material', 'builtin-sprite', { USE_TEXTURE: false }],
    ['ui-sprite-material', 'builtin-sprite', { USE_TEXTURE: true }],
    ['ui-sprite-gray-material', 'builtin-sprite', { USE_TEXTURE: true, IS_GRAY: true }],
    ['ui-alpha-test-material', 'builtin-sprite', { USE_TEXTURE: true, USE_ALPHA_TEST: true }],
    ['ui-graphics-material', 'builtin-graphics', {}],
  ] as const;
  for (const [name, effectName, defines] of defs) {
    const m = new Material();
    m._uuid = name;
    m.initialize({ effectName, defines });
    builtinResMgr.addAsset(name, m);
  }
});
await game.init({
  debugMode: 1,
  overrideSettings: {
    rendering: { renderMode: 0 },
    screen: { frameRate: 30, designResolution: { width: 960, height: 640, policy: 4 } },
    animation: {},
    assets: { preloadBundles: [], preloadAssets: [] },
    launch: { launchScene: '' },
    splashScreen: { totalTime: 0 },
  },
});
game.run(() => {
  const scene = new Scene('Town Preview');
  const root = new Node('Town');
  scene.addChild(root);
  root.addComponent(TownBootstrap);
  director.runSceneImmediate(scene);
  let frames = 0;
  director.on(Director.EVENT_AFTER_DRAW, () => {
    (
      window as Window & { __townPreview?: { engine: string; ready: boolean; frames: number } }
    ).__townPreview = { engine: 'Cocos 3.8.8', ready: ++frames >= 5, frames };
  });
});
