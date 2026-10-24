/**
 * Unit tests for layered resolution (`../src/provenance.ts`).
 *
 * Every input is an in-memory `readRaw`/`defaultSteps`/`envSteps`, never a
 * real config file. Covers each layer and mode for `resolveLayeredSteps`:
 * default only, project replace, project prepend/append, local replace or
 * wrap on top of project and default, env replacing everything, and an async
 * `defaultSteps`. Also covers `resolveLayeredValue` across its three layers.
 */

import { describe, expect, test } from 'vitest'

import {
  type RawLayeredSteps,
  resolveLayeredSteps,
  resolveLayeredValue,
} from '../src/provenance.ts'

/** A `readRaw` that always reports "this layer names nothing." */
function noRaw(): undefined {
  return undefined
}

/** A `readRaw` that reports `entry` for exactly one layer, nothing for the other. */
function rawAt<T>(
  layer: 'local' | 'project',
  entry: RawLayeredSteps<T>,
): (l: 'local' | 'project') => RawLayeredSteps<T> | undefined {
  return (l) => (l === layer ? entry : undefined)
}

// ---------------------------------------------------------------------------
// resolveLayeredSteps
// ---------------------------------------------------------------------------

describe('resolveLayeredSteps — default only', () => {
  test('AC-1: no local/project/env entry resolves the default list, tagged {default, default}', async () => {
    const resolved = await resolveLayeredSteps('check', {
      defaultSteps: ['a', 'b'],
      readRaw: noRaw,
    })
    expect(resolved.steps).toEqual([
      { step: 'a', source: { layer: 'default', mode: 'default' } },
      { step: 'b', source: { layer: 'default', mode: 'default' } },
    ])
  })

  test('an async defaultSteps is awaited', async () => {
    const resolved = await resolveLayeredSteps('setup', {
      defaultSteps: async () => ['detected-command'],
      readRaw: noRaw,
    })
    expect(resolved.steps).toEqual([
      { step: 'detected-command', source: { layer: 'default', mode: 'default' } },
    ])
  })

  test('an empty default list resolves to a present, empty step list', async () => {
    const resolved = await resolveLayeredSteps('judge', {
      defaultSteps: [],
      readRaw: noRaw,
    })
    expect(resolved.steps).toEqual([])
  })
})

describe('resolveLayeredSteps — project layer', () => {
  test('AC-2: a project full-replace list wins over default, tagged {project, replace}', async () => {
    const resolved = await resolveLayeredSteps('check', {
      defaultSteps: ['default-a'],
      readRaw: rawAt('project', { steps: ['project-a', 'project-b'] }),
    })
    expect(resolved.steps).toEqual([
      { step: 'project-a', source: { layer: 'project', mode: 'replace' } },
      { step: 'project-b', source: { layer: 'project', mode: 'replace' } },
    ])
  })

  test('AC-3: a project {prepend, append} wraps default, default steps keep their own provenance', async () => {
    const resolved = await resolveLayeredSteps('check', {
      defaultSteps: ['default-a'],
      readRaw: rawAt('project', { prepend: ['pre'], append: ['post'] }),
    })
    expect(resolved.steps).toEqual([
      { step: 'pre', source: { layer: 'project', mode: 'prepend' } },
      { step: 'default-a', source: { layer: 'default', mode: 'default' } },
      { step: 'post', source: { layer: 'project', mode: 'append' } },
    ])
  })

  test('a project prepend with no append (and vice versa) contributes nothing on the missing side', async () => {
    const prependOnly = await resolveLayeredSteps('check', {
      defaultSteps: ['default-a'],
      readRaw: rawAt('project', { prepend: ['pre'] }),
    })
    expect(prependOnly.steps.map((s) => s.step)).toEqual(['pre', 'default-a'])

    const appendOnly = await resolveLayeredSteps('check', {
      defaultSteps: ['default-a'],
      readRaw: rawAt('project', { append: ['post'] }),
    })
    expect(appendOnly.steps.map((s) => s.step)).toEqual(['default-a', 'post'])
  })
})

describe('resolveLayeredSteps — local layer', () => {
  test('AC-4: a local full-replace list takes precedence over project+default entirely', async () => {
    const resolved = await resolveLayeredSteps('check', {
      defaultSteps: ['default-a'],
      readRaw: (layer) => (layer === 'project' ? { steps: ['project-a'] } : { steps: ['local-a'] }),
    })
    expect(resolved.steps).toEqual([
      { step: 'local-a', source: { layer: 'local', mode: 'replace' } },
    ])
  })

  test('AC-4: a local {prepend, append} wraps whatever project+default already resolved to', async () => {
    const resolved = await resolveLayeredSteps('check', {
      defaultSteps: ['default-a'],
      readRaw: (layer) =>
        layer === 'project'
          ? { prepend: ['project-pre'], append: ['project-post'] }
          : { prepend: ['local-pre'], append: ['local-post'] },
    })
    expect(resolved.steps).toEqual([
      { step: 'local-pre', source: { layer: 'local', mode: 'prepend' } },
      { step: 'project-pre', source: { layer: 'project', mode: 'prepend' } },
      { step: 'default-a', source: { layer: 'default', mode: 'default' } },
      { step: 'project-post', source: { layer: 'project', mode: 'append' } },
      { step: 'local-post', source: { layer: 'local', mode: 'append' } },
    ])
  })
})

describe('resolveLayeredSteps — env layer', () => {
  test('AC-5: envSteps wins outright over project+local, tagged {env, replace}, unwrapped', async () => {
    const resolved = await resolveLayeredSteps('check', {
      defaultSteps: ['default-a'],
      envSteps: ['env-a', 'env-b'],
      readRaw: (layer) =>
        layer === 'project' ? { prepend: ['project-pre'] } : { steps: ['local-a'] },
    })
    expect(resolved.steps).toEqual([
      { step: 'env-a', source: { layer: 'env', mode: 'replace' } },
      { step: 'env-b', source: { layer: 'env', mode: 'replace' } },
    ])
  })

  test('an env value of [] is a present, explicit empty replacement, not "unset"', async () => {
    const resolved = await resolveLayeredSteps('check', {
      defaultSteps: ['default-a'],
      envSteps: [],
      readRaw: noRaw,
    })
    expect(resolved.steps).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// resolveLayeredValue
// ---------------------------------------------------------------------------

describe('resolveLayeredValue', () => {
  test('AC-6: no local/project entry resolves the default value, layer: default', () => {
    const resolved = resolveLayeredValue('check', {
      defaultValue: 'check',
      readRaw: () => undefined,
    })
    expect(resolved).toEqual({ value: 'check', layer: 'default' })
  })

  test('AC-6: a project entry wins over default, layer: project', () => {
    const resolved = resolveLayeredValue('check', {
      defaultValue: 'check',
      readRaw: (layer) => (layer === 'project' ? 'project-check' : undefined),
    })
    expect(resolved).toEqual({ value: 'project-check', layer: 'project' })
  })

  test('AC-6: a local entry wins over project and default, layer: local', () => {
    const resolved = resolveLayeredValue('check', {
      defaultValue: 'check',
      readRaw: (layer) =>
        layer === 'local' ? 'local-check' : layer === 'project' ? 'project-check' : undefined,
    })
    expect(resolved).toEqual({ value: 'local-check', layer: 'local' })
  })

  test('a null value (an explicit override) is a real, present value, not "unset"', () => {
    const resolved = resolveLayeredValue('merge', {
      defaultValue: null as string | null,
      readRaw: (layer) => (layer === 'project' ? null : undefined),
    })
    expect(resolved).toEqual({ value: null, layer: 'project' })
  })
})
