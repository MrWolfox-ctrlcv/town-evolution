/** Read-only assertions on real Cocos GPU output. Invoke with an already discovered page open. */
const assert = require('node:assert/strict');
module.exports = async (page) => {
  await page.waitForFunction(async () => {
    const cc = await System.import('cc');
    const scene = cc.director.getScene();
    const loading = scene
      .getComponentsInChildren(cc.Label)
      .some((label) => label.node.activeInHierarchy && label.node.name === 'ThumbnailLoading');
    return !loading && !scene.getChildByName('ModelThumbnailCapture');
  });
  const result = await page.evaluate(async () => {
    const cc = await System.import('cc');
    const scene = cc.director.getScene();
    const sprites = scene
      .getComponentsInChildren(cc.Sprite)
      .filter((sprite) => sprite.node.activeInHierarchy && sprite.node.name.startsWith('Recipe-'));
    const pictures = sprites.map((sprite) => ({
      name: sprite.node.name,
      renderTexture: sprite.spriteFrame?.texture instanceof cc.RenderTexture,
      width: sprite.spriteFrame?.rect.width,
      graphics: sprite.node.getComponent(cc.Graphics)?.enabled ?? false,
    }));
    const textures = [...new Set(sprites.map((sprite) => sprite.spriteFrame?.texture))].filter(
      (texture) => texture instanceof cc.RenderTexture,
    );
    const pixels = textures.map((texture) => {
      const buffer = texture.readPixels();
      let visible = 0,
        transparent = 0;
      for (let i = 3; buffer && i < buffer.length; i += 4) {
        if (buffer[i] > 0) visible++;
        else transparent++;
      }
      return { width: texture.width, height: texture.height, visible, transparent };
    });
    return { pictures, textures: textures.length, pixels };
  });
  assert.ok(result.pictures.length > 0, 'Expected at least one discovered recipe model');
  assert.equal(result.textures, 1, 'Discovered models share a single Cocos render target');
  assert.ok(result.pictures.every((picture) => picture.renderTexture && !picture.graphics));
  assert.ok(result.pixels.every((p) => p.visible > 100 && p.transparent > 100));
  return result;
};
