/**
 * Tests for the per-key meta ({@link checkConfigMeta} and friends), the
 * vocabulary factory (`../src/vocabulary.ts`) and the completeness test kit
 * (`../src/meta-kit.ts`), against the fake tool's vocabulary in `./support.ts`.
 */

import { describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import {
  applierAndReservedProblems,
  consumerProblems,
  enforcementProblems,
  machineLayerKeys,
} from '../src/meta-kit.ts'
import {
  applierOf,
  appliesViaSchema,
  checkConfigMeta,
  isReserved,
  readConfigMeta,
} from '../src/meta.ts'
import { defineConfigVocabulary } from '../src/vocabulary.ts'

import { META as VALID, vocabulary } from './support.ts'

/** The library's own source root, which the fixture consumers below are relative to. */
const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src')

const LEVELS = vocabulary.spec.enforcement

describe('checkConfigMeta', () => {
  test('reports a key with no meta', () => {
    const issues = checkConfigMeta({
      good: z.string().describe('A described key.').meta(VALID),
      bare: z.string().describe('Described but no meta.'),
    })
    expect(issues.map((i) => i.key)).toEqual(['bare'])
  })

  test('reports meta set before a wrapping call (the wrapper carries none)', () => {
    const issues = checkConfigMeta({
      early: z.string().describe('Meta set too early.').meta(VALID).optional(),
    })
    expect(issues.map((i) => i.key)).toEqual(['early'])
  })

  test('reports a key with meta but no description', () => {
    const issues = checkConfigMeta({ undescribed: z.string().meta(VALID) })
    expect(issues).toHaveLength(1)
    expect(issues[0]!.problem).toContain('description')
  })

  const shapeOf = (cases: Record<string, Record<string, unknown>>) => {
    const s: Record<string, z.ZodType> = {}
    for (const [k, m] of Object.entries(cases)) s[k] = z.string().describe('d').meta(m)
    return s
  }
  const badKeys = (issues: { key: string }[]) => issues.map((i) => i.key).sort()

  const STRUCTURAL: Record<string, Record<string, unknown>> = {
    emptyCategory: { ...VALID, category: '' },
    emptyLayers: { ...VALID, layers: [] },
    dupRunsIn: { ...VALID, runs_in: ['cli', 'cli'] },
    badConsumer: { ...VALID, consumers: ['server run'] },
    emptyPlanned: { ...VALID, consumers: ['planned:'] },
    badAppliesVia: { ...VALID, applies_via: 'apply' },
    typoField: { ...VALID, run_in: ['cli'] },
  }
  const OUT_OF_VOCABULARY: Record<string, Record<string, unknown>> = {
    badCategory: { ...VALID, category: 'misc' },
    badLayer: { ...VALID, layers: ['project', 'subtree'] },
    badApplier: { ...VALID, applies_via: 'apply:bogus' },
    badEnforcement: { ...VALID, enforcement: 'enforced' },
    badRunContext: { ...VALID, runs_in: ['hook'] },
  }

  test('with no vocabulary, reports malformed structure and accepts any non-empty term', () => {
    expect(badKeys(checkConfigMeta(shapeOf(STRUCTURAL)))).toEqual(Object.keys(STRUCTURAL).sort())
    expect(checkConfigMeta(shapeOf(OUT_OF_VOCABULARY))).toEqual([])
  })

  test('with a vocabulary, also reports every term it does not declare', () => {
    const all = { ...STRUCTURAL, ...OUT_OF_VOCABULARY }
    expect(badKeys(checkConfigMeta(shapeOf(all), vocabulary))).toEqual(Object.keys(all).sort())
    expect(badKeys(vocabulary.checkMeta(shapeOf(all)))).toEqual(Object.keys(all).sort())
    expect(vocabulary.checkMeta(shapeOf({ ok: { ...VALID, applies_via: 'apply:shims' } }))).toEqual(
      [],
    )
  })

  test('readConfigMeta throws naming every bad key', () => {
    expect(() => readConfigMeta({ a: z.string(), b: z.number() })).toThrow(/a: .*\n.*b: /)
    expect(() => vocabulary.readMeta(shapeOf({ c: { ...VALID, category: 'misc' } }))).toThrow(
      /c: category/,
    )
  })

  test('applierOf and isReserved', () => {
    expect(applierOf(VALID)).toBeNull()
    expect(applierOf({ applies_via: 'apply:shims' })).toBe('shims')
    expect(isReserved(VALID)).toBe(false)
    expect(isReserved({ consumers: ['planned:later'] })).toBe(true)
  })
})

describe('defineConfigVocabulary', () => {
  const base = {
    categories: ['core'],
    appliers: [],
    layers: ['project', 'local', 'machine'],
    runContexts: ['cli'],
    enforcement: { levels: ['soft'] },
  } as const

  test('builds enum schemas over the given terms, in the given order', () => {
    expect(vocabulary.CategorySchema.options).toEqual(['core', 'extras'])
    expect(vocabulary.LayerSchema.safeParse('subtree').success).toBe(false)
    expect(vocabulary.AppliesViaSchema.safeParse('apply:shims').success).toBe(true)
    expect(vocabulary.AppliesViaSchema.safeParse('apply:other').success).toBe(false)
  })

  test('the applies_via JSON Schema states the `apply:` pattern', () => {
    const named = z.toJSONSchema(vocabulary.AppliesViaSchema) as { anyOf: object[] }
    expect(named.anyOf).toEqual([
      { const: 'read', type: 'string' },
      { type: 'string', pattern: '^apply:(shims)$' },
    ])
    const open = z.toJSONSchema(appliesViaSchema(z.string().min(1))) as { anyOf: object[] }
    expect(JSON.stringify(open)).toContain('^apply:')
    expect(appliesViaSchema(z.string().min(1)).safeParse('apply:').success).toBe(false)
    expect(appliesViaSchema(z.string().min(1)).safeParse('apply:x').success).toBe(true)
  })

  test('with no appliers, only `read` passes', () => {
    const v = defineConfigVocabulary(base)
    expect(v.AppliesViaSchema.safeParse('read').success).toBe(true)
    expect(v.AppliesViaSchema.safeParse('apply:x').success).toBe(false)
  })

  test('refuses an empty term', () => {
    expect(() => defineConfigVocabulary({ ...base, categories: ['core', ''] })).toThrow(
      /empty term/,
    )
  })

  test('refuses an applied level that is not one of the levels', () => {
    expect(() =>
      defineConfigVocabulary({
        ...base,
        enforcement: { levels: ['soft'], applied: 'gone' as never },
      }),
    ).toThrow(/applied/)
  })

  test('a caller may add layers beyond the library three', () => {
    const v = defineConfigVocabulary({ ...base, layers: ['project', 'local', 'machine', 'nested'] })
    expect(v.LayerSchema.safeParse('nested').success).toBe(true)
  })

  test('refuses an empty list, a repeated term, a missing library layer, a stray enforcement role', () => {
    expect(() => defineConfigVocabulary({ ...base, categories: [] as never })).toThrow(/empty/)
    expect(() => defineConfigVocabulary({ ...base, runContexts: ['cli', 'cli'] })).toThrow(/twice/)
    expect(() => defineConfigVocabulary({ ...base, layers: ['project', 'local'] })).toThrow(
      /'machine'/,
    )
    expect(() =>
      defineConfigVocabulary({
        ...base,
        enforcement: { levels: ['soft'], reserved: 'gone' as never },
      }),
    ).toThrow(/reserved/)
  })

  test('defineSection registers the meta like defineConfigSection', () => {
    const section = vocabulary.defineSection({
      key: 'k',
      schema: z.string().default('x').describe('A key.'),
      meta: { ...VALID, category: 'extras' },
    })
    expect(section.meta.category).toBe('extras')
    expect(vocabulary.checkMeta({ k: section.schema })).toEqual([])
  })
})

describe('meta completeness test kit', () => {
  const keyed = (meta: Record<string, unknown>) => ({
    k: z.string().describe('A described key.').meta(meta),
  })

  test('consumerProblems passes an existing file and symbol, skips planned:', () => {
    expect(consumerProblems(keyed(VALID), SOURCE_ROOT)).toEqual([])
    expect(
      consumerProblems(
        keyed({ ...VALID, consumers: ['planned:later'], enforcement: 'reserved' }),
        SOURCE_ROOT,
      ),
    ).toEqual([])
  })

  test('consumerProblems names a missing file and a symbol the file lacks', () => {
    expect(
      consumerProblems(keyed({ ...VALID, consumers: ['nope.ts#thing'] }), SOURCE_ROOT),
    ).toEqual(['k: nope.ts#thing (no such file)'])
    expect(
      consumerProblems(keyed({ ...VALID, consumers: ['meta.ts#zzNotThere'] }), SOURCE_ROOT),
    ).toEqual(['k: meta.ts#zzNotThere (symbol not in file)'])
  })

  test('consumerProblems matches a $-edged symbol as a whole identifier', () => {
    const root = mkdtempSync(join(tmpdir(), 'meta-kit-'))
    try {
      writeFileSync(join(root, 'store.ts'), 'export const $config = 1\nexport const foo$bar = 2\n')
      const refs = (consumers: string[]) => consumerProblems(keyed({ ...VALID, consumers }), root)
      expect(refs(['store.ts#$config'])).toEqual([])
      expect(refs(['store.ts#foo'])).toEqual(['k: store.ts#foo (symbol not in file)'])
      expect(refs(['store.ts#config'])).toEqual(['k: store.ts#config (symbol not in file)'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("enforcementProblems ties the vocabulary's reserved and applied levels to the facts", () => {
    expect(enforcementProblems(keyed(VALID), LEVELS)).toEqual([])
    expect(enforcementProblems(keyed({ ...VALID, enforcement: 'reserved' }), LEVELS)).toHaveLength(
      1,
    )
    expect(enforcementProblems(keyed({ ...VALID, enforcement: 'applied' }), LEVELS)).toHaveLength(1)
    expect(
      enforcementProblems(
        keyed({ ...VALID, applies_via: 'apply:shims', enforcement: 'applied' }),
        LEVELS,
      ),
    ).toEqual([])
    expect(
      enforcementProblems(
        keyed({ ...VALID, consumers: ['planned:later'], enforcement: 'reserved' }),
        LEVELS,
      ),
    ).toEqual([])
  })

  test('enforcementProblems skips a role the vocabulary does not name', () => {
    expect(enforcementProblems(keyed({ ...VALID, enforcement: 'applied' }), {})).toEqual([])
  })

  test('machineLayerKeys lists the claimed and the declared keys', () => {
    const shape = keyed({ ...VALID, layers: ['project', 'machine'] })
    expect(machineLayerKeys(shape, { k: 1, other: 2 })).toEqual({ claimed: ['k'], declared: ['k'] })
    expect(machineLayerKeys(shape, { other: 2 })).toEqual({ claimed: ['k'], declared: [] })
  })

  test('applierAndReservedProblems reports an unused applier and a required reserved key', () => {
    const shape = keyed({ ...VALID, applies_via: 'apply:shims', enforcement: 'applied' })
    expect(applierAndReservedProblems(shape, ['shims'])).toEqual([])
    expect(applierAndReservedProblems(shape, ['shims', 'extra'])).toEqual([
      "applier 'extra' is declared but no key uses it",
    ])
    expect(applierAndReservedProblems(shape, ['shims', 'extra'], ['extra'])).toEqual([])
    const reserved = {
      k: z
        .string()
        .describe('d')
        .meta({ ...VALID, consumers: ['planned:x'], enforcement: 'reserved' }),
    }
    expect(applierAndReservedProblems(reserved, [])).toEqual(['k: a reserved key must be optional'])
  })
})
