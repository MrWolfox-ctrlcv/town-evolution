/** Replay the official compiler's exact WebGL1 validation, before game.init. */
function browserContext(width, height, attributes) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('webgl', attributes);
}
function validateEffects(validation, createContext = browserContext) {
  if (
    validation?.width !== 300 ||
    validation.height !== 150 ||
    validation.attributes?.preserveDrawingBuffer !== true ||
    !Array.isArray(validation.pairs) ||
    !validation.pairs.length
  )
    throw new Error('Invalid effect shader validation data');
  const gl = createContext(validation.width, validation.height, validation.attributes);
  if (!gl) throw new Error('Real WebGL required for official shader validation');
  try {
    for (const extension of gl.getSupportedExtensions() || []) gl.getExtension(extension);
    for (const pair of validation.pairs) {
      const shaders = [];
      let program;
      try {
        if (gl.isContextLost?.()) throw new Error('WebGL context lost during effect validation');
        for (const [type, source] of [
          [gl.VERTEX_SHADER, pair.vert],
          [gl.FRAGMENT_SHADER, pair.frag],
        ]) {
          if (typeof source !== 'string') throw new Error('Invalid shader source');
          const shader = gl.createShader(type);
          if (!shader) throw new Error('Unable to create effect shader');
          shaders.push(shader);
          gl.shaderSource(shader, source);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
            throw new Error(
              `Effect ${pair.effect} shader compilation failed: ${gl.getShaderInfoLog(shader)}`,
            );
        }
        program = gl.createProgram();
        if (!program) throw new Error('Unable to create effect shader program');
        for (const shader of shaders) gl.attachShader(program, shader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error(
            `Effect ${pair.effect} shader link failed: ${gl.getProgramInfoLog(program)}`,
          );
        if (gl.isContextLost?.()) throw new Error('WebGL context lost during effect validation');
      } finally {
        if (program) gl.deleteProgram(program);
        for (const shader of shaders) gl.deleteShader(shader);
      }
    }
  } finally {
    // This dedicated validation canvas is never used by Cocos's rendering context.
    gl.getExtension('WEBGL_lose_context')?.loseContext?.();
  }
}
module.exports = { validateEffects };
