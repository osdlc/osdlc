/**
 * Probe limits: every subprocess a runner or detection starts gets the
 * caller's abort signal and a timeout, git included.
 */

import { afterAll, describe, expect, test } from 'vitest'

import {
  spawnRunner,
  spawnRunnerAsync,
  type AsyncCommandRunOptions,
  type AsyncCommandRunner,
} from '@osdlc/command-seam'

import { builtins } from '../src/builtins.ts'
import { boundRunners, DEFAULT_PROBE_TIMEOUT_MS, GIT_TIMEOUT_MS } from '../src/context.ts'
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

  test("moon's describe at detect time gets the signal and moon's own timeout", async () => {
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
      timeoutMs: 120_000,
      killTree: true,
    })
  })

  test('every bound call kills its whole tree when stopped', async () => {
    const dir = await root(ALL)
    const fake = fakeRunners([])
    await detectAndCollect(dir, {
      discovery: 'walk',
      allowExec: true,
      makeRunner: fake.make,
      which: fakeWhich({ moon: '/bin/moon', just: '/bin/just' }),
    })
    expect(fake.calls.length).toBeGreaterThan(0)
    for (const call of fake.calls) expect(call.opts.killTree).toBe(true)
  })
})

describe('a timed-out probe', () => {
  // Uses sh, sleep and pgrep, so it runs on POSIX only. command-seam's own
  // tests cover the Windows tree kill.
  test.skipIf(process.platform === 'win32')(
    'kills the processes the child started, not only the child',
    async () => {
      const tag = `${40 + Math.floor(Math.random() * 1000)}.${process.pid % 1000}`
      const run = boundRunners(spawnRunnerAsync, new AbortController().signal, 300)('sh')
      const res = await run.run(['-c', `sleep ${tag} & sleep ${tag}1; wait`], { cwd: '.' })
      expect(res.neverExited).toBe(true)
      // Give the kill a moment to land.
      await new Promise((r) => setTimeout(r, 300))
      const left = spawnRunner('pgrep').run(['-f', `sleep ${tag}`], { cwd: '.' })
      expect(left.stdout.trim()).toBe('')
    },
  )

  test.skipIf(process.platform === 'win32')(
    'an abort of the caller signal, as a host does on Ctrl-C, kills the tree too',
    async () => {
      const tag = `${40 + Math.floor(Math.random() * 1000)}.${process.pid % 1000}7`
      const cancel = new AbortController()
      const run = boundRunners(spawnRunnerAsync, cancel.signal, 60_000)('sh')
      const pending = run.run(['-c', `sleep ${tag} & sleep ${tag}1; wait`], { cwd: '.' })
      setTimeout(() => cancel.abort(), 200)
      const res = await pending
      expect(res.reason).toBe('abort')
      await new Promise((r) => setTimeout(r, 300))
      const left = spawnRunner('pgrep').run(['-f', `sleep ${tag}`], { cwd: '.' })
      expect(left.stdout.trim()).toBe('')
    },
  )
})
