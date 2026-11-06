const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { sources } = require('./fixtures/cocos-input-source.cjs');
const engine = path.resolve(__dirname, '../../cocos-preview-tools/engine');
for (const [name, source] of Object.entries(sources)) {
  const file = path.join(engine, source.file);
  test(
    `Cocos 3.8.8 ${name} fixture members match the actual engine source`,
    { skip: !fs.existsSync(file) && 'Optional Cocos engine checkout is unavailable' },
    () => {
      const ast = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const members = [];
      function visit(node) {
        if (ts.isClassDeclaration(node))
          for (const member of node.members) {
            const name = ts.isConstructorDeclaration(member)
              ? 'constructor'
              : member.name?.getText(ast);
            if (source.names.includes(name)) members.push(member.getText(ast));
          }
        ts.forEachChild(node, visit);
      }
      visit(ast);
      assert.equal(members.length, source.names.length);
      assert.equal(members.join('\n'), source.text.trim());
    },
  );
}
