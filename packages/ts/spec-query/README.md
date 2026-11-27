# @osdlc/spec-query

Minimal diffs against a defaults object, and a readable query string over them.

An app with thirty view options has one state object and two recurring
problems. Storing it whole freezes every saved record at the version that wrote
it. Putting it in the URL by hand means writing thirty encoders and thirty
parsers. This package solves both from one input you already have: the defaults.

**The defaults object is also the schema.** To decode `prune.minFanIn=3` you
need to know the field is a number, and `defaults.prune.minFanIn === 0` says so.
Booleans, numbers, strings and arrays all read their type off their own default.
No schema declaration, no decorators, no validation library.

Three levels. `diff`/`merge` are value-level and grammar-free — use them to
store only what differs. `encodeEntries`/`decodeEntries` put that difference in
raw query pairs, for a host that owns its own percent-encoding. `encode`/
`decode` escape those pairs into one query string. No dependencies, no DOM: the
codec uses only `encodeURIComponent` and `decodeURIComponent`, so it runs in a
browser app and in Node.

## Install

```sh
npm install @osdlc/spec-query
```

ESM only. Node.js 22 or later.

## When not to use it

- **A framework already owns your URL state.** If you are in React, Next.js, Vue
  or Nuxt and want a hook per key, [`nuqs`](https://nuqs.dev),
  [`state-in-url`](https://www.npmjs.com/package/state-in-url),
  `use-query-params` or `@vueuse/router` fit better: they bring the hook and the
  router binding, this package brings neither.
- **The state is not plain data.** Functions, class instances, `Date`s, `Map`s,
  `BigInt` and cyclic structures are outside the grammar. `diff`/`merge` treat a
  `Date` or class instance as one opaque value, and `BigInt` and cycles make
  `diff` throw. Serialise such state yourself first.
- **You need an opaque or very large payload in the URL.** The point here is a
  link a person can read. For a blob, store it elsewhere and put its id in the
  query.
- **You have no stable defaults object.** Everything is read against the
  defaults. If the defaults change between releases, so does the meaning of an
  old link; that is the trade for short links.

## How it compares

| Tool | What it is | How this differs |
| --- | --- | --- |
| `state-in-url` | Typed state with defaults in the URL; hooks for several frameworks, JSON-ish values | Covers the URL half. No value-level `diff`/`merge` for storage, no raw pairs for a router, no readable dotted keys |
| `nuqs` | Typed query state for React, one parser per key | React only, and every key declares its own parser. Here the defaults object is the schema |
| `use-query-params` | React hooks with per-parameter codecs | Same shape as `nuqs`: you declare each codec, there is no defaults-as-schema and no diff |
| `@vueuse/router` | `useRouteQuery`, one ref per key | Per key, for Vue. No whole-object state, no diff |
| `jsondiffpatch` | Diff and patch of JSON with its own delta format | A delta you cannot read or hand-edit, and no query-string half. Here the diff is a plain partial object |
| `qs`, `URLSearchParams` | Parse and stringify query strings | No defaults, no diff, no types: you write every encoder and parser |

Why this exists: the defaults object is the schema, so no per-key declarations;
`diff`/`merge` store only what differs, so saved records survive new options;
and the pair level (`encodeEntries`/`decodeEntries`) lets a router keep
ownership of percent-encoding.

## API

```ts
import {
  decode, decodeEntries, diff, encode, encodeEntries, merge, specQueryKeys,
} from '@osdlc/spec-query'

diff<T extends object>(value: T, defaults: T): DeepPartial<T>
merge<T extends object>(patch: unknown, defaults: T): T
encodeEntries<T extends object>(value: T, defaults: T, options?: CodecOptions): SpecEntry[]
decodeEntries<T extends object>(entries: Iterable<readonly [string, unknown]>, defaults: T, options?: CodecOptions): T
encode<T extends object>(value: T, defaults: T, options?: CodecOptions): string
decode<T extends object>(query: string, defaults: T, options?: CodecOptions): T
specQueryKeys<T extends object>(defaults: T, options?: CodecOptions): string[]

type DeepPartial<T> = { [K in keyof T]?: /* arrays whole, objects recursed, else T[K] */ }
interface SpecEntry {
  key: string
  value: string | string[] | null
}
interface CodecOptions {
  omit?: readonly string[]
  types?: Readonly<Record<string, FieldType>>
}
type FieldType = 'string' | 'number' | 'boolean' | 'string[]' | 'number[]' | 'boolean[]'
```

`diff` returns the recursive minimal difference against the defaults — `{}` when
nothing differs. Plain objects recurse; arrays and scalars compare whole (`NaN`
equals `NaN`, and `NaN` or `Infinity` never pass for `null`). A `Date`, `Map` or
class instance is one opaque value, compared by its JSON form. The result shares
no structure with the input.

`merge` is the inverse: a stored or decoded diff back to a whole value. It
recurses plain objects against the defaults, replaces arrays and scalars whole,
ignores keys the defaults do not have, copies a `Date` or class instance by
reference, and returns a fresh deep clone, so no
caller ends up sharing structure with `defaults`.

`encodeEntries` is `diff` flattened to query pairs of RAW text — nothing
escaped, no reserved characters. `decodeEntries` is its total inverse and takes
anything that iterates key/value tuples, so `Object.entries` of a router query
goes straight in. Reach for this pair when the host owns the percent-encoding —
see [Pairs, for a router](#pairs-for-a-router).

`encode` is the same diff escaped into one query string. `decode` is its total
inverse: unknown keys are ignored, a value that will not parse to the type its
default implies falls back to that default, duplicate keys take the last, and no
input string throws.

`specQueryKeys` lists every dotted key the codec owns, so a host can split its
route query into codec-owned and host-owned halves without keeping a second copy
of the list.

## Worked example

```ts
const DEFAULT_SPEC = {
  scope: null,
  containment: 'nested',
  facets: { kinds: [], query: '', searchMode: 'highlight' },
  prune: { hideIsolated: false, minFanIn: 0, transitiveReduction: false },
  edges: { markCycles: true },
}

encode(DEFAULT_SPEC, DEFAULT_SPEC)
// ''  — a default view is the empty string

const view = {
  ...DEFAULT_SPEC,
  containment: 'matrix',
  facets: { kinds: ['package'], query: 'vault,graph', searchMode: 'highlight' },
  prune: { hideIsolated: false, minFanIn: 3, transitiveReduction: true },
  edges: { markCycles: false },
}

encode(view, DEFAULT_SPEC)
// containment=matrix&facets.kinds=package&facets.query=vault%2Cgraph
//   &prune.minFanIn=3&prune.transitiveReduction=1&edges.markCycles=0

decode(encode(view, DEFAULT_SPEC), DEFAULT_SPEC)  // deep-equals `view`
```

Read that URL: the containment mode, one kind chip, a two-term search, a fan-in
floor of three, transitive reduction on, cycle marking off. Every option not
mentioned is at its default. You can eyeball it, hand-edit it, grep it in a log
and diff it in a bug report — which is the whole reason it is not a base64 blob.

## Pairs, for a router

`encode`/`decode` own the whole string, escaping included. A router does not
work that way: vue-router's `route.query` hands out DECODED values and
`navigateTo` re-encodes whatever it is given, so a codec-escaped token pushed
through it comes back double-escaped. The alternative is for the host to keep a
copy of this package's escaping rules, and a copy drifts.

`encodeEntries`/`decodeEntries` remove the need for one. Their values are raw:

```ts
encodeEntries(view, DEFAULT_SPEC)
// [ { key: 'facets.kinds', value: 'package,crate' },
//   { key: 'facets.query', value: '100% & rising' },
//   { key: 'scope', value: null } ]

const view = decodeEntries(Object.entries(route.query), DEFAULT_SPEC)
```

Three shapes of value, and nothing else:

| Shape | Meaning | What a router renders |
| --- | --- | --- |
| `string` | the field's text, verbatim | `key=value` |
| `string[]` | an array whose elements must not be joined | a repeated key |
| `null` | an explicit null | a valueless `key` |

An array takes the `string[]` shape only when an element contains `,`; otherwise
it is comma-joined, which is what keeps a link readable and hand-editable.
`decodeEntries` accepts both shapes, so `?facets.kinds=package,crate` typed by
hand still reads.

No character is reserved at this level. A value of exactly `~` is the text `~`,
not a null, and `%2C` is those three characters. That is the difference from the
joined grammar below, where both are escapes.

## Grammar

The joined string `encode`/`decode` write: pairs joined by `&`, each
`key=value`, no leading `?`. Only differing keys appear, so a default value
encodes to `""`.

**Keys** are the dotted path from the root of the defaults object: `containment`,
`prune.minFanIn`, `facets.searchMode`. Nested plain objects are never a value;
they flatten into dotted keys. A defaults key that itself contains a `.`
(`{ 'a.b': 1 }`) collides with the nested path `a` then `b`: both own the key
`a.b`, and on decode the later field in defaults order takes the value. Avoid
dots in defaults keys. Key order is the defaults object's own key order,
depth-first, so two equal values always produce byte-identical strings.

**Strings** are percent-encoded with `encodeURIComponent`, then `/`, `:` and
space→`+` relaxed back for readability. A literal `+` stays `%2B` and a literal
`~` is written `%7E`. Decode splits on the literal separators FIRST and then
decodes each piece, which is exactly how a comma inside a string is escaped: a
literal comma is `%2C` and therefore never splits an array. Keys use the same
encoding.

**Arrays** are comma-joined encoded elements: `facets.kinds=package,crate`. An
empty value (`key=`) is the empty array when the default is an array, and the
empty string when the default is a string.

**Booleans** are `1` and `0`: `prune.hideIsolated=1`, `edges.markCycles=0`. Both
directions must be writable because defaults go both ways. Decode also accepts
`true`/`false`; encode only ever emits `1`/`0`.

**Numbers** are written with `String(n)`, so a decimal, or an exponent form for
very large and small magnitudes (`1e+21`). On the way back they are parsed with
`Number()`, which is wider than what encode writes: hex (`0x10`), binary,
octal, exponent (`1e3`) and a leading `+` are all accepted. An empty or
whitespace-only value, and anything that is not finite (`Infinity`, `NaN`,
`1e999`) or does not parse, falls back to the default.

**Null** is the reserved token `~`: `scope=~` is an explicit null. In practice
`~` almost never appears on encode, because a field whose default is null is
absent from the query exactly when it is null.

## Null defaults

A `null` default is treated as a NULLABLE STRING. That is a stated convention,
not an inference — the defaults object is the schema for every other type and
cannot be for this one, so the library says out loud what it assumes rather than
pretending to derive it. For such a key, `decode` parses the value as a string
(with `~` meaning null) and `encode` writes the string form.

The escape hatch is `CodecOptions.types`:

```ts
decode(query, DEFAULTS, { types: { 'focus.until': 'number' } })
```

One map at the call site — not a schema declaration, not a validation library.
Note the two consequences. A null default with a non-string true type and no
override round-trips as a string: the value survives, the type does not. And
`diff`/`merge` are unaffected, because they compare and merge by value and need
no type at all.

## Reserved keys — `omit`

`omit` lists dotted keys the codec must neither write nor read. Two reasons to
reach for it:

- **Another owner holds the key.** A router or a frame may already own `page`,
  `sort` or `tab` in the same query. Two writers on one value is the
  desync this package exists to remove, so hand the key to its owner and keep
  ONE shared options constant across the encode and decode call sites — two
  `omit` lists that drift apart reintroduce the bug.
- **The field is too large for a URL.** A fold state seeded from a payload can
  run to hundreds of ids.

Naming a group omits its whole subtree: `omit: ['prune']` drops
`prune.minFanIn` with it.

## Limits worth knowing

- **The round trip holds over the supported domain, not over all of `T`.** A
  nested array of objects, a non-finite number and a lone surrogate (in a value
  or a key) are outside what the grammar carries. `encode` DROPS such a value
  rather than throwing; `decode` falls back to the default. `BigInt` and cyclic
  values are not dropped: `diff` throws on them. The test suite generates from the
  supported domain explicitly for exactly this reason.
- **A `null` over a non-null default does not round-trip.** `encode` writes
  `key=~`, but `decode` accepts a null only where the default is null, so the
  default comes back.
- **A malformed escape stays literal.** `decode('s=a%20b%')` reads `a b%`: valid
  `%XX` runs decode and only the malformed part is kept as written.
- **`[""]` and `[]` share one encoding.** Both are `key=`, and both decode to
  `[]`.
- **A one-element array whose element contains `,` cannot survive a router.**
  `encodeEntries` gives it the `string[]` shape, but a repeated key of length one
  is a single value once the router has written and re-read the URL, so it splits
  on the way back. Longer arrays are safe, and the joined `encode`/`decode` pair
  escapes the comma as `%2C` and is safe at every length.
- **An array's element type comes from its first DEFAULT element**, so an empty
  default array is `string[]`. Correct for the common case of a set of string
  ids, and silently wrong for a `number[]` field whose default is `[]`.
  `CodecOptions.types` is the fix, and the failure is quiet until someone
  applies it.

## Tests

```sh
pnpm install      # once, from the repository root
pnpm run test     # vitest, from this directory
```

## Licence

`MIT OR Apache-2.0`, at your option. See [LICENSE-MIT](./LICENSE-MIT) and [LICENSE-APACHE](./LICENSE-APACHE).
