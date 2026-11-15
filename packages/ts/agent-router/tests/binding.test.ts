import { describe, expect, test } from 'vitest'
import { resolveBinding } from '../src/binding.ts'
import type { ChooseContext } from '../src/choose.ts'
import { parseProfiles } from '../src/profile.ts'
import { BUILTIN_QUERY } from '../src/catalogue/snapshot.ts'

const catalogue = BUILTIN_QUERY
const ctx: ChooseContext = { catalogue, isAvailable: () => ({ ok: true }) }

const parsed = parseProfiles({ review: ['claude/max'], quick: ['claude/fast'] })
if (!parsed.ok) throw new Error(parsed.error.message)
const profiles = parsed.value

describe('resolveBinding', () => {
  test.each([
    ['neither', {}],
    ['both', { profile: 'review', tool: 'claude' }],
  ])('binding-invalid: %s', (_name, binding) => {
    const r = resolveBinding(binding, profiles, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('binding-invalid')
  })

  test('unknown profile lists known names', () => {
    const r = resolveBinding({ profile: 'nope' }, profiles, ctx)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe('unknown-profile')
    expect(r.error.message).toContain('quick, review')
  })

  test('inherited object keys are not profiles', () => {
    const r = resolveBinding({ profile: 'toString' }, profiles, ctx)
    expect(r.ok).toBe(false)
  })

  test('profile binding chooses', () => {
    const r = resolveBinding({ profile: 'review' }, profiles, ctx)
    expect(r.ok && r.value.kind).toBe('chosen')
    expect(r.ok && r.value.kind === 'chosen' && r.value.resolved.model).toBe('opus')
  })

  test('tool binding becomes a one-entry profile', () => {
    const r = resolveBinding({ tool: 'claude/fast' }, {}, ctx)
    expect(r.ok).toBe(true)
    if (!r.ok || r.value.kind !== 'chosen') throw new Error('expected chosen')
    expect(r.value.resolved.model).toBe('haiku')
    expect(r.value.trace).toEqual(['claude/fast: taken'])
    expect(r.value.summary).toBe('chosen: claude/fast')
  })

  test('tool binding ignores the author', () => {
    const r = resolveBinding({ tool: 'claude' }, {}, { ...ctx, author: { tool: 'claude' } })
    expect(r.ok && r.value.kind).toBe('chosen')
  })

  test('unavailable tool binding -> none', () => {
    const r = resolveBinding(
      { tool: 'claude' },
      {},
      { catalogue, isAvailable: () => ({ ok: false, reason: 'not-installed' }) },
    )
    expect(r.ok && r.value.kind).toBe('none')
  })

  test('bad ref wraps the parse error', () => {
    const r = resolveBinding({ tool: 'claude/' }, profiles, ctx)
    expect(r.ok).toBe(false)
    if (r.ok || r.error.kind !== 'invalid-ref') throw new Error('expected invalid-ref')
    expect(r.error.error.kind).toBe('empty-model')
  })

  test('tool binding with an unresolvable ref surfaces invalid', () => {
    const r = resolveBinding({ tool: 'mystery/max' }, {}, ctx)
    expect(r.ok && r.value.kind).toBe('invalid')
  })

  test('profile binding with an unresolvable entry surfaces invalid', () => {
    const p = parseProfiles({ bad: ['claude/max', 'mystery/max'] })
    if (!p.ok) throw new Error(p.error.message)
    const r = resolveBinding({ profile: 'bad' }, p.value, ctx)
    expect(r.ok && r.value.kind).toBe('invalid')
  })
})

describe('inline profile binding', () => {
  test('an inline list walks as an unnamed profile', () => {
    const r = resolveBinding({ profile: ['claude/max', 'claude/fast'] }, {}, ctx)
    expect(r.ok && r.value.kind === 'chosen' && r.value.resolved.model).toBe('opus')
  })

  test('an inline list falls through an unavailable entry', () => {
    const r = resolveBinding(
      { profile: ['claude/max', 'codex'] },
      {},
      {
        ...ctx,
        isAvailable: (e) =>
          e.tool === 'claude' ? { ok: false, reason: 'not-installed' } : { ok: true },
      },
    )
    expect(r.ok && r.value.kind === 'chosen' && r.value.resolved.tool).toBe('codex')
  })

  test('an inline list applies the author rule, as a named profile does', () => {
    const r = resolveBinding(
      { profile: ['claude/max', 'codex'] },
      {},
      {
        ...ctx,
        author: { tool: 'claude' },
        authorRule: { notTheAuthor: true, ifOnlyAuthorLeft: 'different-model' },
      },
    )
    expect(r.ok && r.value.kind === 'chosen' && r.value.resolved.tool).toBe('codex')
  })

  test.each([
    ['empty', []],
    ['bad ref', ['claude/']],
    ['long form object', { order: ['claude/max'] }],
    ['null', null],
  ])('an invalid inline list is invalid-profile: %s', (_name, list) => {
    const r = resolveBinding({ profile: list as string[] }, {}, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('invalid-profile')
  })
})

describe('wildcards', () => {
  test('a wildcard tool walks as a one-entry profile, through the built-in order', () => {
    const wild = parseProfiles({ any: ['*/fast'] })
    if (!wild.ok) throw new Error(wild.error.message)
    const asProfile = resolveBinding({ profile: 'any' }, wild.value, ctx)
    const asTool = resolveBinding({ tool: '*/fast' }, {}, ctx)
    expect(asTool.ok && asTool.value.kind).toBe('chosen')
    expect(asTool.ok && asTool.value.kind === 'chosen' && asTool.value.resolved.text).toBe(
      asProfile.ok && asProfile.value.kind === 'chosen' ? asProfile.value.resolved.text : '',
    )
  })

  test('a wildcard tool passes over an unavailable candidate, as a profile does', () => {
    const r = resolveBinding(
      { tool: '*/fast' },
      {},
      {
        ...ctx,
        isAvailable: (e) =>
          e.tool === 'claude' ? { ok: false, reason: 'not-installed' } : { ok: true },
      },
    )
    expect(r.ok && r.value.kind === 'chosen' && r.value.resolved.tool).not.toBe('claude')
  })
})

describe('resolveBinding never throws on a wrong shape', () => {
  test.each([
    ['a number', { tool: 5 }],
    ['a list', { tool: ['claude'] }],
    ['null', { tool: null }],
    ['an object', { tool: { tool: 'claude' } }],
  ])('a tool that is %s is binding-invalid', (_name, binding) => {
    const r = resolveBinding(binding as never, profiles, ctx)
    expect(!r.ok && r.error.kind).toBe('binding-invalid')
    expect(!r.ok && r.error.message).toBe('binding tool: expected a reference string')
  })

  test.each([null, 'claude', ['claude']])('a binding that is %j is binding-invalid', (binding) => {
    const r = resolveBinding(binding as never, profiles, ctx)
    expect(!r.ok && r.error.kind).toBe('binding-invalid')
  })
})
