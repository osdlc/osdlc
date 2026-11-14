import { describe, expect, test } from 'vitest'

import { chooseFromProfile } from '../src/choose.ts'
import { layerCatalogue } from '../src/catalogue/layers.ts'
import { queryCatalogue } from '../src/catalogue/query.ts'
import { BUILTIN_QUERY, SNAPSHOT_LAYER } from '../src/catalogue/snapshot.ts'
import type { CatalogueLayer } from '../src/catalogue/types.ts'
import { expandChain } from '../src/chains.ts'
import { parseProfile } from '../src/profile.ts'
import { resolveRef } from '../src/resolve.ts'
import { IMAGE, names } from './image-fixture.ts'

/** A newer opus the snapshot does not know, the same day as a smaller-context sibling. */
const NEWER_OPUS: CatalogueLayer = {
  source: 'config',
  observed_at: '2026-10-09',
  models: {
    'anthropic/claude-opus-6': {
      family: 'claude-opus',
      release_date: '2026-10-08',
      context: { max: 1_000_000 },
      traits: ['agent'],
    },
    'anthropic/claude-opus-6-small': {
      family: 'claude-opus',
      release_date: '2026-10-08',
      context: { max: 200_000 },
      traits: ['agent'],
    },
  },
}

describe('expandChain', () => {
  test('AC-2: tools follow chains.order; within a tool newest first, then larger context', () => {
    const q = queryCatalogue(layerCatalogue([SNAPSHOT_LAYER, NEWER_OPUS]))
    const entries = expandChain('max', [], q).entries
    const tools = entries.map((e) => e.tool).filter((t, i, a) => a.indexOf(t) === i)
    expect(tools).toEqual(['claude', 'codex', 'cursor', 'antigravity', 'pi', 'opencode'])
    expect(
      entries
        .filter((e) => e.tool === 'claude')
        .slice(0, 4)
        .map((e) => e.model),
    ).toEqual([
      'anthropic/claude-opus-6',
      'anthropic/claude-opus-6-small',
      'anthropic/claude-opus-5-5',
      'anthropic/claude-opus-5',
    ])
  })

  test('chains.order reorders the tools; tools it leaves out follow', () => {
    const q = queryCatalogue(layerCatalogue([SNAPSHOT_LAYER]), { order: ['antigravity', 'codex'] })
    const tools = expandChain('max', [], q)
      .entries.map((e) => e.tool)
      .filter((t, i, a) => a.indexOf(t) === i)
    expect(tools).toEqual(['antigravity', 'codex', 'claude', 'cursor', 'opencode', 'pi'])
  })

  test('only current agent models of the tier; traits filter and are reported', () => {
    const entries = expandChain('standard', [], BUILTIN_QUERY).entries
    expect(entries.every((e) => BUILTIN_QUERY.tierOf(e.model!) === 'standard')).toBe(true)
    expect(entries.map((e) => e.model)).not.toContain('google/gemini-3.1-flash-lite-preview')
    const local = expandChain('fast', ['local'], BUILTIN_QUERY)
    expect(local.entries).toEqual([])
    expect(local.skipped[0]).toEqual({
      tool: 'claude',
      native_name: 'haiku',
      reason: 'missing-trait',
      detail: 'model anthropic/claude-haiku-5-5 lacks local',
    })
  })

  test('a pin heads its tool, flagged, and its model is not repeated', () => {
    const pinned = queryCatalogue(layerCatalogue([SNAPSHOT_LAYER]), {
      pins: { 'claude/max': 'claude-opus-5' },
    })
    const entries = expandChain('max', [], pinned)
    const claude = entries.entries.filter((e) => e.tool === 'claude')
    expect(claude[0]).toEqual({
      tool: 'claude',
      tier: 'max',
      native_name: 'claude-opus-5',
      model: 'anthropic/claude-opus-5',
      pinned: true,
    })
    expect(claude.filter((e) => e.model === 'anthropic/claude-opus-5')).toHaveLength(1)
    expect(claude.slice(1).every((e) => !e.pinned)).toBe(true)
  })
})

describe('image-out', () => {
  const q = queryCatalogue(layerCatalogue([SNAPSHOT_LAYER, IMAGE]))

  test('an entry asking for image-out expands to image models, agent or not', () => {
    const c = expandChain('standard', ['image-out'], q)
    expect(names(c)).toContain('google/test-image')
    expect(names(c)).toContain('google/test-image-agent')
    expect(
      c.entries.every((e) =>
        q.findModel(e.tool, e.native_name)?.model.traits?.includes('image-out'),
      ),
    ).toBe(true)
  })

  test('an entry that does not ask for image-out never takes an image model', () => {
    for (const traits of [[], ['vision']] as const) {
      const c = expandChain('standard', traits, q)
      expect(names(c)).not.toContain('google/test-image')
      expect(names(c)).not.toContain('google/test-image-agent')
      // A tier's image models are dropped silently: no skipped row, no noise.
      expect(c.skipped.some((k) => k.detail.includes('image-output'))).toBe(false)
    }
  })

  test('an image-out model that also embeds is still an embedding model', () => {
    const c = expandChain('standard', ['image-out'], q)
    expect(names(c)).not.toContain('google/test-image-embed')
    expect(c.skipped).toContainEqual(
      expect.objectContaining({
        reason: 'not-agent',
        detail: 'google/test-image-embed is an embedding model',
      }),
    )
  })

  test('a pin to an image or non-agent model still resolves, and a tier pin to one is reported', () => {
    const pinned = queryCatalogue(layerCatalogue([SNAPSHOT_LAYER, IMAGE]), {
      pins: { 'antigravity/standard': 'test-image' },
    })
    const c = expandChain('standard', [], pinned)
    expect(c.skipped).toContainEqual(
      expect.objectContaining({ detail: 'google/test-image is an image-output model' }),
    )
    const r = resolveRef({ tool: 'antigravity', model: 'test-image' }, { catalogue: q })
    expect(r.ok).toBe(true)
  })
})

describe('pins', () => {
  const pins = { 'claude/max': 'claude-opus-5-5' }

  test('AC-3: claude/max returns the pinned id before and after the catalogue gains a newer opus', () => {
    for (const layers of [[SNAPSHOT_LAYER], [SNAPSHOT_LAYER, NEWER_OPUS]]) {
      const q = queryCatalogue(layerCatalogue(layers), { pins })
      const r = resolveRef({ tool: 'claude', model: 'max' }, { catalogue: q })
      expect(r.ok && r.value.model).toBe('claude-opus-5-5')
      expect(r.ok && r.value.from).toEqual({ kind: 'tier', tier: 'max', pinned: true })
    }
    // Unpinned, the newer opus takes the tier.
    const floating = queryCatalogue(layerCatalogue([SNAPSHOT_LAYER, NEWER_OPUS]))
    expect(floating.tierModel('claude', 'max')).toBe('claude-opus-6')
  })

  test('the walk traces a pinned tier', () => {
    const q = queryCatalogue(layerCatalogue([SNAPSHOT_LAYER]), { pins })
    const p = parseProfile(['claude/max'])
    if (!p.ok) throw new Error(p.error.message)
    const c = chooseFromProfile(p.value, {
      catalogue: q,
      isAvailable: () => ({ ok: true }),
    })
    expect(c.trace).toEqual([
      'claude/max: pinned: claude/max is claude-opus-5-5',
      'claude/max: taken',
    ])
  })

  test('a pin the catalogue does not know warns, as any unknown model', () => {
    const q = queryCatalogue(layerCatalogue([SNAPSHOT_LAYER]), {
      pins: { 'claude/max': 'opus-9' },
    })
    const r = resolveRef({ tool: 'claude', model: 'max' }, { catalogue: q })
    expect(r.ok && r.value.check.kind).toBe('warning')
  })
})

describe('author rule step 3 (AC-7)', () => {
  const reviewer = parseProfile(['claude/max'])
  if (!reviewer.ok) throw new Error(reviewer.error.message)
  const ctx = (author: { tool: string; model?: string }) => ({
    catalogue: BUILTIN_QUERY,
    isAvailable: () => ({ ok: true }) as const,
    authorRule: { notTheAuthor: true, ifOnlyAuthorLeft: 'different-model' } as const,
    author,
  })

  test('author claude/claude-opus-5-5 gets the next max model of the claude chain', () => {
    const c = chooseFromProfile(reviewer.value, ctx({ tool: 'claude', model: 'claude-opus-5-5' }))
    expect(c.kind === 'chosen' && c.resolved.model).toBe('claude-opus-5')
    expect(c.kind === 'chosen' && BUILTIN_QUERY.tierOf(`anthropic/${c.resolved.model}`)).toBe('max')
    expect(c.kind === 'chosen' && c.modelMayMatchAuthor).toBeUndefined()
  })

  test('never a lower tier: with every other max model unavailable it is step 4', () => {
    const c = chooseFromProfile(reviewer.value, {
      ...ctx({ tool: 'claude', model: 'claude-opus-5-5' }),
      isAvailable: (r) =>
        r.text === 'claude/max' ? { ok: true } : { ok: false, reason: 'not-installed' },
    })
    expect(c).toMatchObject({ kind: 'chosen', modelMayMatchAuthor: true })
    expect(c.kind === 'chosen' && c.resolved.model).toBe('opus')
  })

  test('a named entry uses its catalogue tier; an unclassified one goes to step 4', () => {
    const named = parseProfile(['claude/claude-sonnet-5-5'])
    if (!named.ok) throw new Error(named.error.message)
    const c = chooseFromProfile(named.value, ctx({ tool: 'claude', model: 'sonnet' }))
    expect(c.kind === 'chosen' && c.resolved.model).toBe('claude-sonnet-5')

    const fable = parseProfile(['claude/fable'])
    if (!fable.ok) throw new Error(fable.error.message)
    const f = chooseFromProfile(fable.value, ctx({ tool: 'claude', model: 'claude-fable-5-1' }))
    expect(f).toMatchObject({ kind: 'chosen', modelMayMatchAuthor: true })
    expect(f.trace).toContain('author rule step 3: claude/fable: tier unknown')
  })
})
