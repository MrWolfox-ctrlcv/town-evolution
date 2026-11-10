/** Lossless object-graph codec. Shader strings share lines, never rewrite source text. */
function pack(root) {
  const lines = [],
    lineIds = new Map(),
    nodes = [],
    seen = new Map();
  const text = (value) => {
    if (!value.includes('\n')) return value;
    return [
      'l',
      value.split('\n').map((line) => {
        if (!lineIds.has(line)) {
          lineIds.set(line, lines.length);
          lines.push(line);
        }
        return lineIds.get(line);
      }),
    ];
  };
  function encode(value) {
    if (value === undefined) return ['u'];
    if (typeof value === 'string') return text(value);
    if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0)))
      return ['n', String(value === 0 ? '-0' : value)];
    if (value === null || ['boolean', 'number'].includes(typeof value)) return value;
    if (typeof value !== 'object') throw new Error('Unsupported effect value type');
    if (seen.has(value)) return ['r', seen.get(value)];
    const prototype = Object.getPrototypeOf(value);
    if (!Object.isExtensible(value)) throw new Error('Unsupported non-extensible effect object');
    const kind =
      Array.isArray(value) && prototype === Array.prototype
        ? 'a'
        : prototype === Set.prototype
          ? 's'
          : prototype === Object.prototype
            ? 'o'
            : prototype === null
              ? 'z'
              : null;
    if (!kind) throw new Error('Unsupported effect object prototype');
    const id = nodes.length;
    seen.set(value, id);
    nodes.push(null);
    const props = Reflect.ownKeys(value).map((key) => {
      if (typeof key !== 'string') throw new Error('Unsupported effect symbol key');
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (!Object.hasOwn(d, 'value')) throw new Error('Unsupported effect accessor');
      return [key, encode(d.value), +d.enumerable | (+d.writable << 1) | (+d.configurable << 2)];
    });
    nodes[id] = [kind, props, kind === 's' ? [...value].map(encode) : null];
    return ['r', id];
  }
  const value = encode(root);
  return { version: 1, lines, nodes, root: value };
}
function unpack(packed) {
  if (
    packed?.version !== 1 ||
    !Array.isArray(packed.lines) ||
    !packed.lines.every((line) => typeof line === 'string') ||
    !Array.isArray(packed.nodes)
  )
    throw new Error('Invalid effect cache codec');
  const nodes = packed.nodes.map(([kind]) => {
    if (kind === 'a') return [];
    if (kind === 's') return new Set();
    if (kind === 'o') return {};
    if (kind === 'z') return Object.create(null);
    throw new Error('Invalid effect cache node');
  });
  function decode(value) {
    if (!Array.isArray(value)) {
      if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
      throw new Error('Invalid effect cache value');
    }
    const [tag, data] = value;
    if (tag === 'u' && value.length === 1) return undefined;
    if (tag === 'n' && ['-0', 'NaN', 'Infinity', '-Infinity'].includes(data)) return Number(data);
    if (tag === 'r' && Number.isInteger(data) && data >= 0 && data < nodes.length)
      return nodes[data];
    if (tag === 'l' && Array.isArray(data))
      return data
        .map((id) => {
          if (!Number.isInteger(id) || id < 0 || id >= packed.lines.length)
            throw new Error('Invalid effect cache line reference');
          return packed.lines[id];
        })
        .join('\n');
    throw new Error('Invalid effect cache reference');
  }
  packed.nodes.forEach(([kind, props, entries], index) => {
    if (!Array.isArray(props)) throw new Error('Invalid effect cache properties');
    for (const [key, value, flags] of props) {
      if (typeof key !== 'string' || !Number.isInteger(flags) || flags < 0 || flags > 7)
        throw new Error('Invalid effect cache descriptor');
      Object.defineProperty(nodes[index], key, {
        value: decode(value),
        enumerable: !!(flags & 1),
        writable: !!(flags & 2),
        configurable: !!(flags & 4),
      });
    }
    if (kind === 's') for (const value of entries) nodes[index].add(decode(value));
  });
  return decode(packed.root);
}
module.exports = { pack, unpack };
