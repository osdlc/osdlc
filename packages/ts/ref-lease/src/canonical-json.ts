/**
 * The deterministic JSON encoding of a value: equal values encode to equal
 * bytes, so equal payloads hash to the same git blob.
 *
 * - Object keys are sorted by UTF-16 code unit, at every depth.
 * - No whitespace: `,` and `:` with no space after them.
 * - Non-ASCII characters are written as UTF-8, not escaped to `\uXXXX`.
 * - No trailing newline.
 *
 * This is the encoding of Python's
 * `json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)`
 * for the same input, except that Python sorts keys by code point; the two
 * differ only for keys holding characters outside the Basic Multilingual Plane.
 *
 * `JSON.stringify` over a key-sorted copy is not enough: a JavaScript engine
 * orders integer-like keys (`"1"`, `"10"`, `"2"`) numerically whatever the
 * insertion order. Objects are therefore written key by key here.
 *
 * @throws TypeError for a value JSON cannot hold: `undefined`, a function, a
 *   symbol or a bigint, at any depth, or a non-finite number.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return JSON.stringify(value)
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError(`canonicalJson: non-finite number ${String(value)}`)
      }
      return JSON.stringify(value)
    case 'object': {
      if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
      const obj = value as Record<string, unknown>
      const parts: string[] = []
      for (const key of Object.keys(obj).sort()) {
        parts.push(JSON.stringify(key) + ':' + canonicalJson(obj[key]))
      }
      return '{' + parts.join(',') + '}'
    }
    default:
      throw new TypeError(`canonicalJson: unsupported value type ${typeof value}`)
  }
}
