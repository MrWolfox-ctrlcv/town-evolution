/** Serialized into the verified browser: read engine counters without changing the game. */
async function sampleFrames(count) {
  const cc = await System.import('cc');
  const device = cc.director.root.device;
  const canvas = document.querySelector('#GameCanvas');
  const scene = cc.director.getScene();
  const boot = scene.getChildByName('Town').getComponent('TownBootstrap');
  const samples = [];
  let previous;
  await new Promise((resolve) => {
    const record = () => {
      const now = performance.now();
      if (previous !== undefined)
        samples.push({
          intervalMs: now - previous,
          drawCalls: device.numDrawCalls,
          triangles: device.numTris,
          instances: device.numInstances,
        });
      previous = now;
      if (samples.length >= count) {
        cc.director.off(cc.Director.EVENT_AFTER_DRAW, record);
        resolve();
      }
    };
    cc.director.on(cc.Director.EVENT_AFTER_DRAW, record);
  });
  const renderers = scene
    .getComponentsInChildren(cc.MeshRenderer)
    .filter((r) => r.enabledInHierarchy && r.node.activeInHierarchy);
  return {
    renderer: device.renderer,
    vendor: device.vendor,
    canvas: {
      width: canvas.width,
      height: canvas.height,
      cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight,
      devicePixelRatio: devicePixelRatio,
    },
    activeMeshRenderers: renderers.length,
    activeMeshRenderersNote: 'Scene-active count, not culled visibility or draw calls.',
    memory: {
      bufferSize: device.memoryStatus.bufferSize,
      textureSize: device.memoryStatus.textureSize,
    },
    camera: {
      height: boot.controller.map.camera.orthoHeight,
      focus: { x: boot.controller.map.focus.x, z: boot.controller.map.focus.z },
    },
    surface: boot.controller.town.surfaceStatus,
    samples,
  };
}
module.exports = { sampleFrames };
