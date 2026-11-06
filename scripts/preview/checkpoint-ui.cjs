/** Read-only actual Cocos UI inspection for the prepared browser checkpoint. */
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

module.exports = ui;
