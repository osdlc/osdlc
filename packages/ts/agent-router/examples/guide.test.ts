import { describe, expect, test } from 'vitest'
import { unwrap } from '@osdlc/result'
import {
  authorRule,
  BUILTIN_QUERY,
  chooseFromProfile,
  matchRule,
  parseProfile,
  parseProfiles,
  parseRef,
  parseRouting,
  resolveBinding,
  resolveRef,
  type Availability,
  type ChooseContext,
  type Profile,
} from '@osdlc/agent-router'

// The examples in docs/guide/getting-started.md, run as written. A change here means the guide needs the same
// change. Model names come from the snapshot, so they are read from it, not written out.

function profile(entries: string[]): Profile {
  return unwrap(parseProfile(entries))
}

function resolveText(text: string) {
  return resolveRef(unwrap(parseRef(text)), { catalogue: BUILTIN_QUERY })
}

const all = (): Availability => ({ ok: true })

describe('step 1: references', () => {
  test('a reference parses into its parts', () => {
    expect(parseRef('claude/opus@high')).toEqual({
      ok: true,
      value: { tool: 'claude', model: 'opus', effort: 'high' },
    })
  })

  test('mistakes are typed errors', () => {
    const upper = parseRef('Claude/max')
    expect(upper.ok ? undefined : upper.error.kind).toBe('invalid-tool')
    const bracket = parseRef('claude/opus[1m]')
    expect(bracket.ok ? undefined : bracket.error.kind).toBe('native-bracket')
    expect(bracket.ok ? '' : bracket.error.message).toContain('[ctx=1m]')
  })
})

describe('step 2: resolving', () => {
  test('a tier becomes the tool’s model for it', () => {
    const resolved = resolveText('codex/max')
    if (!resolved.ok) throw new Error(resolved.error.message)
    expect(resolved.value.model).toBe(BUILTIN_QUERY.tierModel('codex', 'max'))
    expect(resolved.value.from).toEqual({ kind: 'tier', tier: 'max' })
  })

  test.each([
    ['codex/sonnet', 'provider-not-served'],
    ['nope/max', 'unknown-tool'],
    ['antigravity@max', 'unsupported-effort'],
  ])('%s is refused with %s', (text, kind) => {
    const resolved = resolveText(text)
    expect(resolved.ok ? undefined : resolved.error.kind).toBe(kind)
  })

  test('codex/sonnet suggests claude/sonnet', () => {
    const resolved = resolveText('codex/sonnet')
    expect(resolved.ok ? undefined : resolved.error).toMatchObject({ hint: 'claude/sonnet' })
  })

  test('an effort one step off is moved, and the move recorded', () => {
    const resolved = resolveText('antigravity@xhigh')
    if (!resolved.ok) throw new Error(resolved.error.message)
    expect(resolved.value.effort).toBe('high')
    expect(resolved.value.effortAdjusted).toMatchObject({ requested: 'xhigh', direction: 'down' })
  })
})

describe('steps 3 and 4: profiles and outcomes', () => {
  test('an unavailable entry is skipped and traced', () => {
    const choice = chooseFromProfile(profile(['codex/max', 'claude/opus@high']), {
      catalogue: BUILTIN_QUERY,
      isAvailable: (resolved) =>
        resolved.tool === 'codex' ? { ok: false, reason: 'not-signed-in' } : { ok: true },
    })
    expect(choice.kind).toBe('chosen')
    expect(choice.summary).toBe('chosen: claude/opus@high')
    expect(choice.trace).toEqual([
      'codex/max: skipped: unavailable (not-signed-in)',
      'claude/opus@high: taken',
    ])
    expect(choice.skipped).toEqual([{ ref: 'codex/max', reason: 'not-signed-in' }])
  })

  test('when everything is cooling down, the first entry is still taken', () => {
    const choice = chooseFromProfile(profile(['codex/max', 'claude/max']), {
      catalogue: BUILTIN_QUERY,
      isAvailable: () => ({ ok: false, reason: 'cooling-down', detail: 'retry after 14:05' }),
    })
    expect(choice.kind).toBe('chosen')
    expect(choice.kind === 'chosen' && choice.allCooling).toBe(true)
    expect(choice.summary).toBe(
      'chosen: codex/max (all usable entries are cooling down; first one tried anyway)',
    )
  })

  test('a mistake in a later entry makes the whole profile invalid', () => {
    const choice = chooseFromProfile(profile(['codex/max', 'codex/sonnet']), {
      catalogue: BUILTIN_QUERY,
      isAvailable: all,
    })
    expect(choice.kind).toBe('invalid')
    if (choice.kind !== 'invalid') return
    expect(choice.errors.map((e) => e.entry)).toEqual(['codex/sonnet'])
    expect(choice.summary).toBe(
      "invalid: codex/sonnet: 'codex' does not serve anthropic, the provider of 'sonnet'; nearest valid: claude/sonnet",
    )
  })
})

describe('step 5: the author rule', () => {
  const reviewer = profile(['codex/max', 'claude/opus@high'])
  const codexMax = BUILTIN_QUERY.tierModel('codex', 'max')
  if (codexMax === undefined) throw new Error('the snapshot has no codex max model')
  const author = { tool: 'codex', model: codexMax }

  test('the author’s tool is set aside', () => {
    const choice = chooseFromProfile(reviewer, {
      catalogue: BUILTIN_QUERY,
      isAvailable: all,
      authorRule: authorRule({ not_the_author: true }),
      author,
    })
    expect(choice.trace).toEqual([
      "codex/max: skipped: author's tool (author rule step 1: not_the_author)",
      'claude/opus@high: taken',
    ])
  })

  test('different-model falls back to the author’s tool, and says so', () => {
    const choice = chooseFromProfile(reviewer, {
      catalogue: BUILTIN_QUERY,
      isAvailable: (resolved) =>
        resolved.tool === 'codex' ? { ok: true } : { ok: false, reason: 'not-signed-in' },
      authorRule: authorRule({ not_the_author: true }),
      author,
    })
    expect(choice.kind).toBe('chosen')
    if (choice.kind !== 'chosen') return
    expect(choice.sameToolAsAuthor).toBe(true)
    expect(choice.modelMayMatchAuthor).toBe(true)
    expect(choice.summary).toBe(
      "chosen: codex/max (same tool as author, model may match: entry's model equals the author's)",
    )
  })

  test.each([
    ['wait', 'wait'],
    ['person', 'person'],
  ] as const)('%s gives %s when only the author’s tool is left', (setting, kind) => {
    const choice = chooseFromProfile(reviewer, {
      catalogue: BUILTIN_QUERY,
      isAvailable: (resolved) =>
        resolved.tool === 'codex' ? { ok: true } : { ok: false, reason: 'not-signed-in' },
      authorRule: authorRule({ not_the_author: true, if_only_author_left: setting }),
      author,
    })
    expect(choice.kind).toBe(kind)
  })
})

describe('step 6: config', () => {
  test('profiles from config, with the built-ins beside them', () => {
    const profiles = parseProfiles({
      mechanical: ['pi/qwen2.5-coder:7b', 'claude/fast', 'codex/fast'],
      author: { order: ['claude/standard', 'codex/standard'], context: '1m' },
      reviewer: ['codex/max', 'claude/opus-5.5@high'],
    })
    if (!profiles.ok) throw new Error(profiles.error.message)
    expect(Object.keys(profiles.value).sort()).toEqual(
      ['author', 'default', 'mechanical', 'reviewer', 'small'].sort(),
    )
    const ctx: ChooseContext = { catalogue: BUILTIN_QUERY, isAvailable: all }
    const choice = resolveBinding({ profile: 'reviewer' }, profiles.value, ctx)
    expect(choice.ok && choice.value.kind).toBe('chosen')
  })

  test('the first matching routing rule wins', () => {
    const rules = parseRouting([
      { when: { workflow: 'review' }, profile: 'reviewer' },
      { when: { workflow: 'implement', complexity: 'small' }, profile: 'small' },
    ])
    if (!rules.ok) throw new Error(rules.error.message)
    expect(matchRule(rules.value, { workflow: 'review', complexity: 'large' })).toEqual({
      index: 0,
      rule: { when: { workflow: 'review' }, profile: 'reviewer' },
    })
  })
})
