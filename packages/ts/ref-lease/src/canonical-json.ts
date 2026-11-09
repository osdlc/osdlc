/**
 * The deterministic JSON encoding of a value: equal values encode to equal
 * bytes, so equal payloads hash to the same git blob.
 *
 * - Object keys are sorted by UTF-16 code unit, at every depth.
 * - No whitespace: `,` and `:` with no space after them.
 * - Strings, numbers, booleans and `null` are written as `JSON.stringify`
 *   writes them: non-ASCII characters as UTF-8, not `\uXXXX`; numbers in
 *   JavaScript's shortest form (`1e+21`, `1.5`, `0` for `-0`); `NaN` and
 *   `Infinity` as `null`.
 * - No trailing newline.
 *
 * Another implementation of the protocol must write numbers the same way to
 * produce the same bytes; `tests/conformance/canonical-json.json` has the cases.
 *
 * `JSON.stringify` over a key-sorted copy is not enough: a JavaScript engine
 * orders integer-like keys (`"1"`, `"10"`, `"2"`) numerically whatever the
 * insertion order. Objects are therefore written key by key here.
 *
 * A value with a `toJSON` method is encoded as what it returns, as
 * `JSON.stringify` does, so a `Date` becomes its ISO string.
 *
 * @throws TypeError for a value JSON cannot hold: `undefined`, a function, a
 *   symbol or a bigint, at any depth; an object that is not a plain object or
 *   an array (a `Map`, a `Set`, a class instance) and has no `toJSON`; or a
 *   value that contains itself.
 */
export function canonicalJson(value: unknown): string {
  return encode(value, new Set())
}

function encode(value: unknown, path: Set<object>): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'boolean':
    case 'string':
    case 'number':
      return JSON.stringify(value)
    case 'object': {
      const toJSON = (value as { toJSON?: unknown }).toJSON
      if (typeof toJSON === 'function') return encode(toJSON.call(value), path)
      if (path.has(value)) throw new TypeError('canonicalJson: the value contains itself')
      path.add(value)
      try {
        if (Array.isArray(value)) return '[' + value.map((v) => encode(v, path)).join(',') + ']'
        const proto = Object.getPrototypeOf(value) as unknown
        if (proto !== Object.prototype && proto !== null) {
          const kind = (value as object).constructor?.name ?? 'object'
          throw new TypeError(`canonicalJson: a ${kind} is not a plain object`)
        }
        const obj = value as Record<string, unknown>
        const parts: string[] = []
        for (const key of Object.keys(obj).sort()) {
          parts.push(JSON.stringify(key) + ':' + encode(obj[key], path))
        }
        return '{' + parts.join(',') + '}'
      } finally {
        path.delete(value)
      }
    }
    default:
      throw new TypeError(`canonicalJson: unsupported value type ${typeof value}`)
  }
}
