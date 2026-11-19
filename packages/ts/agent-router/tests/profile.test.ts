import { describe, expect, test } from 'vitest'
import { parseProfile, parseProfiles, ProfileConfigSchema } from '../src/profile.ts'

describe('parseProfile', () => {
  test('a bare list is the order', () => {
    expect(parseProfile(['claude/max', 'codex'])).toEqual({
      ok: true,
      value: { order: [{ tool: 'claude', model: 'max' }, { tool: 'codex' }] },
    })
  })

  test('long form with all fields', () => {
    expect(
      parseProfile({
        order: ['claude/opus@high'],
        host: 'tmux',
        context: '1m',
      }),
    ).toEqual({
      ok: true,
      value: {
        order: [{ tool: 'claude', model: 'opus', effort: 'high' }],
        host: 'tmux',
        context: 1_000_000,
      },
    })
  })

  test('an unknown key is named: a profile has no headless field', () => {
    expect(parseProfile({ order: ['claude'], headless: false })).toEqual({
      ok: false,
      error: { kind: 'invalid-shape', message: 'Unrecognized key: "headless"' },
    })
  })

  test('the author rule is not a profile key: it belongs to the caller (pr_review)', () => {
    for (const key of ['not_the_author', 'if_only_author_left']) {
      expect(parseProfile({ order: ['claude'], [key]: true })).toEqual({
        ok: false,
        error: { kind: 'invalid-shape', message: `Unrecognized key: "${key}"` },
      })
    }
  })

  test('no host key when absent', () => {
    const r = parseProfile({ order: ['claude'] })
    expect(r.ok && 'host' in r.value).toBe(false)
  })

  test.each([
    ['unknown key', { order: ['claude'], extra: 1 }],
    ['empty order', { order: [] }],
    ['empty bare list', []],
    ['missing order', { host: 'tmux' }],
    ['bad host type', { order: ['claude'], host: 3 }],
    ['non-string entry', ['claude', 3]],
    ['string', 'claude'],
    ['null', null],
  ])('invalid-shape: %s', (_name, input) => {
    const r = parseProfile(input)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('invalid-shape')
    expect(r.error.message.length).toBeGreaterThan(0)
  })

  test('bad ref names the index and the parse error', () => {
    const r = parseProfile(['claude', 'codex/'])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('invalid-ref')
    if (r.error.kind !== 'invalid-ref') return
    expect(r.error.index).toBe(1)
    expect(r.error.error.kind).toBe('empty-model')
    expect(r.error.message).toContain('order[1]')
  })

  test('schema accepts both forms', () => {
    expect(ProfileConfigSchema.safeParse(['a']).success).toBe(true)
    expect(ProfileConfigSchema.safeParse({ order: ['a'] }).success).toBe(true)
  })
})

describe('parseProfiles', () => {
  test('map of profiles', () => {
    const r = parseProfiles({
      review: { order: ['codex'], host: 'tmux' },
      work: ['claude'],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Object.keys(r.value).sort()).toEqual(['default', 'review', 'small', 'work'])
    expect(r.value.review?.host).toBe('tmux')
    expect(r.value.work?.order).toEqual([{ tool: 'claude' }])
  })

  test('AC-6: with no profiles, default and small exist as the standard and fast chains', () => {
    const r = parseProfiles({})
    expect(r.ok && Object.keys(r.value).sort()).toEqual(['default', 'small'])
    expect(r.ok && r.value.default?.order).toEqual([{ tool: '*', model: 'standard' }])
    expect(r.ok && r.value.small?.order).toEqual([{ tool: '*', model: 'fast' }])
  })

  test('AC-6: a project definition replaces the built-in whole', () => {
    const r = parseProfiles({ default: { order: ['codex/max'], host: 'tmux' } })
    expect(r.ok && r.value.default).toEqual({
      order: [{ tool: 'codex', model: 'max' }],
      host: 'tmux',
    })
    expect(r.ok && r.value.small?.order).toEqual([{ tool: '*', model: 'fast' }])
  })

  test('invalid shape', () => {
    const r = parseProfiles({ a: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('invalid-shape')
  })

  test('bad ref names the profile', () => {
    const r = parseProfiles({ ok: ['claude'], bad: ['x@'] })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('invalid-ref')
    expect(r.error.message).toContain("profile 'bad'")
  })
})

describe('context and wildcard entries', () => {
  test('context: in the long form parses into tokens', () => {
    const r = parseProfile({ order: ['claude/max'], context: '1m' })
    expect(r.ok && r.value.context).toBe(1_000_000)
  })

  test('a bad context: is an error naming the form', () => {
    const r = parseProfile({ order: ['claude/max'], context: '1M' })
    expect(r).toMatchObject({ ok: false, error: { kind: 'invalid-context' } })
    expect(!r.ok && r.error.message).toContain('digits plus k or m')
    expect(parseProfile({ order: ['claude/max'], context: 1_000_000 }).ok).toBe(false)
  })

  test('AC-4: a wildcard parses in a profile entry', () => {
    const r = parseProfiles({ mechanical: ['*/fast[local]', 'claude/fast'] })
    expect(r.ok && r.value.mechanical?.order[0]).toEqual({
      tool: '*',
      model: 'fast',
      qualifiers: { traits: ['local'] },
    })
  })
})

describe('fixed edges', () => {
  test('a __proto__ profile name is refused, not dropped', () => {
    const r = parseProfiles(JSON.parse('{"__proto__": ["claude/max"], "ok": ["claude"]}'))
    expect(!r.ok && r.error.kind).toBe('invalid-shape')
    expect(!r.ok && r.error.message).toContain('__proto__')
  })

  test('a context above the largest size is refused', () => {
    const r = parseProfile({ order: ['claude'], context: '99999999999999999999999m' })
    expect(!r.ok && r.error.kind).toBe('invalid-context')
    expect(!r.ok && r.error.message).toContain('above the largest size')
  })
})
