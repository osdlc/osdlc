import { describe, expect, test } from 'vitest'

import { customAdapter } from '../src/adapters/custom.js'
import { deepseekAdapter } from '../src/adapters/deepseek.js'
import type { AgentAdapter } from '../src/adapters/types.js'
import { explainText } from '../src/cli/main.js'
import { BASELINE_ENV, buildChildEnv } from '../src/env.js'
import { callAgent, planCall } from '../src/run.js'
import type { AgentCallSpec } from '../src/spec.js'

// Spawns /bin/sh for real; no agent CLI is needed.

const PARENT = { PATH: '/usr/bin:/bin', HOME: '/h', GH_TOKEN: 'gh', OTHER: 'o' }

describe('buildChildEnv', () => {
  test('default: the whole parent plus the planned env', () => {
    expect(buildChildEnv(PARENT, { prompt: 'x' }, { A: '1' })).toEqual({ ...PARENT, A: '1' })
    expect(buildChildEnv(PARENT, { prompt: 'x', inheritEnv: 'all' }, {})).toEqual(PARENT)
  })

  test('unsetEnv removes names, and ones the parent lacks are ignored', () => {
    const env = buildChildEnv(PARENT, { prompt: 'x', unsetEnv: ['GH_TOKEN', 'NOPE'] }, {})
    expect(env).toEqual({ PATH: PARENT.PATH, HOME: '/h', OTHER: 'o' })
  })

  test('an inheritEnv list keeps only the named parent variables', () => {
    const env = buildChildEnv(PARENT, { prompt: 'x', inheritEnv: ['PATH', 'HOME'] }, {})
    expect(env).toEqual({ PATH: PARENT.PATH, HOME: '/h' })
    expect(buildChildEnv(PARENT, { prompt: 'x', inheritEnv: [] }, {})).toEqual({})
  })

  test('planned env (adapter, then spec.env) is added after the filter and the removals', () => {
    const env = buildChildEnv(
      PARENT,
      { prompt: 'x', inheritEnv: ['PATH'], unsetEnv: ['PATH', 'GH_TOKEN'] },
      { PATH: '/opt/bin', GH_TOKEN: 'explicit', NEW: 'n' },
    )
    expect(env).toEqual({ PATH: '/opt/bin', GH_TOKEN: 'explicit', NEW: 'n' })
  })

  test('Windows names match in any case, without running on Windows', () => {
    const parent = { Path: 'p', GitHub_Token: 't', Home: 'h' }
    const spec = { prompt: 'x', inheritEnv: ['PATH', 'GITHUB_TOKEN'], unsetEnv: ['github_token'] }
    expect(buildChildEnv(parent, spec, {}, undefined, true)).toEqual({ Path: 'p' })
    expect(buildChildEnv(parent, spec, {}, undefined, false)).toEqual({})
    expect(buildChildEnv({ Path: 'p' }, { prompt: 'x' }, { PATH: 'q' }, undefined, true)).toEqual({
      PATH: 'q',
    })
  })

  test('BASELINE_ENV names PATH and HOME and is frozen', () => {
    expect(BASELINE_ENV).toContain('PATH')
    expect(BASELINE_ENV).toContain('HOME')
    expect(Object.isFrozen(BASELINE_ENV)).toBe(true)
  })
})

describe('the plan', () => {
  test('the policy is on planned.spec and in the explain text, names only', () => {
    const planned = planCall(deepseekAdapter(), {
      prompt: 'x',
      permissions: { mode: 'edits' },
      env: { SECRET_VALUE: 'hunter2' },
      inheritEnv: [...BASELINE_ENV],
      unsetEnv: ['GH_TOKEN', 'GITHUB_TOKEN'],
    })
    expect(planned.spec.unsetEnv).toEqual(['GH_TOKEN', 'GITHUB_TOKEN'])
    expect(planned.env['DSH_PERMISSION_MODE']).toBeDefined()
    const text = explainText(planned, [])
    expect(text).toContain('unsetEnv: GH_TOKEN, GITHUB_TOKEN')
    expect(text).toContain('inheritEnv: only ')
    expect(text).toContain('PATH')
    expect(text).not.toContain('hunter2')
  })

  test('the default plan prints no policy lines', () => {
    const text = explainText(planCall(deepseekAdapter(), { prompt: 'x' }), [])
    expect(text).not.toContain('inheritEnv')
    expect(text).not.toContain('unsetEnv')
  })
})

/** Prints the watched variables as `NAME=value`, or `NAME=<unset>`. */
const printer: AgentAdapter = (() => {
  const base = customAdapter({
    name: 'printer',
    binary: '/bin/sh',
    args: () => [
      '-c',
      'for n in GH_TOKEN GITHUB_TOKEN KEEP OTHER ADAPTER_SET EXPLICIT; do ' +
        'eval "v=\\${$n-<unset>}"; echo "$n=$v"; done',
    ],
  })
  return {
    ...base,
    plan: (spec) => {
      const planned = base.plan(spec)
      return { ...planned, env: { ADAPTER_SET: 'from-adapter', ...planned.env } }
    },
  }
})()

async function seen(spec: AgentCallSpec): Promise<Record<string, string>> {
  const result = await callAgent(printer, spec)
  expect(result.ok).toBe(true)
  return Object.fromEntries(
    result.raw.stdout
      .trim()
      .split('\n')
      .map((l) => l.split('=') as [string, string]),
  )
}

describe('a real spawn', () => {
  const saved = { ...process.env }
  const setParent = (): void => {
    process.env['GH_TOKEN'] = 'gh-secret'
    process.env['GITHUB_TOKEN'] = 'github-secret'
    process.env['KEEP'] = 'kept'
    process.env['OTHER'] = 'other'
    delete process.env['ADAPTER_SET']
  }
  const restore = (): void => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
    Object.assign(process.env, saved)
  }

  test('default: the child sees everything, unchanged', async () => {
    setParent()
    try {
      const got = await seen({ prompt: 'x', env: { EXPLICIT: 'e' } })
      expect(got).toEqual({
        GH_TOKEN: 'gh-secret',
        GITHUB_TOKEN: 'github-secret',
        KEEP: 'kept',
        OTHER: 'other',
        ADAPTER_SET: 'from-adapter',
        EXPLICIT: 'e',
      })
    } finally {
      restore()
    }
  })

  test('unsetEnv: the removed variables are absent in the child', async () => {
    setParent()
    try {
      const got = await seen({ prompt: 'x', unsetEnv: ['GH_TOKEN', 'GITHUB_TOKEN'] })
      expect(got['GH_TOKEN']).toBe('<unset>')
      expect(got['GITHUB_TOKEN']).toBe('<unset>')
      expect(got['KEEP']).toBe('kept')
    } finally {
      restore()
    }
  })

  test('unsetEnv: spec.env can put a removed name back', async () => {
    setParent()
    try {
      const got = await seen({ prompt: 'x', unsetEnv: ['GH_TOKEN'], env: { GH_TOKEN: 'given' } })
      expect(got['GH_TOKEN']).toBe('given')
    } finally {
      restore()
    }
  })

  test('inheritEnv list: everything else is dropped, adapter and spec.env survive', async () => {
    setParent()
    try {
      const got = await seen({
        prompt: 'x',
        inheritEnv: [...BASELINE_ENV, 'KEEP'],
        env: { EXPLICIT: 'e' },
      })
      expect(got).toEqual({
        GH_TOKEN: '<unset>',
        GITHUB_TOKEN: '<unset>',
        KEEP: 'kept',
        OTHER: '<unset>',
        ADAPTER_SET: 'from-adapter',
        EXPLICIT: 'e',
      })
    } finally {
      restore()
    }
  })

  test('a list without PATH fails with spawn-failed for a bare binary name', async () => {
    const bare = customAdapter({ name: 'bare', binary: 'sh', args: () => ['-c', 'true'] })
    const result = await callAgent(bare, { prompt: 'x', inheritEnv: ['HOME'] })
    expect(result.ok).toBe(false)
    expect(result.error?.reason).toBe('spawn-failed')
    expect(result.error?.detail).toContain('no PATH')
  })

  test('a binary given as a path needs no PATH', async () => {
    const result = await callAgent(printer, { prompt: 'x', inheritEnv: [] })
    expect(result.ok).toBe(true)
  })

  test('a bare binary still resolves when PATH is kept', async () => {
    const bare = customAdapter({ name: 'bare', binary: 'sh', args: () => ['-c', 'echo hi'] })
    const result = await callAgent(bare, { prompt: 'x', inheritEnv: ['PATH'] })
    expect(result.ok).toBe(true)
    expect(result.raw.stdout.trim()).toBe('hi')
  })
})
