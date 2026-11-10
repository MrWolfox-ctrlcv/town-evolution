/** Instrument a real GL implementation without altering compiler sources/statuses. */
function recorder(createContext) {
  const validation = {
    width: 300,
    height: 150,
    attributes: { preserveDrawingBuffer: true },
    pairs: [],
  };
  let currentEffect = '',
    context;
  const factory = (width, height, attributes) => {
    if (context) throw new Error('Unexpected additional official compiler context');
    if (
      width !== 300 ||
      height !== 150 ||
      JSON.stringify(attributes) !== JSON.stringify(validation.attributes)
    )
      throw new Error('Official compiler validation conditions changed');
    const gl = (context = createContext(width, height, attributes));
    if (!gl) throw new Error('Real GL is required to regenerate effects');
    // A success-returning shim cannot create a cache. These are real driver failures.
    const negative = gl.createShader(gl.VERTEX_SHADER);
    try {
      gl.shaderSource(negative, '#version 100\nthis is deliberately invalid GLSL');
      gl.compileShader(negative);
      if (gl.getShaderParameter(negative, gl.COMPILE_STATUS))
        throw new Error('GL negative control unexpectedly passed; real compiler required');
    } finally {
      gl.deleteShader(negative);
    }
    const badLinkShaders = [],
      badLink = gl.createProgram();
    try {
      for (const [type, source] of [
        [
          gl.VERTEX_SHADER,
          'attribute vec4 a; varying vec2 v; void main(){gl_Position=a;v=vec2(1.0);}',
        ],
        [
          gl.FRAGMENT_SHADER,
          'precision mediump float; varying vec4 v; void main(){gl_FragColor=v;}',
        ],
      ]) {
        const shader = gl.createShader(type);
        badLinkShaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error('GL link negative-control shader failed to compile');
        gl.attachShader(badLink, shader);
      }
      gl.linkProgram(badLink);
      if (gl.getProgramParameter(badLink, gl.LINK_STATUS))
        throw new Error('GL link negative control unexpectedly passed; real linker required');
    } finally {
      gl.deleteProgram(badLink);
      for (const shader of badLinkShaders) gl.deleteShader(shader);
    }
    const sources = new Map(),
      attachments = new Map();
    return new Proxy(gl, {
      get(target, key) {
        if (key === 'shaderSource')
          return (shader, source) => {
            sources.set(shader, source);
            return gl.shaderSource(shader, source);
          };
        if (key === 'attachShader')
          return (program, shader) => {
            if (!attachments.has(program)) attachments.set(program, []);
            attachments.get(program).push(shader);
            return gl.attachShader(program, shader);
          };
        if (key === 'linkProgram')
          return (program) => {
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS))
              throw new Error(`Official effect link failed: ${gl.getProgramInfoLog(program)}`);
            const shaders = attachments.get(program);
            if (shaders?.length !== 2) throw new Error('Unexpected official shader pair');
            validation.pairs.push({
              effect: currentEffect,
              vert: sources.get(shaders[0]),
              frag: sources.get(shaders[1]),
            });
          };
        if (key === 'deleteShader')
          return (shader) => {
            sources.delete(shader);
            return gl.deleteShader(shader);
          };
        if (key === 'deleteProgram')
          return (program) => {
            attachments.delete(program);
            return gl.deleteProgram(program);
          };
        const value = target[key];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };
  return {
    factory,
    validation,
    beginEffect: (name) => {
      currentEffect = name;
    },
    close: () => {
      context?.getExtension?.('STACKGL_destroy_context')?.destroy?.();
      context?.getExtension?.('WEBGL_lose_context')?.loseContext?.();
    },
  };
}
module.exports = { recorder };
