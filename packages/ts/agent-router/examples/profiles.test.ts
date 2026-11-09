import { describe, expect, test } from 'vitest'
import { unwrap } from '@osdlc/result'
import {
  AVAILABILITY_REASONS,
  BUILTIN_PROFILES,
  IfOnlyAuthorLeftSchema,
  PROFILE_SKIP_REASONS,
  ProfileConfigSchema,
  ProfilesConfigSchema,
  authorRule,
  authorRuleFields,
  checkContext,
  chooseFromProfile,
  layerCatalogue,
  parseProfile,
  parseProfiles,
  parseRef,
  queryCatalogue,
  refProfile,
  resolveBinding,
  resolveRef,
  skipReasonText,
  validateProfile,
  type Availability,
  type CatalogueLayer,
  type Profile,
  type Resolved,
} from '@osdlc/agent-router'

// A tiny catalogue of our own, so nothing here depends on the shipped snapshot.
const layer: CatalogueLayer = {
  source: 'config',
  observed_at: '2026-01-01',
  providers: { acme: { kind: 'openai-compatible' }, other: { kind: 'openai-compatible' } },
  tools: {
    runner: { serves: ['acme'], openness: 'closed', modes: ['headless'] },
    backup: { serves: ['other'], openness: 'closed', modes: ['headless'] },
  },
  models: {
    'acme/mini-1': {
      family: 'acme-mini',
      traits: ['agent'],
      release_date: '2026-01-01',
      context: { max: 128_000 },
    },
    'acme/pro-1': {
      family: 'acme-pro',
      traits: ['agent'],
      release_date: '2026-02-01',
      context: { max: 1_000_000 },
    },
    'other/pro-x': { family: 'other-pro', traits: ['agent'], release_date: '2026-02-01' },
  },
}
const catalogue = queryCatalogue(layerCatalogue([layer]), {
  classify: [
    { provider: 'acme', families: { 'acme-mini': 'fast', 'acme-pro': 'max' } },
    { provider: 'other', families: { 'other-pro': 'max' } },
  ],
})
const everythingAvailable = (): Availability => ({ ok: true })

function profile(config: unknown): Profile {
  return unwrap(parseProfile(config))
}

function resolved(text: string): Resolved {
  return unwrap(resolveRef(unwrap(parseRef(text)), { catalogue }))
}

describe('parsing profiles', () => {
  test('parseProfile reads a bare list of references', () => {
    const parsed = parseProfile(['runner/max', 'backup/max@high'])
    if (!parsed.ok) throw new Error(parsed.error.message)
    expect(parsed.value.order).toEqual([
      { tool: 'runner', model: 'max' },
      { tool: 'backup', model: 'max', effort: 'high' },
    ])
  })

  test('parseProfile reads the long form with a host and a minimum context', () => {
    const parsed = parseProfile({ order: ['runner/max'], host: 'terminal', context: '200k' })
    if (!parsed.ok) throw new Error(parsed.error.message)
    expect(parsed.value).toMatchObject({ host: 'terminal', context: 200_000 })
  })

  test('parseProfile names what is wrong', () => {
    const kind = (input: unknown) => {
      const parsed = parseProfile(input)
      return parsed.ok ? 'ok' : parsed.error.kind
    }
    expect(kind('runner/max')).toBe('invalid-shape')
    expect(kind(['runner/max', 'Not A Ref'])).toBe('invalid-ref')
    expect(kind({ order: ['runner/max'], context: 'lots' })).toBe('invalid-context')
  })

  test('parseProfiles adds the built-in profiles to the ones a section defines', () => {
    const parsed = parseProfiles({ review: ['runner/max'] })
    if (!parsed.ok) throw new Error(parsed.error.message)
    expect(Object.keys(parsed.value).sort()).toEqual(['default', 'review', 'small'])
  })

  test('BUILTIN_PROFILES are `default` (standard tier) and `small` (fast tier)', () => {
    expect(BUILTIN_PROFILES).toEqual({ default: ['*/standard'], small: ['*/fast'] })
  })

  test('ProfileConfigSchema and ProfilesConfigSchema check the config shape', () => {
    expect(ProfileConfigSchema.safeParse(['runner/max']).success).toBe(true)
    expect(ProfileConfigSchema.safeParse({ order: ['runner/max'], bogus: 1 }).success).toBe(false)
    expect(ProfilesConfigSchema.safeParse({ review: ['runner/max'] }).success).toBe(true)
    expect(ProfilesConfigSchema.safeParse({ review: [] }).success).toBe(false)
  })
})

describe('validating a profile', () => {
  test('validateProfile is empty for a usable profile', () => {
    expect(validateProfile(profile(['runner/max', 'backup/max']), { catalogue })).toEqual([])
  })

  test('validateProfile names each entry the catalogue refuses', () => {
    const errors = validateProfile(profile(['runner/standard', 'runner/max']), { catalogue })
    expect(errors.map((e) => e.entry)).toEqual(['runner/standard'])
    expect(errors[0]?.message).toContain("no model for tier 'standard'")
  })

  test('refProfile makes the one-entry profile a single reference walks as', () => {
    const ref = parseRef('runner/max')
    if (!ref.ok) throw new Error(ref.error.message)
    expect(refProfile(ref.value)).toEqual({ order: [{ tool: 'runner', model: 'max' }] })
  })

  test('checkContext meets a context requirement with the catalogue sizes', () => {
    const entry = resolved('runner/max')
    expect(checkContext(entry, 500_000, undefined, catalogue)).toEqual({
      kind: 'ok',
      context: 500_000,
      unchecked: false,
    })
    expect(checkContext(entry, 2_000_000, undefined, catalogue).kind).toBe('error')
    // A profile's `context:` that the model cannot reach on its tool skips the entry.
    expect(checkContext(resolved('runner/mini-1'), undefined, 200_000, catalogue).kind).toBe('skip')
  })
})

describe('choosing from a profile', () => {
  test('chooseFromProfile takes the first available entry', () => {
    const choice = chooseFromProfile(profile(['runner/max', 'backup/max']), {
      catalogue,
      isAvailable: everythingAvailable,
    })
    if (choice.kind !== 'chosen') throw new Error(choice.summary)
    expect(choice.resolved).toMatchObject({ tool: 'runner', model: 'pro-1' })
    expect(choice.skipped).toEqual([])
  })

  test('an unavailable entry is skipped, with its reason', () => {
    const choice = chooseFromProfile(profile(['runner/max', 'backup/max']), {
      catalogue,
      isAvailable: (r) =>
        r.tool === 'runner' ? { ok: false, reason: 'not-installed' } : { ok: true },
    })
    if (choice.kind !== 'chosen') throw new Error(choice.summary)
    expect(choice.resolved.tool).toBe('backup')
    expect(choice.skipped).toEqual([{ ref: 'runner/max', reason: 'not-installed' }])
  })

  test('nothing available is `none`; an entry the catalogue refuses is `invalid`', () => {
    const nothing = chooseFromProfile(profile(['runner/max']), {
      catalogue,
      isAvailable: () => ({ ok: false, reason: 'over-budget' }),
    })
    expect(nothing.kind).toBe('none')
    const bad = chooseFromProfile(profile(['runner/standard']), {
      catalogue,
      isAvailable: everythingAvailable,
    })
    expect(bad.kind).toBe('invalid')
  })

  test('skipReasonText words a skip as one line', () => {
    expect(skipReasonText({ reason: 'author-tool' })).toBe("author's tool")
    expect(skipReasonText({ reason: 'cooling-down' })).toBe('unavailable (cooling-down)')
    expect(skipReasonText({ reason: 'not-launchable', detail: 'no binary' })).toBe(
      'unavailable (not-launchable: no binary)',
    )
  })

  test('AVAILABILITY_REASONS are a subset of PROFILE_SKIP_REASONS', () => {
    expect(AVAILABILITY_REASONS).toContain('not-installed')
    for (const reason of AVAILABILITY_REASONS) expect(PROFILE_SKIP_REASONS).toContain(reason)
    expect(PROFILE_SKIP_REASONS).toContain('author-tool')
  })
})

describe('the author rule', () => {
  test('authorRule fills the defaults of its config keys', () => {
    expect(authorRule({})).toEqual({ notTheAuthor: false, ifOnlyAuthorLeft: 'different-model' })
    expect(authorRule({ not_the_author: true, if_only_author_left: 'wait' })).toEqual({
      notTheAuthor: true,
      ifOnlyAuthorLeft: 'wait',
    })
  })

  test('IfOnlyAuthorLeftSchema and authorRuleFields describe the config keys', () => {
    expect(IfOnlyAuthorLeftSchema.safeParse('person').success).toBe(true)
    expect(IfOnlyAuthorLeftSchema.safeParse('shrug').success).toBe(false)
    expect(Object.keys(authorRuleFields)).toEqual(['not_the_author', 'if_only_author_left'])
  })

  test("with not_the_author, the walk sets aside the author's tool", () => {
    const choice = chooseFromProfile(profile(['runner/max', 'backup/max']), {
      catalogue,
      isAvailable: everythingAvailable,
      authorRule: authorRule({ not_the_author: true }),
      author: { tool: 'runner', model: 'pro-1' },
    })
    if (choice.kind !== 'chosen') throw new Error(choice.summary)
    expect(choice.resolved.tool).toBe('backup')
    expect(choice.authorStep).toBe(1)
    expect(choice.skipped[0]).toMatchObject({ ref: 'runner/max', reason: 'author-tool', step: 1 })
  })
})

describe('bindings', () => {
  const profiles = { review: profile(['runner/max', 'backup/max']) }
  const ctx = { catalogue, isAvailable: everythingAvailable }

  test('resolveBinding walks a named profile', () => {
    const choice = resolveBinding({ profile: 'review' }, profiles, ctx)
    if (!choice.ok) throw new Error(choice.error.message)
    expect(choice.value.kind).toBe('chosen')
  })

  test('resolveBinding walks an inline list, or a single `tool` reference', () => {
    const inline = resolveBinding({ profile: ['backup/max'] }, profiles, ctx)
    const single = resolveBinding({ tool: 'backup/max' }, profiles, ctx)
    for (const choice of [inline, single]) {
      if (!choice.ok || choice.value.kind !== 'chosen') throw new Error('expected a choice')
      expect(choice.value.resolved.tool).toBe('backup')
    }
  })

  test('resolveBinding reports a binding that cannot be walked', () => {
    const kind = (binding: Parameters<typeof resolveBinding>[0]) => {
      const result = resolveBinding(binding, profiles, ctx)
      return result.ok ? 'ok' : result.error.kind
    }
    expect(kind({})).toBe('binding-invalid')
    expect(kind({ profile: 'review', tool: 'runner' })).toBe('binding-invalid')
    expect(kind({ profile: 'nope' })).toBe('unknown-profile')
    expect(kind({ tool: 'Not A Ref' })).toBe('invalid-ref')
  })
})
