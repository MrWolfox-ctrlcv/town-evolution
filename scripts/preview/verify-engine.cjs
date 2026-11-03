/** Verify actual built SystemJS exports, not config text or an unrelated engine fixture. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
module.exports = function verifyEngine(file, engine) {
  const { parse } = require(path.join(engine, 'node_modules/acorn'));
  const ast = parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 'latest' });
  const names = new Set();
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'exports'
    ) {
      const first = node.arguments[0];
      if (first?.type === 'Literal' && typeof first.value === 'string') names.add(first.value);
      if (first?.type === 'ObjectExpression')
        for (const property of first.properties) {
          if (property.type === 'Property') names.add(property.key.name ?? property.key.value);
        }
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast);
  for (const name of ['tween', 'Tween', 'TweenSystem'])
    assert.ok(names.has(name), `Built Cocos engine lacks required export ${name}`);
  return {
    passed: true,
    kind: 'actual built SystemJS AST export validation',
    requiredExports: ['tween', 'Tween', 'TweenSystem'],
  };
};
