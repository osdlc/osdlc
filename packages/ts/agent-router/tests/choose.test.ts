import { describe, expect, test } from 'vitest'
import type { AuthorRule, IfOnlyAuthorLeft } from '../src/author-rule.ts'
import {
  chooseFromProfile as choose,
  validateProfile,
  type Availability,
  type AvailabilityReason,
  type ChooseContext,
  type ProfileSkip,
} from '../src/choose.ts'
import { parseProfile, type Profile } from '../src/profile.ts'
import { parseRef } from '../src/ref.ts'
import { layerCatalogue } from '../src/catalogue/layers.ts'
import { queryCatalogue } from '../src/catalogue/query.ts'
import { BUILTIN_QUERY, SNAPSHOT_LAYER } from '../src/catalogue/snapshot.ts'
import type { Resolved } from '../src/resolve.ts'
import { expandWildcard } from '../src/wildcard.ts'
import { deepFreeze } from '../src/freeze.ts'
import { IMAGE } from './image-fixture.ts'

const catalogue = BUILTIN_QUERY

/** A profile, and the author rule a caller walks it with (`ChooseContext.authorRule`), when one does. */
type Walked = Profile & { rule?: AuthorRule }

/**
 * A profile of `order`. `notTheAuthor` and `ifOnlyAuthorLeft` are not the
 * profile's: they become the rule `chooseFromProfile` below passes in the
 * context, as a caller with an author does.
 */
function profile(
  order: string[],
  extra: Partial<Omit<Profile, 'order'> & AuthorRule> = {},
): Walked {
  const { notTheAuthor, ifOnlyAuthorLeft, ...own } = extra
  const p: Walked = {
    order: order.map((t) => {
      const r = parseRef(t)
      if (!r.ok) throw new Error(r.error.message)
      return r.value
    }),
    ...own,
  }
  if (notTheAuthor !== undefined || ifOnlyAuthorLeft !== undefined) {
    p.rule = {
      notTheAuthor: notTheAuthor ?? false,
      ifOnlyAuthorLeft: ifOnlyAuthorLeft ?? 'different-model',
    }
  }
  return p
}

/** `choose` with the profile's test-side rule moved into the context. */
function chooseFromProfile(p: Walked, c: ChooseContext): ReturnType<typeof choose> {
  const { rule, ...own } = p
  return choose(own, rule === undefined ? c : { ...c, authorRule: rule })
}

function ctx(
  unavailable: Record<string, AvailabilityReason> = {},
  author?: ChooseContext['author'],
): ChooseContext {
  const base: ChooseContext = {
    catalogue,
    isAvailable: (r: Resolved): Availability =>
      r.text in unavailable
        ? { ok: false, reason: unavailable[r.text] ?? 'not-installed' }
        : { ok: true },
  }
  return author ? { ...base, author } : base
}

function chosenText(c: ReturnType<typeof chooseFromProfile>): string | undefined {
  return c.kind === 'chosen' ? c.resolved.text : undefined
}

describe('first available, no author rule', () => {
  test('first entry wins with exact trace', () => {
    const c = chooseFromProfile(profile(['claude/max', 'codex/max']), ctx())
    expect(c).toMatchObject({ kind: 'chosen', sameToolAsAuthor: false })
    expect(c.trace).toEqual(['claude/max: taken'])
    expect(c.summary).toBe('chosen: claude/max')
    expect(c.kind === 'chosen' && c.resolved.model).toBe('opus')
  })

  test('unavailable entries are skipped with reasons', () => {
    const c = chooseFromProfile(
      profile(['claude/max', 'codex/max', 'codex/fast']),
      ctx({ 'claude/max': 'not-installed', 'codex/max': 'over-budget' }),
    )
    expect(chosenText(c)).toBe('codex/fast')
    expect(c.trace).toEqual([
      'claude/max: skipped: unavailable (not-installed)',
      'codex/max: skipped: unavailable (over-budget)',
      'codex/fast: taken',
    ])
  })

  test('all unavailable -> none', () => {
    const c = chooseFromProfile(
      profile(['claude', 'codex']),
      ctx({ claude: 'not-signed-in', codex: 'over-budget' }),
    )
    expect(c.kind).toBe('none')
    expect(c.trace).toEqual([
      'claude: skipped: unavailable (not-signed-in)',
      'codex: skipped: unavailable (over-budget)',
    ])
    expect(c.summary).toBe('none: no entry is usable')
  })

  test('entries all uninstalled, absent or unreachable -> none, with details traced', () => {
    const c = chooseFromProfile(profile(['claude', 'codex/max', 'codex/fast']), {
      catalogue,
      isAvailable: (r: Resolved): Availability =>
        r.text === 'claude'
          ? { ok: false, reason: 'not-installed' }
          : r.text === 'codex/max'
            ? { ok: false, reason: 'model-not-present', detail: 'ollama does not list codex-max' }
            : { ok: false, reason: 'provider-unreachable' },
    })
    expect(c.kind).toBe('none')
    expect(c.trace).toEqual([
      'claude: skipped: unavailable (not-installed)',
      'codex/max: skipped: unavailable (model-not-present: ollama does not list codex-max)',
      'codex/fast: skipped: unavailable (provider-unreachable)',
    ])
  })

  test('unresolved entry makes the profile invalid and chooses nothing', () => {
    const c = chooseFromProfile(profile(['mystery/max', 'claude/standard']), ctx())
    expect(c.kind).toBe('invalid')
    if (c.kind !== 'invalid') return
    expect(c.errors).toHaveLength(1)
    expect(c.errors[0]).toMatchObject({ entry: 'mystery/max' })
    expect(c.errors[0]?.message?.startsWith("unknown tool 'mystery'; known: ")).toBe(true)
    expect(c.trace).toEqual([`mystery/max: invalid (${c.errors[0]?.message})`])
  })

  test('every bad entry is reported', () => {
    const c = chooseFromProfile(profile(['mystery/max', 'claude/max@none', 'claude']), ctx())
    expect(c.kind === 'invalid' && c.errors.map((e) => e.entry)).toEqual([
      'mystery/max',
      'claude/max@none',
    ])
  })

  test('an unresolvable author-tool entry is invalid, not author-skipped', () => {
    const c = chooseFromProfile(
      profile(['claude/max@none', 'codex'], { notTheAuthor: true, ifOnlyAuthorLeft: 'wait' }),
      ctx({}, { tool: 'claude' }),
    )
    expect(c.kind).toBe('invalid')
  })

  test('validateProfile returns the same errors, empty when usable', () => {
    const bad = profile(['mystery/max', 'claude'])
    const c = chooseFromProfile(bad, ctx())
    expect(c.kind === 'invalid' && c.errors).toEqual(validateProfile(bad, { catalogue }))
    expect(validateProfile(profile(['claude/max', 'codex']), { catalogue })).toEqual([])
  })

  test('empty-effect: not_the_author false ignores author', () => {
    const c = chooseFromProfile(profile(['claude/max', 'codex']), ctx({}, { tool: 'claude' }))
    expect(chosenText(c)).toBe('claude/max')
    expect(c.kind === 'chosen' && c.sameToolAsAuthor).toBe(false)
    expect(c.kind === 'chosen' && 'authorStep' in c).toBe(false)
  })
})

describe('notTheAuthor', () => {
  const p = profile(['claude/max', 'codex/max'], { notTheAuthor: true })

  test('author claude -> codex picked', () => {
    const c = chooseFromProfile(p, ctx({}, { tool: 'claude', model: 'opus' }))
    expect(c).toMatchObject({ kind: 'chosen', sameToolAsAuthor: false, authorStep: 1 })
    expect(c.trace).toEqual([
      "claude/max: skipped: author's tool (author rule step 1: not_the_author)",
      'codex/max: taken',
    ])
  })

  test('author codex -> claude picked', () => {
    const c = chooseFromProfile(p, ctx({}, { tool: 'codex' }))
    expect(chosenText(c)).toBe('claude/max')
    expect(c.kind === 'chosen' && c.sameToolAsAuthor).toBe(false)
  })

  test('author unknown -> first available', () => {
    expect(chosenText(chooseFromProfile(p, ctx()))).toBe('claude/max')
  })

  test('author-skipped entries are not availability-checked in the first pass', () => {
    const seen: string[] = []
    const c = chooseFromProfile(p, {
      catalogue,
      author: { tool: 'claude' },
      isAvailable: (r) => {
        seen.push(r.text)
        return { ok: true }
      },
    })
    expect(chosenText(c)).toBe('codex/max')
    expect(seen).toEqual(['codex/max'])
  })

  test('other tool unavailable -> falls back to author tool, flagged', () => {
    const c = chooseFromProfile(
      profile(['claude/max', 'claude/fast', 'codex'], { notTheAuthor: true }),
      ctx({ codex: 'not-installed' }, { tool: 'claude', model: 'opus' }),
    )
    expect(c).toMatchObject({ kind: 'chosen', sameToolAsAuthor: true })
    expect(chosenText(c)).toBe('claude/fast')
    expect(c.trace).toEqual([
      "claude/max: skipped: author's tool (author rule step 1: not_the_author)",
      "claude/fast: skipped: author's tool (author rule step 1: not_the_author)",
      'codex: skipped: unavailable (not-installed)',
      "author rule step 2 (different-model): claude/max: available, model may match author (entry's model equals the author's)",
      "author rule step 2 (different-model): claude/fast: taken, model differs from the author's",
    ])
    expect(c.kind === 'chosen' && c.modelMayMatchAuthor).toBeUndefined()
    expect(c.kind === 'chosen' && c.authorStep).toBe(2)
  })
})

describe('only the author tool left', () => {
  const order = ['claude/max', 'claude/fast']

  test('different-model: only the same model in the profile -> step 3 takes the next in the tier', () => {
    const c = chooseFromProfile(
      profile(['claude/max'], { notTheAuthor: true }),
      ctx({}, { tool: 'claude', model: 'opus' }),
    )
    expect(c).toMatchObject({ kind: 'chosen', sameToolAsAuthor: true })
    expect(chosenText(c)).toBe('claude/claude-opus-5')
    expect(c.kind === 'chosen' && c.modelMayMatchAuthor).toBeUndefined()
    expect(c.kind === 'chosen' && c.authorStep).toBe(3)
    expect(c.trace).toEqual([
      "claude/max: skipped: author's tool (author rule step 1: not_the_author)",
      "author rule step 2 (different-model): claude/max: available, model may match author (entry's model equals the author's)",
      'author rule step 3: claude/claude-opus-5: taken, next max model on claude',
    ])
  })

  test('different-model: step 3 restarts from the requested effort, not the moved one', () => {
    // opus-4-6 has no xhigh, so the entry runs at max (one step up); the next model (opus) supports xhigh.
    const c = chooseFromProfile(
      profile(['claude/claude-opus-4-6@xhigh'], { notTheAuthor: true }),
      ctx({}, { tool: 'claude', model: 'claude-opus-4-6' }),
    )
    expect(c).toMatchObject({ kind: 'chosen', authorStep: 3 })
    expect(chosenText(c)).toBe('claude/opus@xhigh')
    expect(c.kind === 'chosen' && c.resolved.effort).toBe('xhigh')
    expect(c.kind === 'chosen' && c.resolved.effortAdjusted).toBeUndefined()
  })

  test("different-model: step 3 keeps a wildcard entry's trait filter across providers", () => {
    const local = queryCatalogue(
      layerCatalogue([
        SNAPSHOT_LAYER,
        {
          source: 'probe:ollama',
          observed_at: '2026-10-10',
          models: { 'ollama/qwen3:4b': { traits: ['local', 'agent'], status: 'current' } },
        },
      ]),
    )
    const c = chooseFromProfile(profile(['*/fast[local]'], { notTheAuthor: true }), {
      catalogue: local,
      knownTools: ['codex'],
      author: { tool: 'codex', model: 'qwen3:4b' },
      isAvailable: () => ({ ok: true }),
    })
    // No other local fast model is on codex, so step 4 takes the held entry, not a cloud model.
    expect(c).toMatchObject({ kind: 'chosen', authorStep: 4, modelMayMatchAuthor: true })
    expect(chosenText(c)).toBe('codex/qwen3:4b')
  })

  test('different-model: step 3 keeps a tier entry’s trait filter', () => {
    // claude/fast is haiku-5-5 (long-context); the next fast model, haiku-4-5, lacks long-context.
    for (const [entry, held] of [
      ['claude/fast[long-context]', 'claude/fast[long-context]'],
      ['*/fast[long-context]', 'claude/fast'],
    ] as const) {
      const c = chooseFromProfile(profile([entry], { notTheAuthor: true }), {
        ...ctx({}, { tool: 'claude', model: 'haiku' }),
        isAvailable: (r) =>
          r.tool === 'claude' ? { ok: true } : { ok: false, reason: 'not-installed' },
      })
      expect(c).toMatchObject({ kind: 'chosen', authorStep: 4, modelMayMatchAuthor: true })
      expect(chosenText(c)).toBe(held)
      expect(c.trace.slice(-2)).toEqual([
        'author rule step 3: no other fast model on claude is available',
        `author rule step 4: ${held}: taken, model may match author`,
      ])
    }
  })

  test('different-model: no other model in the tier is available -> step 4, flagged', () => {
    const c = chooseFromProfile(profile(['claude/max'], { notTheAuthor: true }), {
      ...ctx({}, { tool: 'claude', model: 'opus' }),
      isAvailable: (r) =>
        r.text === 'claude/max' ? { ok: true } : { ok: false, reason: 'not-installed' },
    })
    expect(c).toMatchObject({
      kind: 'chosen',
      sameToolAsAuthor: true,
      modelMayMatchAuthor: true,
      authorStep: 4,
    })
    expect(chosenText(c)).toBe('claude/max')
    expect(c.trace.slice(-2)).toEqual([
      'author rule step 3: no other max model on claude is available',
      'author rule step 4: claude/max: taken, model may match author',
    ])
  })

  test('different-model: differing model chosen', () => {
    const c = chooseFromProfile(
      profile(order, { notTheAuthor: true }),
      ctx({}, { tool: 'claude', model: 'haiku' }),
    )
    expect(chosenText(c)).toBe('claude/max')
    expect(c.kind === 'chosen' && c.sameToolAsAuthor).toBe(true)
  })

  test('different-model: author model unknown -> any available', () => {
    const c = chooseFromProfile(
      profile(order, { notTheAuthor: true }),
      ctx({ 'claude/max': 'over-budget' }, { tool: 'claude' }),
    )
    expect(chosenText(c)).toBe('claude/fast')
    expect(c.kind === 'chosen' && c.modelMayMatchAuthor).toBe(true)
    expect(c.trace).toContain(
      'author rule step 2 (different-model): claude/max: skipped: unavailable (over-budget)',
    )
    expect(c.trace.at(-2)).toContain("author's model unknown")
    expect(c.trace.at(-1)).toBe('author rule step 4: claude/fast: taken, model may match author')
  })

  test('different-model: tool-default entry differs from a known author model', () => {
    const c = chooseFromProfile(
      profile(['claude'], { notTheAuthor: true }),
      ctx({}, { tool: 'claude', model: 'opus' }),
    )
    expect(chosenText(c)).toBe('claude')
    expect(c.kind === 'chosen' && c.sameToolAsAuthor).toBe(true)
    expect(c.kind === 'chosen' && c.modelMayMatchAuthor).toBe(true)
    expect(c.trace.at(-3)).toContain('tool default model')
    expect(c.trace.at(-2)).toBe('author rule step 3: claude: tier unknown')
  })

  test('different-model: an explicit differing model beats an earlier maybe-same entry', () => {
    const c = chooseFromProfile(
      profile(['claude', 'claude/max', 'claude/fast'], { notTheAuthor: true }),
      ctx({}, { tool: 'claude', model: 'opus' }),
    )
    expect(chosenText(c)).toBe('claude/fast')
    expect(c.kind === 'chosen' && c.modelMayMatchAuthor).toBeUndefined()
  })

  test('different-model: same-model and unavailable fallbacks -> the next max model, never a lower tier', () => {
    const c = chooseFromProfile(
      profile(['claude/max', 'claude/fast', 'claude/standard'], { notTheAuthor: true }),
      ctx(
        { 'claude/fast': 'over-budget', 'claude/standard': 'not-installed' },
        { tool: 'claude', model: 'opus' },
      ),
    )
    expect(chosenText(c)).toBe('claude/claude-opus-5')
    expect(c.kind === 'chosen' && c.modelMayMatchAuthor).toBeUndefined()
  })

  test('different-model: all fallbacks unavailable -> none', () => {
    const c = chooseFromProfile(
      profile(order, { notTheAuthor: true }),
      ctx({ 'claude/max': 'over-budget', 'claude/fast': 'not-installed' }, { tool: 'claude' }),
    )
    expect(c.kind).toBe('none')
    expect(c.summary).toBe('none: no author-tool fallback is available')
  })

  test('wait', () => {
    const c = chooseFromProfile(
      profile(order, { notTheAuthor: true, ifOnlyAuthorLeft: 'wait' }),
      ctx({}, { tool: 'claude', model: 'haiku' }),
    )
    expect(c.kind).toBe('wait')
    expect(c.summary).toBe("wait: only the author's tool is left")
    expect(c.trace).toHaveLength(3)
    expect(c.trace.at(-1)).toBe('author rule step 2: if_only_author_left: wait')
  })

  test('person', () => {
    const c = chooseFromProfile(
      profile(order, { notTheAuthor: true, ifOnlyAuthorLeft: 'person' }),
      ctx({}, { tool: 'claude', model: 'haiku' }),
    )
    expect(c.kind).toBe('person')
    expect(c.trace).toEqual([
      "claude/max: skipped: author's tool (author rule step 1: not_the_author)",
      "claude/fast: skipped: author's tool (author rule step 1: not_the_author)",
      'author rule step 2: if_only_author_left: person',
    ])
    expect(c.summary).toBe("person: only the author's tool is left")
  })

  test.each(['wait', 'person'] as const)(
    '%s applies even when author-tool entries are unavailable',
    (mode) => {
      const c = chooseFromProfile(
        profile(order, { notTheAuthor: true, ifOnlyAuthorLeft: mode }),
        ctx({ 'claude/max': 'over-budget', 'claude/fast': 'not-installed' }, { tool: 'claude' }),
      )
      expect(c.kind).toBe(mode)
    },
  )

  test.each(['wait', 'person'] as const)(
    '%s applies when other entries are unavailable',
    (mode) => {
      const c = chooseFromProfile(
        profile(['claude/max', 'codex'], { notTheAuthor: true, ifOnlyAuthorLeft: mode }),
        ctx({ codex: 'not-installed' }, { tool: 'claude' }),
      )
      expect(c.kind).toBe(mode)
    },
  )

  test('nothing available and nothing author-skipped -> none, whatever the mode', () => {
    const c = chooseFromProfile(
      profile(['codex'], { notTheAuthor: true, ifOnlyAuthorLeft: 'wait' }),
      ctx({ codex: 'not-installed' }, { tool: 'claude' }),
    )
    expect(c.kind).toBe('none')
  })
})

describe('cooldowns never return none', () => {
  test('a cooling entry is skipped while another is available', () => {
    const c = chooseFromProfile(
      profile(['claude/max', 'claude/standard']),
      ctx({ 'claude/max': 'cooling-down' }),
    )
    expect(chosenText(c)).toBe('claude/standard')
    expect(c.kind === 'chosen' && c.allCooling).toBeUndefined()
  })

  test('every entry cooling -> the first entry, traced as all cooling', () => {
    const c = chooseFromProfile(
      profile(['claude/max', 'codex/max']),
      ctx({ 'claude/max': 'cooling-down', 'codex/max': 'cooling-down' }),
    )
    expect(c).toMatchObject({ kind: 'chosen', allCooling: true })
    expect(chosenText(c)).toBe('claude/max')
    expect(c.trace).toEqual([
      'claude/max: skipped: unavailable (cooling-down)',
      'codex/max: skipped: unavailable (cooling-down)',
      'claude/max: taken: no entry is available and 2 cooling down',
    ])
    expect(c.summary).toContain('all usable entries are cooling down')
  })

  test('cooling plus an unusable entry still takes the first cooling one', () => {
    const c = chooseFromProfile(
      profile(['codex', 'claude/max']),
      ctx({ codex: 'not-installed', 'claude/max': 'cooling-down' }),
    )
    expect(chosenText(c)).toBe('claude/max')
    expect(c.kind === 'chosen' && c.allCooling).toBe(true)
  })

  test('only author-tool entries left and all cooling -> the first, flagged', () => {
    const c = chooseFromProfile(
      profile(['claude/max', 'claude/fast'], { notTheAuthor: true }),
      ctx(
        { 'claude/max': 'cooling-down', 'claude/fast': 'cooling-down' },
        { tool: 'claude', model: 'opus' },
      ),
    )
    // claude/max resolves to opus, the author's model: it may match.
    expect(c).toMatchObject({
      kind: 'chosen',
      allCooling: true,
      sameToolAsAuthor: true,
      modelMayMatchAuthor: true,
    })
    expect(chosenText(c)).toBe('claude/max')
  })
})

describe('determinism', () => {
  test('same input twice gives deep-equal output', () => {
    const p = profile(['claude/max', 'codex', 'mystery/fast'], { notTheAuthor: true })
    const c = ctx({ codex: 'not-installed' }, { tool: 'claude', model: 'haiku' })
    expect(chooseFromProfile(p, c)).toEqual(chooseFromProfile(p, c))
  })
})

describe('context validation and options', () => {
  test('author tool must be a lower-case identifier', () => {
    const c = chooseFromProfile(profile(['claude']), ctx({}, { tool: 'Claude' }))
    expect(c.kind).toBe('invalid')
  })

  test('author comparison is exact', () => {
    const c = chooseFromProfile(
      profile(['claude'], { notTheAuthor: true, ifOnlyAuthorLeft: 'wait' }),
      ctx({}, { tool: 'claud' }),
    )
    expect(c.kind).toBe('chosen')
  })

  test('empty order is rejected by the schema', () => {
    expect(parseProfile({ order: [] }).ok).toBe(false)
    expect(parseProfile([]).ok).toBe(false)
  })

  test("knownTools: the catalogue's tools by default, narrowed when given", () => {
    expect(chooseFromProfile(profile(['mystery/some-model', 'claude']), ctx()).kind).toBe('invalid')
    const p = profile(['antigravity', 'claude'])
    expect(chosenText(chooseFromProfile(p, ctx()))).toBe('antigravity')
    const closed = chooseFromProfile(p, { ...ctx(), knownTools: ['claude', 'codex'] })
    expect(closed.kind).toBe('invalid')
    expect(closed.kind === 'invalid' && closed.errors[0]?.error?.kind).toBe('unknown-tool')
  })
})

describe('inputs are not mutated', () => {
  test('frozen profile, catalogue and ctx work in every branch', () => {
    const frozen = deepFreeze(queryCatalogue(layerCatalogue([SNAPSHOT_LAYER])))
    for (const mode of ['wait', 'person', 'different-model'] as const) {
      const p = deepFreeze(
        profile(['claude/max', 'codex', 'mystery/fast'], {
          notTheAuthor: true,
          ifOnlyAuthorLeft: mode,
        }),
      )
      const c = deepFreeze({
        ...ctx({ codex: 'not-installed' }, { tool: 'claude', model: 'haiku' }),
        catalogue: frozen,
      })
      expect(() => chooseFromProfile(p, c)).not.toThrow()
      expect(() => validateProfile(p, { catalogue: frozen })).not.toThrow()
    }
    const ok = deepFreeze(profile(['claude/max', 'codex'], { notTheAuthor: true }))
    expect(() =>
      chooseFromProfile(ok, deepFreeze({ ...ctx({}, { tool: 'claude' }), catalogue: frozen })),
    ).not.toThrow()
  })
})

describe('validity against the catalogue', () => {
  const withdrawn = queryCatalogue(
    layerCatalogue([
      SNAPSHOT_LAYER,
      {
        source: 'config',
        observed_at: '2026-10-09',
        models: { 'anthropic/claude-opus-3': { status: 'withdrawn' } },
      },
    ]),
  )
  const cat = (extra: Partial<ChooseContext> = {}): ChooseContext => ({
    catalogue: withdrawn,
    isAvailable: () => ({ ok: true }),
    ...extra,
  })

  test('AC-6: a profile whose only entry is skipped returns none', () => {
    const c = chooseFromProfile(profile(['claude/claude-opus-3']), cat())
    expect(c).toMatchObject({ kind: 'none' })
    expect(c.trace).toEqual([
      "claude/claude-opus-3: skipped: model 'claude-opus-3' (anthropic/claude-opus-3) is withdrawn",
    ])
  })

  test('a skipped entry is traced and the walk continues', () => {
    const c = chooseFromProfile(profile(['claude/claude-opus-3', 'codex/max']), cat())
    expect(chosenText(c)).toBe('codex/max')
    expect(c.trace[0]).toContain('claude/claude-opus-3: skipped: ')
  })

  test('an error makes the profile invalid, with the hint in the message', () => {
    const p = profile(['claude/max', 'codex/sonnet'])
    const c = chooseFromProfile(p, cat())
    expect(c.kind).toBe('invalid')
    expect(c.kind === 'invalid' && c.errors[0]?.error).toMatchObject({
      kind: 'provider-not-served',
      hint: 'claude/sonnet',
    })
    expect(validateProfile(p, cat())).toHaveLength(1)
  })

  test('AC-4: an unknown model warns, stays in the walk and its warning rides the choice', () => {
    const c = chooseFromProfile(profile(['claude/opus-6', 'codex/max']), cat())
    expect(chosenText(c)).toBe('claude/opus-6')
    expect(c.kind === 'chosen' && c.warnings).toEqual([
      "model 'opus-6' is not in the model catalogue for 'claude'; it is passed as written",
    ])
    expect(c.trace[0]?.startsWith('claude/opus-6: warning: ')).toBe(true)
    expect(validateProfile(profile(['claude/opus-6']), cat())).toEqual([])
  })

  test('AC-5: strict makes the unknown model an error', () => {
    const c = chooseFromProfile(profile(['claude/opus-6', 'codex/max']), cat({ strict: true }))
    expect(c.kind === 'invalid' && c.errors.map((e) => e.error?.kind)).toEqual(['unknown-model'])
  })
})

describe('context as a requirement', () => {
  const cat = (extra: Partial<ChooseContext> = {}): ChooseContext => ({
    catalogue: BUILTIN_QUERY,
    knownTools: ['claude', 'codex'],
    isAvailable: () => ({ ok: true }),
    ...extra,
  })

  test('AC-5: profile context: skips an entry whose model offers less, and says why', () => {
    const c = chooseFromProfile(
      profile(['claude/claude-haiku-4-5', 'claude/opus'], { context: 1_000_000 }),
      cat(),
    )
    expect(chosenText(c)).toBe('claude/opus')
    expect(c.kind === 'chosen' && c.resolved.context).toBe(1_000_000)
    expect(c.kind === 'chosen' && c.resolved.contextUnchecked).toBe(false)
    expect(c.trace).toEqual([
      "claude/claude-haiku-4-5: skipped: below context: anthropic/claude-haiku-4-5 offers 200k on claude, below the profile's context: 1m",
      'claude/opus: taken',
    ])
  })

  test('AC-5: an entry asking for more than its model offers anywhere is a profile error', () => {
    const p = profile(['claude/opus[ctx=5m]', 'codex/max'])
    const c = chooseFromProfile(p, cat())
    expect(c.kind).toBe('invalid')
    expect(c.kind === 'invalid' && c.errors[0]).toMatchObject({
      entry: 'claude/opus[ctx=5m]',
      message: 'ctx=5m is more than anthropic/claude-opus-5-5 offers anywhere (1m)',
    })
    expect(validateProfile(p, cat())).toHaveLength(1)
  })

  test('AC-5: a model with no known sizes passes with contextUnchecked and a warning', () => {
    const c = chooseFromProfile(profile(['claude/opus-6'], { context: 1_000_000 }), cat())
    expect(chosenText(c)).toBe('claude/opus-6')
    expect(c.kind === 'chosen' && c.resolved.contextUnchecked).toBe(true)
    expect(c.kind === 'chosen' && c.resolved.context).toBe(1_000_000)
    expect(c.kind === 'chosen' && c.warnings).toContain(
      'context 1m is not checked: the catalogue knows no context size for the model',
    )
  })

  test('ctx=max is the largest size the model offers on the tool', () => {
    const c = chooseFromProfile(profile(['claude/opus[ctx=max]']), cat())
    expect(c.kind === 'chosen' && c.resolved.context).toBe(1_000_000)
  })

  test('the larger of the entry ctx and the profile context applies', () => {
    const c = chooseFromProfile(profile(['claude/opus[ctx=500k]'], { context: 1_000_000 }), cat())
    expect(c.kind === 'chosen' && c.resolved.context).toBe(1_000_000)
  })

  test('availability is asked with the resolved context and never skips on it', () => {
    const seen: (number | undefined)[] = []
    const c = chooseFromProfile(
      profile(['claude/opus'], { context: 1_000_000 }),
      cat({
        isAvailable: (r) => {
          seen.push(r.context)
          return { ok: true }
        },
      }),
    )
    expect(chosenText(c)).toBe('claude/opus')
    expect(seen).toEqual([1_000_000])
  })

  test('no requirement leaves context unset and unchecked false', () => {
    const c = chooseFromProfile(profile(['claude/opus']), cat())
    expect(c.kind === 'chosen' && c.resolved.context).toBeUndefined()
    expect(c.kind === 'chosen' && c.resolved.contextUnchecked).toBe(false)
  })
})

describe('wildcards and traits', () => {
  const cat = (query = BUILTIN_QUERY, extra: Partial<ChooseContext> = {}): ChooseContext => ({
    catalogue: query,
    knownTools: ['claude', 'codex', 'antigravity'],
    isAvailable: () => ({ ok: true }),
    ...extra,
  })

  test('*/fast expands to the fast chain: each tool head as its tier, then named models', () => {
    const c = chooseFromProfile(profile(['*/fast']), cat())
    expect(chosenText(c)).toBe('claude/fast')
    expect(c.trace).toEqual([
      '*/fast: expands to claude/fast, claude/claude-haiku-4-5, codex/fast, codex/gpt-5.6-luna, antigravity/fast, antigravity/gemini-flash-lite-latest, antigravity/gemini-3.1-flash-lite, antigravity/gemini-2.5-flash-lite',
      'claude/fast: taken',
    ])
  })

  test('*/standard[image-out] expands to an image model; */standard never does', () => {
    const query = queryCatalogue(layerCatalogue([SNAPSHOT_LAYER, IMAGE]))
    const wild = (text: string) =>
      expandWildcard(profile([text]).order[0]!, cat(query)).entries.map((e) => e.model)
    expect(wild('*/standard[image-out]')).toContain('test-image')
    expect(wild('*/standard')).not.toContain('test-image')
  })

  test('the walk continues through the expansion', () => {
    const c = chooseFromProfile(
      profile(['*/fast']),
      cat(BUILTIN_QUERY, {
        isAvailable: (r) =>
          r.tool === 'claude' ? { ok: false, reason: 'not-installed' } : { ok: true },
      }),
    )
    expect(chosenText(c)).toBe('codex/fast')
  })

  test('AC-5b: a wildcard that expands to nothing is skipped with a trace line', () => {
    const c = chooseFromProfile(profile(['*/fast[local]', 'claude/standard']), cat())
    expect(chosenText(c)).toBe('claude/standard')
    expect(c.trace).toContain('*/fast[local]: skipped: wildcard expands to no candidate')
    expect(c.trace).toContain(
      'claude/fast: skipped: model anthropic/claude-haiku-5-5 lacks local (from */fast[local])',
    )
    expect(validateProfile(profile(['*/fast[local]']), cat())).toEqual([])
  })

  test('AC-5b: an embedding model never appears in a wildcard expansion', () => {
    // A pin and a project rule can both put an embedding model in a tier; the chain still drops it.
    const query = queryCatalogue(layerCatalogue([SNAPSHOT_LAYER]), {
      classify: [
        { provider: 'openai', families: { 'text-embedding': 'fast', 'gpt-luna': 'unclassified' } },
      ],
      pins: { 'codex/fast': 'text-embedding-3-small' },
    })
    const ex = expandWildcard(profile(['*/fast']).order[0]!, cat(query))
    expect(ex.entries.map((e) => e.tool)).not.toContain('codex')
    expect(ex.skipped).toEqual([
      {
        text: 'codex/fast',
        reason: 'not-agent',
        detail: 'openai/text-embedding-3-small is an embedding model',
      },
      {
        text: 'codex/text-embedding-3-large',
        reason: 'not-agent',
        detail: 'openai/text-embedding-3-large is an embedding model',
      },
      {
        text: 'codex/text-embedding-ada-002',
        reason: 'not-agent',
        detail: 'openai/text-embedding-ada-002 is an embedding model',
      },
    ])
    const c = chooseFromProfile(
      profile(['*/fast']),
      cat(query, {
        isAvailable: (r) =>
          r.tool === 'codex' ? { ok: true } : { ok: false, reason: 'not-installed' },
      }),
    )
    expect(c.kind).toBe('none')
    expect(c.trace[0]).toBe(
      'codex/fast: skipped: openai/text-embedding-3-small is an embedding model (from */fast)',
    )
  })

  test('a candidate whose tool lacks the effort is skipped, not invalid', () => {
    // antigravity takes low to high: max is two steps above high.
    const c = chooseFromProfile(profile(['*/fast@max']), cat())
    expect(chosenText(c)).toBe('claude/fast@max')
    expect(c.trace[0]?.startsWith('antigravity/fast@max: skipped: ')).toBe(true)
    expect(c.skipped[0]).toMatchObject({ ref: 'antigravity/fast@max', reason: 'unresolved' })
  })

  test('an effort moved one step is traced and warned, and the entry runs at the moved level', () => {
    const c = chooseFromProfile(profile(['antigravity/fast@xhigh']), cat())
    expect(c.kind).toBe('chosen')
    if (c.kind !== 'chosen') return
    expect(c.resolved).toMatchObject({
      effort: 'high',
      effortAdjusted: { requested: 'xhigh', direction: 'down', used: 'high' },
    })
    const line = "effort 'xhigh' is not supported; using 'high', one step down"
    expect(c.trace).toContain(`antigravity/fast@xhigh: ${line}`)
    expect(c.warnings).toContain(line)
  })

  test('the wildcard ctx qualifier carries onto each candidate', () => {
    const c = chooseFromProfile(profile(['*/max[ctx=1m]']), cat())
    expect(chosenText(c)).toBe('claude/max[ctx=1m]')
    expect(c.kind === 'chosen' && c.resolved.context).toBe(1_000_000)
  })

  test('a tier entry is filtered by its traits', () => {
    const c = chooseFromProfile(profile(['claude/fast[local]', 'claude/fast[reasoning]']), cat())
    expect(chosenText(c)).toBe('claude/fast[reasoning]')
    expect(c.trace[0]).toBe(
      'claude/fast[local]: skipped: model anthropic/claude-haiku-5-5 lacks local',
    )
  })
})

describe('skipped: the structured list of entries passed over', () => {
  test('carries the reason and never the chosen entry (author rule step 2)', () => {
    // The failing input of review 4237036601: claude/opus is set aside in step 1, then taken in step 2.
    const c = chooseFromProfile(
      profile(['claude/opus'], { notTheAuthor: true }),
      ctx({}, { tool: 'claude', model: 'sonnet' }),
    )
    expect(chosenText(c)).toBe('claude/opus')
    expect(c.skipped).toEqual([])
  })

  test('steps 1 and 3 are named; a step-3 skip is listed', () => {
    const p = profile(['claude/max', 'codex/max'], { notTheAuthor: true })
    const c = chooseFromProfile(p, {
      ...ctx({}, { tool: 'claude', model: 'claude-opus-5-5' }),
      isAvailable: (r) =>
        r.text === 'claude/max' || r.model === 'claude-opus-4-7'
          ? { ok: true }
          : { ok: false, reason: 'not-installed' },
    })
    expect(chosenText(c)).toBe('claude/claude-opus-4-7')
    const unavailable = 'not-installed'
    expect(c.skipped).toEqual([
      { ref: 'claude/max', reason: 'author-tool', step: 1 },
      { ref: 'codex/max', reason: unavailable },
      { ref: 'claude/claude-opus-5', reason: unavailable, step: 3 },
      { ref: 'claude/claude-opus-4-8', reason: unavailable, step: 3 },
    ])
  })

  test('an entry taken because every entry is cooling is not listed', () => {
    const c = chooseFromProfile(
      profile(['claude/max', 'codex/max']),
      ctx({ 'claude/max': 'cooling-down', 'codex/max': 'not-installed' }),
    )
    expect(c).toMatchObject({ kind: 'chosen', allCooling: true })
    expect(c.skipped).toEqual([{ ref: 'codex/max', reason: 'not-installed' }])
  })

  test("a wildcard's skips carry the candidate and a reason without the wildcard suffix", () => {
    const c = chooseFromProfile(profile(['*/fast[local]', 'claude/standard']), {
      catalogue,
      knownTools: ['claude'],
      isAvailable: () => ({ ok: true }),
    })
    expect(c.skipped).toContainEqual({
      ref: 'claude/fast',
      reason: 'missing-trait',
      detail: 'model anthropic/claude-haiku-5-5 lacks local',
    })
    expect(c.skipped).toContainEqual({ ref: '*/fast[local]', reason: 'no-candidate' })
  })

  test("a wildcard candidate's skip stays listed when another entry with its text is chosen", () => {
    const c = chooseFromProfile(profile(['*/fast[local]', 'claude/fast']), {
      catalogue,
      isAvailable: () => ({ ok: true }),
    })
    expect(chosenText(c)).toBe('claude/fast')
    expect(c.skipped).toContainEqual({
      ref: 'claude/fast',
      reason: 'missing-trait',
      detail: 'model anthropic/claude-haiku-5-5 lacks local',
    })
  })

  test('none, wait and invalid carry the list too', () => {
    const none = chooseFromProfile(profile(['claude']), ctx({ claude: 'not-installed' }))
    expect(none).toMatchObject({
      kind: 'none',
      skipped: [{ ref: 'claude', reason: 'not-installed' }],
    })
    const wait = chooseFromProfile(
      profile(['claude/max'], { notTheAuthor: true, ifOnlyAuthorLeft: 'wait' }),
      ctx({}, { tool: 'claude' }),
    )
    expect(wait).toMatchObject({
      kind: 'wait',
      skipped: [{ ref: 'claude/max', reason: 'author-tool', step: 1 }],
    })
    expect(chooseFromProfile(profile(['mystery']), ctx())).toMatchObject({
      kind: 'invalid',
      skipped: [],
    })
  })

  test('each skip is a code, with what failed as its detail', () => {
    const c = chooseFromProfile(profile(['claude/max', 'codex/max', 'claude/fast[local]']), {
      catalogue,
      isAvailable: (r) =>
        r.tool === 'codex'
          ? { ok: false, reason: 'not-launchable', detail: 'the host has no launch for it' }
          : { ok: false, reason: 'cooling-down' },
    })
    const skips: ProfileSkip[] = [
      { ref: 'codex/max', reason: 'not-launchable', detail: 'the host has no launch for it' },
      {
        ref: 'claude/fast[local]',
        reason: 'missing-trait',
        detail: 'model anthropic/claude-haiku-5-5 lacks local',
      },
    ]
    expect(c.skipped).toEqual(skips)
    expect(c.trace).toContain(
      'codex/max: skipped: unavailable (not-launchable: the host has no launch for it)',
    )
    expect(c.trace).toContain('claude/max: skipped: unavailable (cooling-down)')
  })

  test('a model below the context asked is below-context', () => {
    const c = chooseFromProfile(
      profile(['claude/claude-haiku-4-5', 'claude/opus'], { context: 1_000_000 }),
      ctx(),
    )
    expect(c.skipped).toEqual([
      {
        ref: 'claude/claude-haiku-4-5',
        reason: 'below-context',
        detail: "anthropic/claude-haiku-4-5 offers 200k on claude, below the profile's context: 1m",
      },
    ])
  })
})

describe('the author unknown (authorUnknown)', () => {
  const p = (ifOnlyAuthorLeft: IfOnlyAuthorLeft): Walked =>
    profile(['codex/max', 'claude/max'], { notTheAuthor: true, ifOnlyAuthorLeft })
  const unknown: ChooseContext = { ...ctx(), authorUnknown: true }

  test('step 1 sets every entry aside', () => {
    const c = chooseFromProfile(p('wait'), unknown)
    expect(c.skipped).toEqual([
      { ref: 'codex/max', reason: 'author-tool', step: 1 },
      { ref: 'claude/max', reason: 'author-tool', step: 1 },
    ])
    expect(c.trace[0]).toBe("author unknown: any tool may be the author's (author rule step 1)")
  })

  test('wait', () => {
    expect(chooseFromProfile(p('wait'), unknown)).toMatchObject({
      kind: 'wait',
      summary: "wait: the author is unknown, so any tool may be the author's",
    })
  })

  test('person', () => {
    const c = chooseFromProfile(p('person'), unknown)
    expect(c).toMatchObject({ kind: 'person' })
    expect(c.trace.at(-1)).toBe('author rule step 2: if_only_author_left: person')
  })

  test('different-model takes the first available entry at step 4, flagged', () => {
    const c = chooseFromProfile(p('different-model'), {
      ...unknown,
      isAvailable: (r) =>
        r.tool === 'codex' ? { ok: false, reason: 'not-installed' } : { ok: true },
    })
    expect(c).toMatchObject({
      kind: 'chosen',
      sameToolAsAuthor: false,
      modelMayMatchAuthor: true,
      authorStep: 4,
      summary: 'chosen: claude/max (author unknown, model may match: author unknown)',
    })
    expect(chosenText(c)).toBe('claude/max')
    expect(c.skipped).toEqual([
      { ref: 'codex/max', reason: 'author-tool', step: 1 },
      { ref: 'codex/max', reason: 'not-installed', step: 2 },
    ])
  })

  test('a known author wins over the flag; without not_the_author the flag does nothing', () => {
    const known = chooseFromProfile(p('wait'), {
      ...ctx({}, { tool: 'claude' }),
      authorUnknown: true,
    })
    expect(chosenText(known)).toBe('codex/max')
    const off = chooseFromProfile(profile(['codex/max']), unknown)
    expect(off).toMatchObject({ kind: 'chosen' })
    expect(off.kind === 'chosen' && 'authorStep' in off).toBe(false)
  })
})

describe('an effort off EFFORT_LEVELS', () => {
  test('*/max@hgih does not parse: unknown-effort', () => {
    const p = parseProfile(['*/max@hgih'])
    expect(!p.ok && p.error.kind === 'invalid-ref' && p.error.error.kind).toBe('unknown-effort')
  })

  test('a wildcard built in code with one makes the profile invalid, and validateProfile says so', () => {
    const wildcard: Profile = { order: [{ tool: '*', model: 'max', effort: 'hgih' }] }
    const c = choose(wildcard, ctx())
    expect(c.kind).toBe('invalid')
    const errors = validateProfile(wildcard, { catalogue })
    expect(errors).toEqual([
      {
        entry: '*/max@hgih',
        message:
          "effort 'hgih' is not a level (levels: none, minimal, low, medium, high, xhigh, max)",
      },
    ])
    expect(c.kind === 'invalid' && c.errors).toEqual(errors)
  })

  test('a named entry built in code with one is invalid: unknown-effort', () => {
    const c = choose({ order: [{ tool: 'opencode', effort: 'hgih' }] }, ctx())
    expect(c.kind === 'invalid' && c.errors[0]?.error?.kind).toBe('unknown-effort')
  })

  test('chosen.warnings reports an unchecked effort, as it does an unchecked context', () => {
    const c = chooseFromProfile(profile(['opencode/anthropic/claude-haiku-4-5@high']), ctx())
    expect(c.kind === 'chosen' && c.resolved.effortUnchecked).toBe(true)
    expect(c.kind === 'chosen' && c.warnings).toEqual([
      "effort 'high' is not checked: the catalogue declares no effort levels for 'anthropic/claude-haiku-4-5' on 'opencode'",
    ])
    expect(c.trace).toContain(
      "opencode/anthropic/claude-haiku-4-5@high: warning: effort 'high' is not checked: the catalogue declares no effort levels for 'anthropic/claude-haiku-4-5' on 'opencode'",
    )
  })
})

describe('wait and person take a cooling entry off the author tool first', () => {
  test.each(['wait', 'person'] as const)('%s', (rule) => {
    const c = chooseFromProfile(
      profile(['codex/max', 'claude/opus'], { notTheAuthor: true, ifOnlyAuthorLeft: rule }),
      ctx({ 'codex/max': 'cooling-down' }, { tool: 'claude' }),
    )
    expect(c.kind).toBe('chosen')
    if (c.kind !== 'chosen') return
    expect(c.resolved.text).toBe('codex/max')
    expect(c.allCooling).toBe(true)
    expect(c.authorStep).toBe(1)
    expect(c.sameToolAsAuthor).toBe(false)
  })

  test.each(['wait', 'person'] as const)('%s still applies when nothing is cooling', (rule) => {
    const c = chooseFromProfile(
      profile(['codex/max', 'claude/opus'], { notTheAuthor: true, ifOnlyAuthorLeft: rule }),
      ctx({ 'codex/max': 'not-installed' }, { tool: 'claude' }),
    )
    expect(c.kind).toBe(rule)
  })
})
