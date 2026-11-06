/** Load the production adapter for isolated presentation fixtures without replacing its logic. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(
  path.join(__dirname, '../../assets/scripts/presentation/InputProvenance.ts'),
  'utf8',
);
new Function(
  'exports',
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
)(module.exports);
