const fs = require('node:fs'),
  path = require('node:path'),
  { spawn } = require('node:child_process');
const stats = { calls: 0, rpcMs: 0, driverMs: 0, compiles: [], links: [], info: null };
let child, input, output;
function rpc(method, ...args) {
  const start = performance.now();
  fs.writeSync(input, JSON.stringify({ method, args }) + '\n');
  const pieces = [];
  let done = false;
  while (!done) {
    const chunk = Buffer.alloc(8192),
      n = fs.readSync(output, chunk, 0, chunk.length, null);
    if (!n) throw Error('GLES worker exited');
    pieces.push(chunk.subarray(0, n));
    done = chunk[n - 1] === 10;
  }
  const result = JSON.parse(Buffer.concat(pieces).toString());
  stats.calls++;
  stats.rpcMs += performance.now() - start;
  stats.driverMs += result.driverMs || 0;
  if (result.error) throw Error(result.error);
  return result.result;
}
module.exports = () => {
  if (process.platform !== 'linux')
    throw new Error(
      'Mesa EGL generation requires Linux; use the default headless-gl provider elsewhere',
    );
  child = spawn('python3', ['-u', path.join(__dirname, 'effect-gl-mesa.py')], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, MESA_SHADER_CACHE_DISABLE: 'true' },
  });
  child.stdin._handle.setBlocking(true);
  child.stdout._handle.setBlocking(true);
  input = child.stdin._handle.fd;
  output = child.stdout._handle.fd;
  stats.info = rpc('info');
  return {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    getSupportedExtensions: () => stats.info.extensions.split(' ').filter(Boolean),
    getExtension: () => null,
    isContextLost: () => false,
    createShader: (type) => ({ type }),
    shaderSource: (shader, source) => (shader.source = source),
    compileShader: (shader) => {
      Object.assign(shader, rpc('compile', shader.type, shader.source));
      stats.compiles.push({ type: shader.type, status: shader.status, log: shader.log });
    },
    getShaderParameter: (shader) => shader.status,
    getShaderInfoLog: (shader) => shader.log,
    deleteShader: (shader) => {
      if (shader?.id) rpc('deleteShader', shader.id);
    },
    createProgram: () => ({ shaders: [] }),
    attachShader: (program, shader) => program.shaders.push(shader.id),
    linkProgram: (program) => {
      Object.assign(program, rpc('link', program.shaders));
      stats.links.push({ status: program.status, log: program.log });
    },
    getProgramParameter: (program) => program.status,
    getProgramInfoLog: (program) => program.log,
    deleteProgram: (program) => {
      if (program?.id) rpc('deleteProgram', program.id);
    },
  };
};
module.exports.stats = stats;
module.exports.close = () => {
  if (child) {
    child.stdin.end();
    child.kill();
    child = null;
  }
};

module.exports.provenance = () => rpc('provenance');
