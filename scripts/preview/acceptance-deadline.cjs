/** Node-side bound for browser work, including stalled page.evaluate/rAF promises. */
async function withDeadline(task, milliseconds, label, onTimeout = () => {}) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try {
        Promise.resolve(onTimeout()).catch((error) =>
          console.error('Deadline cleanup failed:', error),
        );
      } catch (error) {
        console.error('Deadline cleanup failed:', error);
      } finally {
        reject(new Error(`Acceptance deadline exceeded (${milliseconds}ms): ${label}`));
      }
    }, milliseconds);
  });
  try {
    return await Promise.race([Promise.resolve().then(task), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
module.exports = { withDeadline };
