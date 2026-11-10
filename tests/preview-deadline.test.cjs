/** Deadline utility checks only; no browser or renderer is exercised. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { withDeadline } = require('../scripts/preview/acceptance-deadline.cjs');
test('successful bounded work retains its result and never invokes deadline cleanup', async () => {
  let cleaned = false;
  assert.equal(
    await withDeadline(
      async () => 42,
      20,
      'fast',
      () => {
        cleaned = true;
      },
    ),
    42,
  );
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(cleaned, false);
});
test('actual task failures remain the reported cause', async () => {
  const error = new Error('specific fixture failure');
  await assert.rejects(
    () =>
      withDeadline(
        () => {
          throw error;
        },
        1000,
        'error',
      ),
    (actual) => actual === error,
  );
});
test('stalled browser promises have a Node-side deadline and trigger closure once', async () => {
  let closures = 0;
  await assert.rejects(
    () =>
      withDeadline(
        () => new Promise(() => {}),
        15,
        'stalled page.evaluate',
        () => {
          closures++;
        },
      ),
    /deadline exceeded.*stalled page.evaluate/,
  );
  assert.equal(closures, 1);
});
test('deadline does not wait for stalled asynchronous context cleanup', async () => {
  await assert.rejects(
    () =>
      withDeadline(
        () => new Promise(() => {}),
        15,
        'stalled context',
        () => new Promise(() => {}),
      ),
    /deadline exceeded.*stalled context/,
  );
});
