import { describe, expect, test } from 'vitest'
import { unwrap } from '@osdlc/result'
import {
  adjustEffort,
  checkRef,
  contextArgs,
  defaultWindow,
  effortAdjustedMessage,
  launchMode,
  layerCatalogue,
  parseRef,
  queryCatalogue,
  resolveRef,
  viaArgs,
  type CatalogueLayer,
  type Ref,
} from '@osdlc/agent-router'

// A tiny catalogue of our own, so nothing here depends on the shipped snapshot.
const layer: CatalogueLayer = {
  source: 'config',
  observed_at: '2026-01-01',
  providers: { acme: { kind: 'openai-compatible' }, local: { kind: 'ollama' } },
  tools: {
    runner: { serves: ['acme'], openness: 'closed', modes: ['headless'] },
    // Reaches the local runtime only in a launch mode, as codex does.
    sidecar: {
      serves: [{ provider: 'local', via: '--oss --local-provider ollama' }],
      openness: 'closed',
      modes: ['headless'],
    },
  },
  models: {
    'acme/mini-1': { family: 'acme-mini', traits: ['agent'], release_date: '2026-01-01' },
    'acme/pro-1': {
      family: 'acme-pro',
      traits: ['agent'],
      release_date: '2026-02-01',
      context: { default: 200_000, max: 1_000_000 },
      efforts: ['low', 'medium', 'high'],
    },
    'acme/old-1': { status: 'deprecated', deprecated_on: '2025-12-01' },
    'acme/gone-1': { status: 'withdrawn' },
    'local/gemma3:4b': { traits: ['agent', 'local'] },
  },
}
const catalogue = queryCatalogue(layerCatalogue([layer]), {
  classify: [{ provider: 'acme', families: { 'acme-mini': 'fast', 'acme-pro': 'max' } }],
})

function ref(text: string): Ref {
  return unwrap(parseRef(text))
}

describe('resolving a reference', () => {
  test("resolveRef maps a tier to the tool's model and keeps the effort", () => {
    const resolved = resolveRef(ref('runner/max@high'), { catalogue })
    if (!resolved.ok) throw new Error(resolved.error.message)
    expect(resolved.value).toMatchObject({
      tool: 'runner',
      model: 'pro-1',
      effort: 'high',
      from: { kind: 'tier', tier: 'max' },
    })
  })

  test('resolveRef moves an effort one step when the model lacks it', () => {
    const resolved = resolveRef(ref('runner/max@xhigh'), { catalogue })
    if (!resolved.ok) throw new Error(resolved.error.message)
    expect(resolved.value.effort).toBe('high')
    expect(resolved.value.effortAdjusted).toEqual({
      requested: 'xhigh',
      direction: 'down',
      used: 'high',
    })
  })

  test('resolveRef fails with a kind: an unknown tool, a missing tier, a wildcard', () => {
    const kind = (text: string) => {
      const resolved = resolveRef(ref(text), { catalogue })
      return resolved.ok ? 'ok' : resolved.error.kind
    }
    expect(kind('nope/max')).toBe('unknown-tool')
    expect(kind('runner/standard')).toBe('no-tier-entry')
    expect(kind('*/max')).toBe('wildcard')
    expect(kind('runner/max@none')).toBe('unsupported-effort')
  })
})

describe('checking a reference', () => {
  test('checkRef is ok for a model the catalogue offers', () => {
    expect(checkRef(ref('runner/pro-1'), catalogue)).toEqual({ kind: 'ok' })
  })

  test('an unknown model only warns, unless strict', () => {
    const lax = checkRef(ref('runner/brand-new'), catalogue)
    expect(lax).toMatchObject({ kind: 'warning', code: 'unknown-model' })
    const strict = checkRef(ref('runner/brand-new'), catalogue, { strict: true })
    expect(strict).toMatchObject({ kind: 'error', code: 'unknown-model' })
  })

  test('a deprecated model warns and a withdrawn one is skipped', () => {
    expect(checkRef(ref('runner/old-1'), catalogue)).toMatchObject({
      kind: 'warning',
      code: 'deprecated-model',
    })
    expect(checkRef(ref('runner/gone-1'), catalogue)).toMatchObject({
      kind: 'skip',
      code: 'withdrawn-model',
    })
  })

  test('a tool that does not serve the provider is an error with a hint', () => {
    const checked = checkRef(ref('sidecar/pro-1'), catalogue)
    expect(checked).toMatchObject({ kind: 'error', code: 'provider-not-served' })
    if (checked.kind === 'error') expect(checked.hint).toBe('runner/pro-1')
  })
})

describe('effort', () => {
  test('adjustEffort keeps a supported effort', () => {
    expect(adjustEffort('high', ['low', 'high'])).toEqual({ effort: 'high' })
  })

  test('adjustEffort moves an unsupported one a single step, up first', () => {
    const moved = adjustEffort('medium', ['low', 'high'])
    expect(moved?.effort).toBe('high')
    expect(moved?.adjusted).toEqual({ requested: 'medium', direction: 'up', used: 'high' })
  })

  test('adjustEffort gives up when no neighbour is supported', () => {
    expect(adjustEffort('max', ['low'])).toBeUndefined()
    expect(adjustEffort('turbo', ['low'])).toBeUndefined()
  })

  test('effortAdjustedMessage words an adjustment for a trace', () => {
    const moved = adjustEffort('xhigh', ['low', 'high'])
    if (moved?.adjusted === undefined) throw new Error('expected an adjustment')
    expect(effortAdjustedMessage(moved.adjusted)).toBe(
      "effort 'xhigh' is not supported; using 'high', one step down",
    )
  })
})

describe('context windows', () => {
  test('defaultWindow is the window the tool runs a model with', () => {
    expect(defaultWindow(catalogue, 'runner', 'pro-1')).toBe(200_000)
    expect(defaultWindow(catalogue, 'runner', 'mini-1')).toBeUndefined()
    expect(defaultWindow(catalogue, 'runner', undefined)).toBeUndefined()
  })

  test('contextArgs asks claude for a 1m variant above its default window', () => {
    expect(contextArgs('claude', 'opus', 1_000_000)).toEqual({
      model: 'opus[1m]',
      contextUnchecked: false,
    })
    expect(contextArgs('claude', 'opus', 100_000)).toEqual({
      model: 'opus',
      contextUnchecked: false,
    })
  })

  test('contextArgs has a form for cursor and for an ollama runtime', () => {
    expect(contextArgs('cursor', 'sonnet', 1_000_000).model).toBe('sonnet[context=1m]')
    expect(contextArgs('ollama', 'gemma3:4b', 32_000).options).toEqual({ num_ctx: 32_000 })
  })

  test('for any other tool a size beyond the default window is unchecked', () => {
    expect(contextArgs('runner', 'pro-1', 100_000, 200_000)).toEqual({
      model: 'pro-1',
      contextUnchecked: false,
    })
    expect(contextArgs('runner', 'pro-1', 500_000, 200_000)).toEqual({ contextUnchecked: true })
  })
})

describe('launch modes', () => {
  test('viaArgs splits a launch mode into argv', () => {
    expect(viaArgs('--oss --local-provider ollama')).toEqual([
      '--oss',
      '--local-provider',
      'ollama',
    ])
  })

  test('launchMode is the mode a tool needs for a model, or nothing', () => {
    expect(launchMode(catalogue, 'sidecar', 'gemma3:4b')).toEqual({
      args: ['--oss', '--local-provider', 'ollama'],
      model: 'gemma3:4b',
      key: 'local/gemma3:4b',
    })
    expect(launchMode(catalogue, 'runner', 'pro-1')).toBeUndefined()
  })

  test('a local model the catalogue lacks is named provider/id', () => {
    expect(launchMode(catalogue, 'sidecar', 'local/newer:7b')).toEqual({
      args: ['--oss', '--local-provider', 'ollama'],
      model: 'newer:7b',
      key: 'local/newer:7b',
    })
  })
})
