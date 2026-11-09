import { describe, expect, test } from 'vitest'

import { layerCatalogue } from '../src/catalogue/layers.ts'
import { queryCatalogue } from '../src/catalogue/query.ts'
import { BUILTIN_QUERY, SNAPSHOT_LAYER } from '../src/catalogue/snapshot.ts'
import { parseRef } from '../src/ref.ts'
import { checkRef, type CheckContext, type Validity } from '../src/validity.ts'

/** The snapshot plus a withdrawn Claude model. */
const WITH_WITHDRAWN = queryCatalogue(
  layerCatalogue([
    SNAPSHOT_LAYER,
    {
      source: 'config',
      observed_at: '2026-10-09',
      models: { 'anthropic/claude-opus-3': { status: 'withdrawn' } },
    },
  ]),
)

/** The snapshot with antigravity told it takes no effort. */
const NO_EFFORT = queryCatalogue(
  layerCatalogue([
    SNAPSHOT_LAYER,
    { source: 'config', observed_at: '2026-10-09', tools: { antigravity: { efforts: [] } } },
  ]),
)

function check(text: string, ctx: CheckContext = {}, catalogue = BUILTIN_QUERY): Validity {
  const r = parseRef(text)
  if (!r.ok) throw new Error(r.error.message)
  return checkRef(r.value, catalogue, ctx)
}

describe('checkRef errors', () => {
  test('AC-1: codex/sonnet is an error whose hint is claude/sonnet', () => {
    const v = check('codex/sonnet')
    expect(v).toMatchObject({ kind: 'error', code: 'provider-not-served', hint: 'claude/sonnet' })
    expect(v.kind === 'error' && v.message).toContain('nearest valid: claude/sonnet')
  })

  test('the hint keeps an effort the nearest tool accepts, and honours knownTools', () => {
    expect(check('codex/sonnet@high')).toMatchObject({ hint: 'claude/sonnet@high' })
    expect(check('claude/gpt-5.5', { knownTools: ['claude', 'codex'] })).toMatchObject({
      kind: 'error',
      code: 'provider-not-served',
      hint: 'codex/gpt-5.5',
    })
  })

  test('AC-2: claude/opus@none, two steps off, is an error listing low, medium, high, xhigh, max', () => {
    const v = check('claude/opus@none')
    expect(v).toMatchObject({
      kind: 'error',
      code: 'unsupported-effort',
      efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    })
    expect(v.kind === 'error' && v.message).toContain('supported: low, medium, high, xhigh, max')
  })

  test('AC-3: claude/opus@xhigh is ok; one step off is ok, two steps is an error', () => {
    expect(check('claude/opus@xhigh')).toEqual({ kind: 'ok' })
    // claude-opus-4-6's snapshot row has no xhigh; the resolve moves it one step up to max.
    expect(check('claude/claude-opus-4-6@xhigh')).toEqual({ kind: 'ok' })
    // antigravity takes low to high: max is two steps above high.
    expect(check('antigravity@max')).toMatchObject({
      kind: 'error',
      code: 'unsupported-effort',
      efforts: ['low', 'medium', 'high'],
    })
  })

  test('an unknown tool and a tier the tool has no entry for are errors', () => {
    expect(check('mystery/max')).toMatchObject({ kind: 'error', code: 'unknown-tool' })
    expect(check('cursor', { knownTools: ['claude'] })).toMatchObject({ code: 'unknown-tool' })
    // Cursor lists no model the classifier places in fast.
    expect(check('cursor/fast')).toMatchObject({ kind: 'error', code: 'no-tier-entry' })
  })

  test('a provider-qualified unknown model on a tool that does not serve the provider is an error', () => {
    expect(check('codex/anthropic/claude-opus-9')).toMatchObject({
      kind: 'error',
      code: 'provider-not-served',
    })
  })

  test('an effort on a tool that takes none is an error', () => {
    const v = check('antigravity/gemini-2.5-pro@high', {}, NO_EFFORT)
    expect(v).toMatchObject({ kind: 'error', code: 'unsupported-effort', efforts: [] })
    expect(v.kind === 'error' && v.message).toContain('takes no effort')
  })
})

describe('checkRef warnings and skips', () => {
  test('AC-4: claude/opus-6, absent from the snapshot, is a warning', () => {
    expect(check('claude/opus-6')).toMatchObject({ kind: 'warning', code: 'unknown-model' })
    // Effort on an unknown model is checked against the tool's own levels only.
    expect(check('claude/opus-6@high')).toMatchObject({ kind: 'warning' })
    expect(check('claude/opus-6@none')).toMatchObject({ code: 'unsupported-effort' })
  })

  test('AC-5: with strict the unknown model is an error; a deprecated model still warns', () => {
    expect(check('claude/opus-6', { strict: true })).toMatchObject({
      kind: 'error',
      code: 'unknown-model',
    })
    expect(check('codex/gpt-4-turbo')).toMatchObject({ kind: 'warning', code: 'deprecated-model' })
    expect(check('codex/gpt-4-turbo', { strict: true })).toMatchObject({
      kind: 'warning',
      code: 'deprecated-model',
    })
  })

  test('a withdrawn model is a skip', () => {
    expect(check('claude/claude-opus-3', {}, WITH_WITHDRAWN)).toMatchObject({
      kind: 'skip',
      code: 'withdrawn-model',
    })
  })

  test('tiers, tool defaults and known models are ok', () => {
    for (const ref of [
      'claude/max',
      'claude',
      'claude@high',
      'codex/max@high',
      'antigravity/standard',
    ]) {
      expect([ref, check(ref)]).toEqual([ref, { kind: 'ok' }])
    }
  })
})
