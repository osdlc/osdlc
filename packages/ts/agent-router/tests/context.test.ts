import { describe, expect, test } from 'vitest'
import { configLayer, layerCatalogue, queryCatalogue } from '../src/catalogue/index.ts'
import { BUILTIN_QUERY, SNAPSHOT_LAYER } from '../src/catalogue/snapshot.ts'
import { contextArgs, defaultWindow, formatSize, parseSize } from '../src/context.ts'
import { formatRef, parseRef } from '../src/ref.ts'

describe('sizes', () => {
  test.each([
    ['1k', 1_000],
    ['200k', 200_000],
    ['1m', 1_000_000],
    ['2m', 2_000_000],
  ])('%s is %d tokens, and formats back', (text, tokens) => {
    expect(parseSize(text)).toBe(tokens)
    expect(formatSize(tokens)).toBe(text)
  })

  test.each(['', '1', '1000', '1M', '0k', '01m', 'max', '1.5m'])('%j is not a size', (text) => {
    expect(parseSize(text)).toBeUndefined()
  })

  test('a size neither unit divides rounds down to whole k, and the reference parses back', () => {
    expect(formatSize(1_048_576)).toBe('1048k')
    expect(formatSize(1_500)).toBe('1k')
    for (const size of [1_048_576, 1_050_000, 262_144]) {
      const text = formatRef({
        tool: 'antigravity',
        model: 'pro',
        qualifiers: { ctx: size, traits: [] },
      })
      const back = parseRef(text)
      expect(back.ok).toBe(true)
      const ctx = back.ok ? back.value.qualifiers?.ctx : undefined
      expect(typeof ctx === 'number' && ctx <= size && size - ctx < 1_000).toBe(true)
    }
  })
})

describe('contextArgs (AC-6)', () => {
  test('claude appends its [1m] variant to the alias', () => {
    expect(contextArgs('claude', 'opus', 1_000_000)).toEqual({
      model: 'opus[1m]',
      contextUnchecked: false,
    })
  })

  test('claude at or under its default context passes the model unchanged', () => {
    expect(contextArgs('claude', 'opus', 200_000)).toEqual({
      model: 'opus',
      contextUnchecked: false,
    })
  })

  test('cursor takes a [context=] bracket', () => {
    expect(contextArgs('cursor', 'gpt-5.3-codex', 1_000_000)).toEqual({
      model: 'gpt-5.3-codex[context=1m]',
      contextUnchecked: false,
    })
  })

  test('ollama takes num_ctx per request', () => {
    expect(contextArgs('ollama', 'qwen3:4b', 32_000)).toEqual({
      options: { num_ctx: 32_000 },
      contextUnchecked: false,
    })
  })

  test('codex emits nothing above its default window until a run confirms its config key', () => {
    expect(contextArgs('codex', 'gpt-6-astra', 500_000, 272_000)).toEqual({
      contextUnchecked: true,
    })
  })

  test('a tool with no context form needs none at or under its default window', () => {
    expect(contextArgs('codex', 'gpt-6-astra', 200_000, 272_000)).toEqual({
      model: 'gpt-6-astra',
      contextUnchecked: false,
    })
    expect(contextArgs('antigravity', 'gemini-2.5-pro', 1_048_576, 1_048_576)).toEqual({
      model: 'gemini-2.5-pro',
      contextUnchecked: false,
    })
  })

  test('claude needs no model at or under its default context', () => {
    expect(contextArgs('claude', undefined, 200_000)).toEqual({ contextUnchecked: false })
  })

  test('no known default window, or no model for a form that needs one, emits nothing', () => {
    expect(contextArgs('antigravity', 'gemini-2.5-pro', 1_000_000)).toEqual({
      contextUnchecked: true,
    })
    expect(contextArgs('claude', undefined, 1_000_000)).toEqual({ contextUnchecked: true })
    expect(contextArgs('cursor', undefined, 200_000)).toEqual({ contextUnchecked: true })
  })
})

describe('defaultWindow', () => {
  test("codex runs its models at the window its own model list states, not the model's max", () => {
    // The snapshot's codex offerings: `context_window` from codex's model list.
    expect(defaultWindow(BUILTIN_QUERY, 'codex', 'gpt-6-astra')).toBe(272_000)
    expect(BUILTIN_QUERY.findModel('codex', 'gpt-6-astra')?.model.context).toEqual({
      max: 1_050_000,
    })
  })

  test('a max alone is not a window: an Ollama row and a models.dev row have none', () => {
    const machine = queryCatalogue(
      layerCatalogue([
        SNAPSHOT_LAYER,
        {
          source: 'probe:ollama',
          observed_at: '2026-10-10',
          models: {
            'ollama/qwen3:4b': {
              traits: ['local', 'agent'],
              status: 'current',
              context: { max: 40_960 },
            },
          },
        },
      ]),
    )
    expect(defaultWindow(machine, 'pi', 'ollama/qwen3:4b')).toBeUndefined()
    expect(defaultWindow(BUILTIN_QUERY, 'antigravity', 'gemini-2.5-pro')).toBeUndefined()
  })

  test("a declared default on the tool's offering is the window", () => {
    const declared = queryCatalogue(
      layerCatalogue([
        SNAPSHOT_LAYER,
        configLayer(
          {
            offerings: [
              {
                tool: 'antigravity',
                model: 'google/gemini-2.5-pro',
                context: { default: 1_000_000 },
              },
            ],
          },
          '2026-10-10',
        ),
      ]),
    )
    expect(defaultWindow(declared, 'antigravity', 'gemini-2.5-pro')).toBe(1_000_000)
  })

  test('no model, or a model the catalogue does not know, has no known window', () => {
    expect(defaultWindow(BUILTIN_QUERY, 'codex', undefined)).toBeUndefined()
    expect(defaultWindow(BUILTIN_QUERY, 'codex', 'no-such-model')).toBeUndefined()
  })
})

describe('bounds', () => {
  test('parseSize refuses a size above Number.MAX_SAFE_INTEGER tokens', () => {
    expect(parseSize('99999999999999999999999m')).toBeUndefined()
    expect(parseSize('9007199254741k')).toBeUndefined()
    expect(parseSize('9007199254740k')).toBe(9_007_199_254_740_000)
  })

  test("a size above Claude's one 1m variant is contextUnchecked: ctx= means at least", () => {
    expect(contextArgs('claude', 'mystery', 5_000_000)).toEqual({ contextUnchecked: true })
    expect(contextArgs('claude', 'opus', 1_000_001)).toEqual({ contextUnchecked: true })
    expect(contextArgs('claude', 'opus', 1_000_000)).toEqual({
      model: 'opus[1m]',
      contextUnchecked: false,
    })
  })
})
