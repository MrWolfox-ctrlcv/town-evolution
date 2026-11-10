/** Build-tool focused fixtures plus actual debug and minified artifacts, no graphics claim. */
const path = require('node:path');
const assert = require('node:assert/strict');
const engine = path.resolve(process.env.COCOS_ENGINE || 'temp/cocos-engine');
const { parse } = require(path.join(engine, 'node_modules/acorn'));
const { analyze } = require(path.join(engine, 'node_modules/eslint-scope'));
const { verifySource } = require('./verify-engine.cjs');
const check = (source) => verifySource(source, parse, analyze);
for (const name of ['exports', 'e', 'b']) {
  check(
    `System.register([], function(${name}) { return {execute() { ${name}({tween: 1, Tween: 2, TweenSystem: 3}); }}; });`,
  );
  check(
    `System.register('cc', [], (${name}) => ({ execute() { ${name}('tween', 1); ${name}('Tween', 2); ${name}('TweenSystem', 3); } }));`,
  );
}
for (const source of [
  `function exports() {} exports({tween: 1, Tween: 1, TweenSystem: 1});`,
  `System.register([], function(e) { return {execute() { function inner(e) { e({tween:1,Tween:1,TweenSystem:1}); } }}; });`,
  `System.register([], function(e) { return {execute() { { const e = () => {}; e({tween:1,Tween:1,TweenSystem:1}); } }}; });`,
  `System.register([], function(e) { return {execute() { e({tween:1,Tween:1}); }}; });`,
  `System.register([], function(e) { return {execute() { e('tween',1); }}; }); System.register([], function(e) { return {execute() { e({Tween:1,TweenSystem:1}); }}; });`,
])
  assert.throws(() => check(source));
for (const file of process.argv.slice(2)) require('./verify-engine.cjs')(file, engine);
console.log('Export validator: 11 fixtures and supplied actual artifacts passed.');
