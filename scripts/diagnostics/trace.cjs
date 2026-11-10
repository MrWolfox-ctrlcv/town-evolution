const fs = require('node:fs');
const wanted = ['toplevel', 'blink', 'cc', 'viz', 'gpu', 'renderer.scheduler'];
async function captureTrace(browser, file, sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
  let session,
    active = false,
    handle,
    fd;
  const result = { status: 'unsupported', categories: [], bytes: 0 };
  try {
    session = await browser.newBrowserCDPSession();
    const { categories } = await session.send('Tracing.getCategories');
    result.categories = wanted.filter((c) => categories.includes(c));
    if (!result.categories.length) return result;
    const complete = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve));
    await session.send('Tracing.start', {
      transferMode: 'ReturnAsStream',
      traceConfig: {
        recordMode: 'recordContinuously',
        includedCategories: result.categories,
      },
    });
    active = true;
    await sleep(5000);
    await session.send('Tracing.end');
    active = false;
    let timer;
    const done = await Promise.race([
      complete,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('Trace completion deadline')), 10000);
      }),
    ]).finally(() => clearTimeout(timer));
    handle = done.stream;
    if (!handle) throw Error('No trace stream');
    fd = fs.openSync(file, 'w');
    while (true) {
      const chunk = await session.send('IO.read', { handle, size: 1024 * 1024 });
      const data = Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8');
      result.bytes += data.length;
      if (result.bytes > 128 * 1024 * 1024) throw Error('Trace exceeded 128 MiB evidence limit');
      fs.writeSync(fd, data);
      if (chunk.eof) break;
    }
    result.status = 'collected';
  } catch (error) {
    result.status = 'unavailable';
    result.reason = String(error);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (active) await session?.send('Tracing.end').catch(() => {});
    if (handle) await session?.send('IO.close', { handle }).catch(() => {});
    await session?.detach().catch(() => {});
  }
  return result;
}
module.exports = { captureTrace, wanted };
