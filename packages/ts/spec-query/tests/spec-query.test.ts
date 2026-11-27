import { describe, expect, test } from 'vitest'

import {
  decode,
  decodeEntries,
  diff,
  encode,
  encodeEntries,
  merge,
  specQueryKeys,
  type CodecOptions,
} from '../src/index.ts'

/** A stand-in for a real view spec: nested groups, every supported leaf type. */
interface Spec {
  scope: string | null
  containment: string
  facets: {
    kinds: string[]
    query: string
    searchMode: string
  }
  focus: { id: string | null; hops: number }
  prune: { hideIsolated: boolean; minFanIn: number; transitiveReduction: boolean }
  edges: { markCycles: boolean; weights: number[]; flags: boolean[] }
  collapsed: string[]
}

const DEFAULTS: Spec = {
  scope: null,
  containment: 'nested',
  facets: { kinds: [], query: '', searchMode: 'highlight' },
  focus: { id: null, hops: 0 },
  prune: { hideIsolated: false, minFanIn: 0, transitiveReduction: false },
  edges: { markCycles: true, weights: [1, 2], flags: [false] },
  collapsed: [],
}

const spec = (patch: unknown = {}): Spec => merge(patch, DEFAULTS)

describe('diff', () => {
  test('a default value differs in nothing', () => {
    expect(diff(spec(), DEFAULTS)).toEqual({})
  })

  test('only the changed leaves survive, nested groups kept', () => {
    const value = spec({ prune: { minFanIn: 3 }, facets: { query: 'vault' } })
    expect(diff(value, DEFAULTS)).toEqual({ facets: { query: 'vault' }, prune: { minFanIn: 3 } })
  })

  test('arrays compare whole', () => {
    expect(diff(spec({ edges: { weights: [1, 2] } }), DEFAULTS)).toEqual({})
    expect(diff(spec({ edges: { weights: [1] } }), DEFAULTS)).toEqual({ edges: { weights: [1] } })
  })
})

describe('merge', () => {
  test('is the inverse of diff', () => {
    const value = spec({ scope: 'packages/ts', edges: { markCycles: false } })
    expect(merge(diff(value, DEFAULTS), DEFAULTS)).toEqual(value)
  })

  test('ignores keys the defaults do not have', () => {
    expect(merge({ nope: 1, facets: { nope: 2 } }, DEFAULTS)).toEqual(DEFAULTS)
  })

  test('never mutates or shares structure with the defaults', () => {
    const before = structuredClone(DEFAULTS)
    const merged = merge({ facets: { kinds: ['package'] } }, DEFAULTS)
    merged.facets.kinds.push('crate')
    merged.edges.weights.push(9)
    expect(DEFAULTS).toEqual(before)
    expect(merged.edges.weights).not.toBe(DEFAULTS.edges.weights)
  })

  test('a non-object patch yields the defaults', () => {
    expect(merge(null, DEFAULTS)).toEqual(DEFAULTS)
    expect(merge('nonsense', DEFAULTS)).toEqual(DEFAULTS)
  })
})

describe('encode', () => {
  test('a default value encodes to the empty string', () => {
    expect(encode(spec(), DEFAULTS)).toBe('')
  })

  test('dotted keys, in defaults order, depth-first', () => {
    const value = spec({
      containment: 'matrix',
      facets: { kinds: ['package'], query: 'vault,graph' },
      prune: { minFanIn: 3, transitiveReduction: true },
      edges: { markCycles: false },
    })
    expect(encode(value, DEFAULTS)).toBe(
      'containment=matrix&facets.kinds=package&facets.query=vault%2Cgraph' +
        '&prune.minFanIn=3&prune.transitiveReduction=1&edges.markCycles=0',
    )
  })

  test('booleans go both ways', () => {
    expect(encode(spec({ prune: { hideIsolated: true } }), DEFAULTS)).toBe('prune.hideIsolated=1')
    expect(encode(spec({ edges: { markCycles: false } }), DEFAULTS)).toBe('edges.markCycles=0')
  })

  test('an empty array is a bare key', () => {
    expect(encode(spec({ edges: { weights: [] } }), DEFAULTS)).toBe('edges.weights=')
  })

  test('slash, colon and space stay readable; plus stays escaped', () => {
    const value = spec({ scope: 'packages/ts:a b+c' })
    expect(encode(value, DEFAULTS)).toBe('scope=packages/ts:a+b%2Bc')
  })

  test('a literal tilde is escaped, so the null token stays unambiguous', () => {
    expect(encode(spec({ scope: '~' }), DEFAULTS)).toBe('scope=%7E')
  })

  test('a value outside the domain is dropped, not thrown on', () => {
    const value = { ...spec(), focus: { id: null, hops: Number.POSITIVE_INFINITY } }
    expect(encode(value, DEFAULTS)).toBe('')
  })

  test('omit keeps a key out of the query entirely', () => {
    const options: CodecOptions = { omit: ['containment', 'collapsed'] }
    const value = spec({ containment: 'matrix', collapsed: ['a'], prune: { minFanIn: 2 } })
    expect(encode(value, DEFAULTS, options)).toBe('prune.minFanIn=2')
  })

  test('omitting a group omits its subtree', () => {
    const value = spec({ prune: { minFanIn: 2 }, facets: { query: 'x' } })
    expect(encode(value, DEFAULTS, { omit: ['prune'] })).toBe('facets.query=x')
  })
})

describe('decode', () => {
  test('reads a query with or without a leading question mark', () => {
    expect(decode('?prune.minFanIn=3', DEFAULTS).prune.minFanIn).toBe(3)
    expect(decode('prune.minFanIn=3', DEFAULTS).prune.minFanIn).toBe(3)
  })

  test('the empty query is the default value', () => {
    expect(decode('', DEFAULTS)).toEqual(DEFAULTS)
  })

  test('unknown keys are ignored', () => {
    expect(decode('nope=1&facets.nope=2&prune.minFanIn=4', DEFAULTS)).toEqual(
      spec({ prune: { minFanIn: 4 } }),
    )
  })

  test('an omitted key is ignored even when present', () => {
    const decoded = decode('containment=matrix&prune.minFanIn=1', DEFAULTS, {
      omit: ['containment'],
    })
    expect(decoded.containment).toBe('nested')
    expect(decoded.prune.minFanIn).toBe(1)
  })

  test('an unparseable value falls back to the default', () => {
    const decoded = decode(
      'prune.minFanIn=lots&prune.hideIsolated=maybe&edges.weights=1,x',
      DEFAULTS,
    )
    expect(decoded.prune.minFanIn).toBe(0)
    expect(decoded.prune.hideIsolated).toBe(false)
    expect(decoded.edges.weights).toEqual([1, 2])
  })

  test('booleans accept true/false as well as 1/0', () => {
    expect(decode('prune.hideIsolated=true', DEFAULTS).prune.hideIsolated).toBe(true)
    expect(decode('edges.markCycles=false', DEFAULTS).edges.markCycles).toBe(false)
  })

  test('duplicate keys take the last', () => {
    expect(decode('prune.minFanIn=1&prune.minFanIn=7', DEFAULTS).prune.minFanIn).toBe(7)
  })

  test('a bare key is an empty value', () => {
    expect(decode('facets.kinds', DEFAULTS).facets.kinds).toEqual([])
    expect(decode('facets.query', DEFAULTS).facets.query).toBe('')
  })

  test('the empty value is the empty array for an array, the empty string for a string', () => {
    expect(decode('edges.weights=', DEFAULTS).edges.weights).toEqual([])
    expect(decode('facets.query=', DEFAULTS).facets.query).toBe('')
  })

  test('separators inside a string value survive', () => {
    const value = spec({ facets: { query: 'a,b&c=d' } })
    const query = encode(value, DEFAULTS)
    expect(query).toBe('facets.query=a%2Cb%26c%3Dd')
    expect(decode(query, DEFAULTS).facets.query).toBe('a,b&c=d')
  })

  test('nested groups round-trip without wiping their siblings', () => {
    const decoded = decode('facets.query=vault', DEFAULTS)
    expect(decoded.facets).toEqual({ kinds: [], query: 'vault', searchMode: 'highlight' })
  })
})

describe('null defaults', () => {
  test('a null default is a nullable string', () => {
    expect(decode('scope=packages/ts', DEFAULTS).scope).toBe('packages/ts')
    expect(decode('scope=~', DEFAULTS).scope).toBe(null)
    expect(encode(spec({ scope: 'a' }), DEFAULTS)).toBe('scope=a')
    expect(encode(spec({ scope: null }), DEFAULTS)).toBe('')
  })

  test('the tilde token is not null for a non-nullable field', () => {
    expect(decode('facets.query=~', DEFAULTS).facets.query).toBe('')
    expect(decode('prune.minFanIn=~', DEFAULTS).prune.minFanIn).toBe(0)
  })

  test('types states the type a null default cannot imply', () => {
    const defaults = { until: null as number | null }
    const options: CodecOptions = { types: { until: 'number' } }
    expect(decode('until=42', defaults, options).until).toBe(42)
    expect(decode('until=~', defaults, options).until).toBe(null)
    expect(encode({ until: 42 }, defaults, options)).toBe('until=42')
  })

  test('types also fixes an array whose empty default implies the wrong element', () => {
    const defaults = { ids: [] as number[] }
    const options: CodecOptions = { types: { ids: 'number[]' } }
    expect(decode('ids=1,2', defaults, options).ids).toEqual([1, 2])
    expect(decode('ids=1,2', defaults).ids).toEqual(['1', '2'] as never)
  })
})

describe('specQueryKeys', () => {
  test('every dotted key the codec owns, in encode order', () => {
    expect(specQueryKeys(DEFAULTS, { omit: ['collapsed'] })).toEqual([
      'scope',
      'containment',
      'facets.kinds',
      'facets.query',
      'facets.searchMode',
      'focus.id',
      'focus.hops',
      'prune.hideIsolated',
      'prune.minFanIn',
      'prune.transitiveReduction',
      'edges.markCycles',
      'edges.weights',
      'edges.flags',
    ])
  })
})

describe('decode is total', () => {
  const hostile = [
    '',
    '?',
    '&&&',
    '=',
    '===',
    '?=1',
    'scope',
    'scope=',
    'scope=%',
    'scope=%E0%A4%A',
    'scope=%zz',
    '%zz=1',
    'facets.kinds=%2C,%,%2C',
    'prune.minFanIn=%E0',
    'prune.minFanIn=NaN',
    'prune.minFanIn=1e999',
    'edges.weights=,,,',
    'edges.flags=1,0,maybe',
    '__proto__=1',
    'constructor.prototype.polluted=1',
    'facets.__proto__=1',
    'a'.repeat(10_000),
    `scope=${'x'.repeat(5_000)}`,
    '\u0000=\u0000',
    'scope=\ud800',
  ]

  for (const query of hostile) {
    test(`no throw: ${JSON.stringify(query.slice(0, 40))}`, () => {
      expect(() => decode(query, DEFAULTS)).not.toThrow()
    })
  }

  test('prototype keys do not escape into the result', () => {
    const decoded = decode('__proto__=1&constructor.prototype.polluted=1', DEFAULTS)
    expect(decoded).toEqual(DEFAULTS)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('the pair level', () => {
  test('values are raw — nothing is escaped', () => {
    const value = spec({ scope: 'a/b:c d', facets: { query: '100% & rising' } })
    expect(encodeEntries(value, DEFAULTS)).toEqual([
      { key: 'scope', value: 'a/b:c d' },
      { key: 'facets.query', value: '100% & rising' },
    ])
  })

  test('an explicit null is `null`, not a token', () => {
    const defaults = { scope: 'root' as string | null, focus: { id: null as string | null } }
    expect(encodeEntries({ scope: null, focus: { id: null } }, defaults)).toEqual([
      { key: 'scope', value: null },
    ])
    expect(decodeEntries([['focus.id', null]], defaults).focus.id).toBe(null)
  })

  test('a literal tilde survives, in a string field and a nullable one', () => {
    const value = spec({ scope: '~', facets: { query: '~' } })
    const entries = encodeEntries(value, DEFAULTS)
    expect(entries).toEqual([
      { key: 'scope', value: '~' },
      { key: 'facets.query', value: '~' },
    ])
    const back = decodeEntries(
      entries.map((e) => [e.key, e.value] as const),
      DEFAULTS,
    )
    expect(back.scope).toBe('~')
    expect(back.facets.query).toBe('~')
  })

  test('an array is comma-joined while no element holds a comma', () => {
    const value = spec({ facets: { kinds: ['package', 'crate'] } })
    expect(encodeEntries(value, DEFAULTS)).toEqual([
      { key: 'facets.kinds', value: 'package,crate' },
    ])
  })

  test('an element holding a comma forces the repeated-key form', () => {
    const value = spec({ facets: { kinds: ['a,b', 'c'] } })
    const entries = encodeEntries(value, DEFAULTS)
    expect(entries).toEqual([{ key: 'facets.kinds', value: ['a,b', 'c'] }])
    expect(decodeEntries([['facets.kinds', ['a,b', 'c']]], DEFAULTS).facets.kinds).toEqual([
      'a,b',
      'c',
    ])
  })

  test('both array shapes decode', () => {
    expect(decodeEntries([['facets.kinds', 'package,crate']], DEFAULTS).facets.kinds).toEqual([
      'package',
      'crate',
    ])
    expect(decodeEntries([['facets.kinds', ['package', 'crate']]], DEFAULTS).facets.kinds).toEqual([
      'package',
      'crate',
    ])
    expect(decodeEntries([['facets.kinds', '']], DEFAULTS).facets.kinds).toEqual([])
  })

  test('a repeated scalar key takes the last', () => {
    expect(decodeEntries([['prune.minFanIn', ['1', '5']]], DEFAULTS).prune.minFanIn).toBe(5)
  })

  test('unknown keys and unparseable values fall back to the defaults', () => {
    const back = decodeEntries(
      [
        ['prune.somethingNewer', 'x'],
        ['prune.minFanIn', 'not-a-number'],
        ['prune.hideIsolated', 'maybe'],
        ['scope', undefined],
      ],
      DEFAULTS,
    )
    expect(back).toEqual(DEFAULTS)
  })

  test('`omit` holds at the pair level too', () => {
    const options: CodecOptions = { omit: ['collapsed', 'containment'] }
    const value = spec({ containment: 'matrix', collapsed: ['a'], prune: { minFanIn: 3 } })
    expect(encodeEntries(value, DEFAULTS, options)).toEqual([{ key: 'prune.minFanIn', value: '3' }])
    expect(decodeEntries([['containment', 'matrix']], DEFAULTS, options).containment).toBe('nested')
  })

  test('the round trip holds at the pair level too', () => {
    const next = rng(0xfa12)
    for (let i = 0; i < 200; i += 1) {
      const value = genLike(DEFAULTS, next) as Spec
      const entries = encodeEntries(value, DEFAULTS).map((e) => [e.key, e.value] as const)
      expect(decodeEntries(entries, DEFAULTS)).toEqual(value)
    }
  })
})

// --- the round-trip property ----------------------------------------------
//
// `decode(encode(v, d), d) === v` is FALSE over all of T — a nested array of
// objects, a non-finite number and a lone surrogate all fall outside what the
// grammar carries. The honest property is over values drawn from the SUPPORTED
// domain, so the generator below builds that domain explicitly rather than
// pretending to cover T. Seeded, so a failure reproduces from its seed.

/** mulberry32 — a small deterministic PRNG, since the repo carries no fast-check. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Characters that have to survive: the separators, the null token, the space. */
const ALPHABET = [
  ...'abcXYZ019',
  ' ',
  ',',
  '&',
  '=',
  '?',
  '#',
  '+',
  '%',
  '~',
  '/',
  ':',
  '.',
  '\\',
  '"',
  "'",
  '<',
  'é',
  '中',
  '\u{1f600}',
]

function genString(next: () => number): string {
  const length = Math.floor(next() * 8)
  let out = ''
  for (let i = 0; i < length; i += 1) out += ALPHABET[Math.floor(next() * ALPHABET.length)]
  return out
}

function genNumber(next: () => number): number {
  const kind = Math.floor(next() * 4)
  if (kind === 0) return Math.floor(next() * 200) - 100
  if (kind === 1) return 0
  if (kind === 2) return Math.round((next() * 1000 - 500) * 1000) / 1000
  return next() * 1e12
}

/**
 * A value of the same shape and leaf types as `base`.
 *
 * Array elements are never the empty string: `[""]` and `[]` share one
 * encoding (`key=`), a documented ambiguity of the grammar.
 */
function genLike(base: unknown, next: () => number): unknown {
  if (isPlainObject(base)) {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(base)) {
      out[key] = genLike(value, next)
    }
    return out
  }
  if (base === null) return next() < 0.3 ? null : genString(next)
  if (Array.isArray(base)) {
    const element = base.length > 0 ? base[0] : ''
    const length = Math.floor(next() * 4)
    const out: unknown[] = []
    for (let i = 0; i < length; i += 1) {
      let item = genLike(element, next)
      while (item === '') item = genString(next) || 'x'
      out.push(item)
    }
    return out
  }
  if (typeof base === 'number') return genNumber(next)
  if (typeof base === 'boolean') return next() < 0.5
  return genString(next)
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

describe('round-trip property', () => {
  test('decode(encode(v, d), d) equals v over 500 generated values', () => {
    const next = rng(0x5eed)
    for (let i = 0; i < 500; i += 1) {
      const value = genLike(DEFAULTS, next) as Spec
      const query = encode(value, DEFAULTS)
      const back = decode(query, DEFAULTS)
      expect(back).toEqual(value)
    }
  })

  test('encoding is deterministic — equal values give byte-identical strings', () => {
    const next = rng(0xd06)
    for (let i = 0; i < 100; i += 1) {
      const value = genLike(DEFAULTS, next) as Spec
      expect(encode(value, DEFAULTS)).toBe(encode(structuredClone(value), DEFAULTS))
    }
  })

  test('the property holds with keys omitted, for the keys that remain', () => {
    const options: CodecOptions = { omit: ['collapsed', 'containment'] }
    const next = rng(0xbeef)
    for (let i = 0; i < 200; i += 1) {
      const value = genLike(DEFAULTS, next) as Spec
      const back = decode(encode(value, DEFAULTS, options), DEFAULTS, options)
      expect(back).toEqual({
        ...value,
        containment: DEFAULTS.containment,
        collapsed: DEFAULTS.collapsed,
      })
    }
  })

  test('diff/merge round-trip over the same generated values', () => {
    const next = rng(0xf00d)
    for (let i = 0; i < 500; i += 1) {
      const value = genLike(DEFAULTS, next) as Spec
      expect(merge(diff(value, DEFAULTS), DEFAULTS)).toEqual(value)
    }
  })
})
