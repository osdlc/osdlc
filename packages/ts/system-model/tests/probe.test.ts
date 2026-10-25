/**
 * Probe limits: every subprocess a runner or detection starts gets the
 * caller's abort signal and a timeout, git included.
 */

import { afterAll, describe, expect, test } from 'vitest'

import type { AsyncCommandRunOptions, AsyncCommandRunner } from '@osdlc/command-seam'

import { builtins } from '../src/builtins.ts'
import { DEFAULT_PROBE_TIMEOUT_MS, GIT_TIMEOUT_MS } from '../src/context.ts'
import { createProject } from '../src/project.ts'
import type { ToolDef } from '../src/tool.ts'
import { detectAndCollect, fakeRunners, fakeWhich, fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

const ALL = {
  '.moon/workspace.yml': 'projects: []\n',
  'mise-tasks/lint': '#!/bin/sh\n',
  'project/build.properties': 'sbt.version=1.9.0\n',
  'build.sbt': '',
  justfile: 'build:\n    true\n',
}

describe('exec probes', () => {
  test('moon, mise, sbt and just each get the signal and their own timeout', async () => {
    const dir = await root(ALL)
    const fake = fakeRunners([])
    const cancel = new AbortController()
    await detectAndCollect(dir, {
      discovery: 'walk',
      allowExec: true,
      makeRunner: fake.make,
      which: fakeWhich({
        moon: '/bin/moon',
        mise: '/bin/mise',
        sbt: '/bin/sbt',
        just: '/bin/just',
      }),
      signal: cancel.signal,
    })

    const timeouts = new Map<string, number | undefined>()
    for (const call of fake.calls) {
      expect(call.opts.signal).toBe(cancel.signal)
      timeouts.set(call.binary, call.opts.timeoutMs)
    }
    expect(Object.fromEntries(timeouts)).toEqual({
      moon: 120_000,
      mise: 30_000,
      sbt: 300_000,
      just: 10_000,
    })
  })

  test('CollectOptions.timeouts replaces a runner timeout', async () => {
    const dir = await root({ justfile: 'build:\n    true\n' })
    const fake = fakeRunners([])
    await detectAndCollect(dir, {
      discovery: 'walk',
      allowExec: true,
      makeRunner: fake.make,
      which: fakeWhich({ just: '/bin/just' }),
      timeouts: { just: 1234 },
    })
    expect(fake.calls.map((c) => c.opts.timeoutMs)).toEqual([1234])
  })

  test('a runner that declares no timeout gets the default', async () => {
    const dir = await root({ 'x.cfg': '' })
    const tool: ToolDef = {
      id: 'x',
      binary: 'x',
      markers: [{ files: 'x.cfg', tier: 'files' }],
      roles: {
        runner: {
          kind: 'exec',
          async collect(ctx) {
            await ctx.runner('x').run(['list'], { cwd: ctx.root })
            return { status: 'absent', tasks: [], diagnostics: [] }
          },
        },
      },
    }
    const fake = fakeRunners([])
    await detectAndCollect(dir, {
      tools: [tool],
      discovery: 'walk',
      allowExec: true,
      makeRunner: fake.make,
    })
    expect(fake.calls[0]?.opts.timeoutMs).toBe(DEFAULT_PROBE_TIMEOUT_MS)
    expect(fake.calls[0]?.opts.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('git and describe calls', () => {
  test('discovery git calls get the signal and the git timeout', async () => {
    // turbo lists files through `ctx.files`, so collect runs git again.
    const dir = await root({ 'turbo.json': '{"tasks":{"build":{}}}' })
    // Matched by verb, not by position, so leading `-c` options do not matter.
    const git: AsyncCommandRunOptions[] = []
    const makeRunner = (): AsyncCommandRunner => ({
      async run(argv, opts) {
        git.push(opts)
        const stdout = argv.includes('rev-parse') ? 'true\n' : 'turbo.json\0'
        return { exitCode: 0, stdout, stderr: '' }
      },
    })
    const cancel = new AbortController()
    const project = createProject({ tools: builtins })
    const profile = await project.detect(dir, { makeRunner, signal: cancel.signal })
    await project.runners.collect(profile, { makeRunner, signal: cancel.signal })

    expect(profile.discovery).toBe('git')
    expect(git.length).toBeGreaterThanOrEqual(3)
    for (const opts of git) {
      expect(opts.signal).toBe(cancel.signal)
      expect(opts.timeoutMs).toBe(GIT_TIMEOUT_MS)
    }
  })

  test("moon's describe at detect time gets the signal and the default timeout", async () => {
    const dir = await root({ '.moon/workspace.yml': '' })
    const fake = fakeRunners([])
    const cancel = new AbortController()
    await createProject({ tools: builtins }).detect(dir, {
      discovery: 'walk',
      allowExec: true,
      makeRunner: fake.make,
      signal: cancel.signal,
    })
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0]?.opts).toMatchObject({
      signal: cancel.signal,
      timeoutMs: DEFAULT_PROBE_TIMEOUT_MS,
    })
  })
})
