const test = require('node:test');
const assert = require('node:assert/strict');
const { drag } = require('../scripts/preview/pointer-input.cjs');
for (const touch of [false, true])
  test(`drag observation preserves ${touch ? 'touch' : 'mouse'} movement count and release`, async () => {
    const input = [],
      phases = [];
    const page = {
      evaluate: async () => {},
      mouse: {
        move: async (...p) => input.push(['move', ...p]),
        down: async () => input.push(['down']),
        up: async () => input.push(['up']),
      },
      context: () => ({
        newCDPSession: async () => ({
          send: async (_, e) => input.push([e.type, e.touchPoints]),
          detach: async () => {},
        }),
      }),
    };
    await drag(page, { x: 100, y: 100 }, { x: 220, y: 220 }, touch, 0, async (phase, p) =>
      phases.push([phase, p]),
    );
    assert.deepEqual(
      phases.map(([p]) => p),
      ['pressed', 'held', 'move-6', 'move-12', 'released'],
    );
    assert.deepEqual(phases[2][1], { x: 160, y: 160 });
    assert.equal(
      input.filter(([t]) => t === (touch ? 'touchMove' : 'move')).length,
      touch ? 12 : 13,
    );
    assert.equal(input.at(-1)[0], touch ? 'touchEnd' : 'up');
  });
