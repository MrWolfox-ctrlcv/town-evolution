/** Lightweight layering and cycle guards using the TypeScript parser, not text heuristics. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '../assets/scripts');
const edges = new Map();

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(filename);
      continue;
    }
    if (!filename.endsWith('.ts')) continue;
    const source = fs.readFileSync(filename, 'utf8');
    assert.ok(
      source.split('\n').length <= 300,
      `${path.relative(root, filename)} exceeds 300 lines`,
    );
    const syntax = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    const imports = [];
    const isDomain = filename.startsWith(path.join(root, 'domain') + path.sep);
    for (const statement of syntax.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier)) continue;
      const target = specifier.text;
      if (isDomain) assert.ok(target.startsWith('.'), `External dependency in domain: ${target}`);
      if (!target.startsWith('.')) continue;
      const resolved = path.resolve(path.dirname(filename), `${target}.ts`);
      assert.ok(fs.existsSync(resolved), `Missing module: ${target} in ${filename}`);
      if (isDomain) assert.ok(resolved.startsWith(path.join(root, 'domain') + path.sep));
      imports.push(resolved);
    }
    edges.set(filename, imports);
  }
}
walk(root);
const done = new Set();
function visit(filename, stack = []) {
  assert.ok(
    !stack.includes(filename),
    `Import cycle: ${[...stack, filename].map((p) => path.relative(root, p)).join(' -> ')}`,
  );
  if (done.has(filename)) return;
  for (const target of edges.get(filename) ?? []) visit(target, [...stack, filename]);
  done.add(filename);
}
for (const filename of edges.keys()) visit(filename);
console.log(
  `Architecture verified: ${edges.size} modules, no cycles or domain-to-engine dependencies.`,
);
