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
 * @throws TypeError for a value JSON cannot hold: `undefined`, a function, a
 *   symbol or a bigint, at any depth.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  switch (typeof value) {
    case 'boolean':
    case 'string':
    case 'number':
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
