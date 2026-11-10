/** Independent scenarios; each checkpoint scenario retains all three sequential rounds. */
const SUITES = ['v6', 'title', 'profiles', 'settings', 'checkpoint'];
const DEVICES = { desktop: [1280, 800], mobile: [390, 844] };
function capturePlan(args = []) {
  args = args.flatMap((arg) =>
    arg.startsWith('--') && arg.includes('=')
      ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]
      : [arg],
  );
  let suite = 'all',
    device = 'all';
  for (let i = 0; i < args.length; i += 2) {
    const value = args[i + 1];
    if (!value || !['--suite', '--device'].includes(args[i]))
      throw new Error('Use --suite NAME --device NAME');
    if (args[i] === '--suite') suite = value;
    else device = value;
  }
  const suites = suite === 'all' ? SUITES : suite === 'legacy' ? SUITES.slice(1) : [suite];
  const devices = device === 'all' ? Object.keys(DEVICES) : [device];
  if (suites.some((value) => !SUITES.includes(value))) throw new Error(`Unknown suite: ${suite}`);
  if (devices.some((value) => !Object.hasOwn(DEVICES, value)))
    throw new Error(`Unknown device: ${device}`);
  return suites.flatMap((suite) =>
    devices.map((device) => ({
      suite,
      device,
      width: DEVICES[device][0],
      height: DEVICES[device][1],
    })),
  );
}
module.exports = { capturePlan, SUITES };
