/** Verify the actual SystemJS export binding, including renamed/minified callbacks. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const requiredExports = ['tween', 'Tween', 'TweenSystem'];
function children(node, visit) {
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => child?.type && visit(child));
    else if (value?.type) visit(value);
  }
}
function verifySource(source, parse, analyze) {
  const ast = parse(source, { ecmaVersion: 'latest', ranges: true });
  const scopes = analyze(ast, { ecmaVersion: 2022, sourceType: 'script' });
  const registrations = [];
  function scan(node) {
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      node.callee.object.name === 'System' &&
      !node.callee.computed &&
      node.callee.property.name === 'register'
    ) {
      const callback = node.arguments.at(-1);
      if (
        ['FunctionExpression', 'ArrowFunctionExpression'].includes(callback?.type) &&
        callback.params[0]?.type === 'Identifier'
      )
        registrations.push(callback);
    }
    children(node, scan);
  }
  scan(ast);
  const groups = registrations.map((callback) => {
    const binding = scopes.scopes
      .flatMap((scope) => scope.variables)
      .find((variable) => variable.identifiers.includes(callback.params[0]));
    const references = new Set(binding?.references.map((ref) => ref.identifier));
    const names = new Set();
    function exportsIn(node) {
      if (node.type === 'CallExpression' && references.has(node.callee)) {
        const first = node.arguments[0];
        if (first?.type === 'Literal' && typeof first.value === 'string') names.add(first.value);
        if (first?.type === 'ObjectExpression')
          for (const property of first.properties)
            if (property.type === 'Property' && !property.computed)
              names.add(property.key.name ?? property.key.value);
      }
      children(node, exportsIn);
    }
    exportsIn(callback.body);
    return names;
  });
  assert.ok(
    groups.some((names) => requiredExports.every((name) => names.has(name))),
    'Built Cocos engine lacks required exports in one System.register module: ' +
      requiredExports.join(', '),
  );
  return { passed: true, kind: 'actual built SystemJS lexical export validation', requiredExports };
}
module.exports = function verifyEngine(file, engine) {
  const { parse } = require(path.join(engine, 'node_modules/acorn'));
  const { analyze } = require(path.join(engine, 'node_modules/eslint-scope'));
  return verifySource(fs.readFileSync(file, 'utf8'), parse, analyze);
};
module.exports.verifySource = verifySource;
