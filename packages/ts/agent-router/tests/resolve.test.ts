import { describe, expect, test } from 'vitest'
import { layerCatalogue } from '../src/catalogue/layers.ts'
import { queryCatalogue } from '../src/catalogue/query.ts'
import { BUILTIN_QUERY, SNAPSHOT_LAYER } from '../src/catalogue/snapshot.ts'
import { resolveRef, type ResolveContext } from '../src/resolve.ts'

/** Tool `t` serves `p` with efforts low and high; its one model `p/m` takes low and is `fast`. `bare` declares nothing. */
const FIXTURE: ResolveContext = {
  catalogue: queryCatalogue(
    layerCatalogue([
      {
        source: 'snapshot',
        observed_at: '2026-10-01',
        providers: { p: { kind: 'openai' } },
        models: { 'p/m': { efforts: ['low'], traits: ['agent'] } },
        tools: {
          bare: { binary: 'b', serves: [], openness: 'closed', modes: ['headless'] },
          t: {
            binary: 't',
            serves: ['p'],
            openness: 'closed',
            modes: ['headless'],
            efforts: ['low', 'high'],
          },
        },
      },
    ]),
    { classify: [{ provider: 'p', match: [{ id: 'm', tier: 'fast' }] }] },
  ),
}
const BUILTIN: ResolveContext = { catalogue: BUILTIN_QUERY }

describe('resolveRef models', () => {
  test('no model -> default, checked ok', () => {
    expect(resolveRef({ tool: 'claude' }, BUILTIN)).toEqual({
      ok: true,
      value: {
        tool: 'claude',
        model: undefined,
        effort: undefined,
        effortUnchecked: false,
        contextUnchecked: false,
        text: 'claude',
        from: { kind: 'default' },
        check: { kind: 'ok' },
      },
    })
  })

  test.each([
    ['fast', 'haiku'],
    ['standard', 'sonnet'],
    ['max', 'opus'],
  ] as const)('tier %s maps through the catalogue', (tier, model) => {
    const r = resolveRef({ tool: 'claude', model: tier }, BUILTIN)
    expect(r.ok && r.value.model).toBe(model)
    expect(r.ok && r.value.from).toEqual({ kind: 'tier', tier })
    expect(r.ok && r.value.text).toBe(`claude/${tier}`)
  })

  test('codex and antigravity tiers come from the snapshot', () => {
    const codex = resolveRef({ tool: 'codex', model: 'max', effort: 'high' }, BUILTIN)
    expect(codex.ok && codex.value.model).toBe('gpt-6-astra')
    const agy = resolveRef({ tool: 'antigravity', model: 'standard' }, BUILTIN)
    expect(agy.ok && agy.value.model).toBe('gemini-3.8-flash')
  })

  test.each([
    ['t', 'max'],
    ['bare', 'fast'],
  ])('%s/%s -> no-tier-entry', (tool, model) => {
    const r = resolveRef({ tool, model }, FIXTURE)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('no-tier-entry')
    expect(r.error.message).toContain(model)
  })

  test('a tier on a tool the catalogue lacks -> unknown-tool', () => {
    const r = resolveRef({ tool: 'nope', model: 'max' }, BUILTIN)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatchObject({ kind: 'unknown-tool', tool: 'nope', model: 'max' })
    expect(r.error.message).toContain('nope')
  })

  test('a named model passes through', () => {
    const r = resolveRef({ tool: 'claude', model: 'claude-opus-5' }, BUILTIN)
    expect(r.ok && r.value.model).toBe('claude-opus-5')
    expect(r.ok && r.value.from).toEqual({ kind: 'name', name: 'claude-opus-5' })
  })

  test('a pinned tier is the pin and records pinned', () => {
    const q = queryCatalogue(layerCatalogue([SNAPSHOT_LAYER]), {
      pins: { 'claude/max': 'claude-opus-5' },
    })
    const r = resolveRef({ tool: 'claude', model: 'max' }, { catalogue: q })
    expect(r.ok && r.value.model).toBe('claude-opus-5')
    expect(r.ok && r.value.from).toEqual({ kind: 'tier', tier: 'max', pinned: true })
    expect(r.ok && r.value.check).toEqual({ kind: 'ok' })
  })
})

describe('resolveRef effort: one step on EFFORT_LEVELS, up first', () => {
  test('a supported effort is used as asked, with no adjustment', () => {
    const r = resolveRef({ tool: 'claude', model: 'opus', effort: 'high' }, BUILTIN)
    expect(r.ok && r.value.effort).toBe('high')
    expect(r.ok && 'effortAdjusted' in r.value).toBe(false)
  })

  test('an unsupported effort moves one step up when that level is accepted', () => {
    // claude-opus-4-6 takes low, medium, high and max: no xhigh.
    const r = resolveRef({ tool: 'claude', model: 'claude-opus-4-6', effort: 'xhigh' }, BUILTIN)
    expect(r.ok && r.value).toMatchObject({
      effort: 'max',
      effortAdjusted: { requested: 'xhigh', direction: 'up', used: 'max' },
      text: 'claude/claude-opus-4-6@xhigh',
    })
    // antigravity takes low to high: minimal moves up to low.
    const agy = resolveRef({ tool: 'antigravity', effort: 'minimal' }, BUILTIN)
    expect(agy.ok && agy.value.effortAdjusted).toEqual({
      requested: 'minimal',
      direction: 'up',
      used: 'low',
    })
    expect(agy.ok && agy.value.effort).toBe('low')
  })

  test('it moves one step down when the step up is not accepted', () => {
    // claude-opus-4-5 takes low, medium and high: no xhigh, no max.
    const r = resolveRef({ tool: 'claude', model: 'claude-opus-4-5', effort: 'xhigh' }, BUILTIN)
    expect(r.ok && r.value.effort).toBe('high')
    expect(r.ok && r.value.effortAdjusted).toEqual({
      requested: 'xhigh',
      direction: 'down',
      used: 'high',
    })
  })

  test('two steps from every accepted level is an error that lists them', () => {
    // none is two steps below low on the full scale (none, minimal, low, ...).
    const r = resolveRef({ tool: 'antigravity', effort: 'none' }, BUILTIN)
    expect(!r.ok && r.error).toMatchObject({
      kind: 'unsupported-effort',
      effort: 'none',
      supported: ['low', 'medium', 'high'],
    })
    expect(!r.ok && r.error.message).toContain('supported: low, medium, high')
  })

  test('an effort off the scale is never moved: it is unknown-effort', () => {
    const r = resolveRef({ tool: 'pi', effort: 'ultra' }, BUILTIN)
    expect(!r.ok && r.error.kind).toBe('unknown-effort')
  })
})

describe('resolveRef effort', () => {
  test("an effort in the tool's set is checked", () => {
    const r = resolveRef({ tool: 't', effort: 'high' }, FIXTURE)
    expect(r.ok && r.value.effort).toBe('high')
    expect(r.ok && r.value.effortUnchecked).toBe(false)
  })

  test('an unsupported effort lists the supported set', () => {
    const r = resolveRef({ tool: 't', model: 'm', effort: 'high' }, FIXTURE)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatchObject({
      kind: 'unsupported-effort',
      tool: 't',
      model: 'm',
      effort: 'high',
      supported: ['low'],
    })
    expect(r.error.message).toContain('supported: low')
  })

  test("a tier's effort is checked against the model it maps to", () => {
    expect(resolveRef({ tool: 't', model: 'fast', effort: 'low' }, FIXTURE).ok).toBe(true)
    const r = resolveRef({ tool: 't', model: 'fast', effort: 'high' }, FIXTURE)
    expect(!r.ok && r.error).toMatchObject({ kind: 'unsupported-effort', model: 'fast' })
  })

  test('the built-in levels: claude/max@xhigh resolves; antigravity refuses max, two steps off', () => {
    expect(resolveRef({ tool: 'claude', model: 'max', effort: 'xhigh' }, BUILTIN).ok).toBe(true)
    const agy = resolveRef({ tool: 'antigravity', model: 'max', effort: 'max' }, BUILTIN)
    expect(!agy.ok && agy.error.kind).toBe('unsupported-effort')
    const bogus = resolveRef({ tool: 'codex', effort: 'bogus' }, BUILTIN)
    expect(!bogus.ok && bogus.error.kind).toBe('unknown-effort')
  })

  test.each([
    ['no model', { tool: 'bare', effort: 'high' }],
    ['no model, an effort on the scale', { tool: 'bare', effort: 'none' }],
    ['an unknown model', { tool: 'bare', model: 'x', effort: 'xhigh' }],
  ])('unchecked when the catalogue declares no levels: %s', (_name, ref) => {
    const r = resolveRef(ref, FIXTURE)
    expect(r.ok && r.value.effort).toBe(ref.effort)
    expect(r.ok && r.value.effortUnchecked).toBe(true)
    expect(r.ok && r.value.effortAdjusted).toBeUndefined()
  })

  test('text is formatRef of the original ref', () => {
    const r = resolveRef({ tool: 'claude', model: 'max', effort: 'high' }, BUILTIN)
    expect(r.ok && r.value.text).toBe('claude/max@high')
    expect(r.ok && r.value.model).toBe('opus')
  })
})

describe('knownTools', () => {
  test("narrows the catalogue's tools: any other tool is unknown-tool", () => {
    expect(resolveRef({ tool: 'codex' }, BUILTIN).ok).toBe(true)
    const r = resolveRef({ tool: 'codex' }, { ...BUILTIN, knownTools: ['claude'] })
    expect(!r.ok && r.error.kind).toBe('unknown-tool')
    expect(!r.ok && r.error.message).toContain('codex')
    expect(resolveRef({ tool: 'claude' }, { ...BUILTIN, knownTools: ['claude'] }).ok).toBe(true)
  })
})

describe('the catalogue check', () => {
  test('a catalogue error fails the resolve with its code and hint', () => {
    const r = resolveRef({ tool: 'codex', model: 'sonnet' }, BUILTIN)
    expect(!r.ok && r.error).toMatchObject({ kind: 'provider-not-served', hint: 'claude/sonnet' })
  })

  test('an unknown model resolves with a warning; strict refuses it', () => {
    const r = resolveRef({ tool: 'claude', model: 'opus-6' }, BUILTIN)
    expect(r.ok && r.value.check.kind).toBe('warning')
    const strict = resolveRef({ tool: 'claude', model: 'opus-6' }, { ...BUILTIN, strict: true })
    expect(!strict.ok && strict.error.kind).toBe('unknown-model')
  })
})

describe('wildcards', () => {
  test('resolveRef refuses a wildcard: only a profile walk expands it', () => {
    const r = resolveRef({ tool: '*', model: 'fast' }, BUILTIN)
    expect(r).toMatchObject({ ok: false, error: { kind: 'wildcard' } })
  })

  test('qualifiers ride on text and leave context to the walk', () => {
    const r = resolveRef(
      { tool: 'claude', model: 'max', qualifiers: { ctx: 1_000_000, traits: [] } },
      BUILTIN,
    )
    expect(r.ok && r.value.text).toBe('claude/max[ctx=1m]')
    expect(r.ok && r.value.context).toBeUndefined()
    expect(r.ok && r.value.contextUnchecked).toBe(false)
  })
})
