/** Cache acceptance is read-only. Changed inputs require real compiler regeneration. */
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { unpack } = require('./effect-codec.cjs');
const ENGINE_REVISION = '411f98df047c25902f93440d4b22925c2fb65461';
const CLI_REVISION = '723a5b6eb76cd9a1e740566bbbb62ae32ae081ef';
const CACHE_FILE = path.join(__dirname, 'generated/effects.cache.json');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function hashFiles(root, files) {
  const hash = createHash('sha256');
  for (const file of [...new Set(files)].sort()) {
    const bytes = fs.readFileSync(path.join(root, file));
    hash.update(JSON.stringify([file.replaceAll('\\', '/'), bytes.length]));
    hash.update(bytes);
  }
  return hash.digest('hex');
}
function walk(root, relative = '') {
  return fs
    .readdirSync(path.join(root, relative), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .flatMap((entry) => {
      const file = path.posix.join(relative, entry.name);
      if (entry.name === 'node_modules' || entry.name === '.git') return [];
      if (entry.isDirectory()) return walk(root, file);
      if (!entry.isFile()) throw new Error(`Unsupported symlink or special input: ${file}`);
      return [file];
    });
}
function sourceTree(root, revision) {
  const git = (args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
  if (git(['rev-parse', 'HEAD']) !== revision)
    throw new Error(`Unexpected official Cocos revision: ${root}`);
  // Hash working-tree bytes, not just HEAD. Include new, non-ignored files too.
  // Installed dependency lock changes are independently covered by actual package inputs.
  const files = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    .split('\0')
    .filter((file) => file && !/^(package-lock(?:\.upstream)?\.json)$/.test(file));
  return { revision, files: files.length, sha256: hashFiles(root, files) };
}
function projectInputs(root = path.resolve(__dirname, '../..')) {
  const files = [
    ...walk(path.join(root, 'scripts/preview'))
      .filter((file) => /^effect[^/]*\.(cjs|py)$/.test(file))
      .map((file) => `scripts/preview/${file}`),
    ...walk(path.join(root, 'assets/resources/environment'))
      .filter((file) => file.endsWith('.effect'))
      .map((file) => `assets/resources/environment/${file}`),
  ];
  return { files: files.length, sha256: hashFiles(root, files) };
}
function packageRoot(name, from) {
  const resolver = require('node:module').createRequire(path.join(from, 'package.json'));
  for (const directory of resolver.resolve.paths('__effect_package_lookup__') || []) {
    const root = path.join(directory, name);
    if (fs.existsSync(root)) {
      if (fs.realpathSync(root) !== path.resolve(root))
        throw new Error(`Unsupported symlink compiler package: ${name}`);
      if (!fs.existsSync(path.join(root, 'package.json')))
        throw new Error(`Compiler package lacks metadata: ${name}`);
      return root;
    }
  }
  const error = new Error(`Cannot identify compiler dependency ${name}`);
  error.code = 'EFFECT_DEPENDENCY_MISSING';
  throw error;
}
function dependencyInputs(engine, roots) {
  const seen = new Set(),
    packages = [];
  function visit(name, from) {
    const root = packageRoot(name, from);
    if (seen.has(root)) return;
    seen.add(root);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const files = walk(root);
    const location = path.relative(engine, root).replaceAll(path.sep, '/');
    if (location.startsWith('../') || path.isAbsolute(location))
      throw new Error('Compiler dependency outside engine root is not supported');
    packages.push({
      location,
      name: pkg.name,
      version: pkg.version,
      sha256: hashFiles(root, files),
    });
    for (const dependency of Object.keys(pkg.dependencies || {}).sort()) visit(dependency, root);
    for (const dependency of Object.keys({
      ...pkg.optionalDependencies,
      ...pkg.peerDependencies,
    }).sort()) {
      let installed = false;
      try {
        packageRoot(dependency, root);
        installed = true;
      } catch (error) {
        if (error.code !== 'EFFECT_DEPENDENCY_MISSING') throw error;
      }
      if (installed) visit(dependency, root);
    }
  }
  // These packages execute the authoritative compiler or construct/load its gfx mappings.
  for (const name of roots || [
    'pako',
    'glsl-tokenizer',
    'glsl-parser',
    'js-yaml',
    'esbuild',
    '@cocos/ccbuild',
    'systemjs',
    'jest-environment-jsdom',
  ])
    visit(name, engine);
  packages.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
  return {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    packages,
    sha256: sha256(JSON.stringify(packages)),
  };
}
function collectInputs(engine, cli, root) {
  if (process.env.ESBUILD_BINARY_PATH)
    throw new Error('Custom ESBUILD_BINARY_PATH is not supported for effect cache provenance');
  return {
    project: projectInputs(root),
    engine: {
      ...sourceTree(engine, ENGINE_REVISION),
      assetsSha256: hashFiles(
        path.join(engine, 'editor/assets'),
        walk(path.join(engine, 'editor/assets')),
      ),
    },
    cli: sourceTree(cli, CLI_REVISION),
    dependencies: dependencyInputs(engine),
  };
}
function verifyRecord(record, inputs) {
  if (record?.schema !== 1 || !record.packed || !record.inputs || !record.payloadSha256)
    throw new Error('Missing or invalid effect cache; run preview:effects:generate with real GL');
  if (record.payloadSha256 !== sha256(JSON.stringify(record.packed)))
    throw new Error('Corrupt effect cache payload');
  for (const [key, value] of Object.entries(inputs))
    if (JSON.stringify(record.inputs[key]) !== JSON.stringify(value))
      throw new Error(`Stale effect cache ${key} inputs; regenerate with preview:effects:generate`);
  const data = unpack(record.packed);
  if (
    !Array.isArray(data.effects) ||
    data.effects.length !== 9 ||
    data.validation?.pairs?.length !== 16
  )
    throw new Error('Invalid effect cache output cardinality');
  return data;
}
function readCache(inputs, file = CACHE_FILE) {
  let record;
  try {
    record = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Missing or unreadable effect cache: ${error.message}`);
  }
  return { record, data: verifyRecord(record, inputs) };
}
module.exports = {
  CACHE_FILE,
  ENGINE_REVISION,
  CLI_REVISION,
  sha256,
  collectInputs,
  sourceTree,
  dependencyInputs,
  projectInputs,
  verifyRecord,
  readCache,
};
if (require.main === module) {
  const local = process.argv.includes('--local');
  const inputs = local
    ? { project: projectInputs() }
    : collectInputs(
        path.resolve(process.env.COCOS_ENGINE || 'temp/cocos-engine'),
        path.resolve(process.env.COCOS_CLI || 'temp/cocos-cli'),
      );
  readCache(inputs);
  console.log(
    `Effect cache verified (${local ? 'local source and payload' : 'all current source and tool inputs'}; no GL execution)`,
  );
}
