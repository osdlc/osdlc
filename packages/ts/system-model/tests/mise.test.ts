import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import { mise } from '../src/plugins/tools/index.ts'
import {
  type Canned,
  collect,
  detectAndCollect,
  fakeRunners,
  fakeWhich,
  fixtureRoot,
  removeRoot,
} from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

/**
 * Fixture roots are not repositories, so discovery is pinned to the walk.
 * `which` finds nothing unless a test opts in, so results do not depend on the
 * machine running them.
 */
function opts(canned: Canned[] = [], extra: Record<string, unknown> = {}) {
  const { make, calls } = fakeRunners(canned)
  return {
    options: { discovery: 'walk' as const, makeRunner: make, which: fakeWhich({}), ...extra },
    calls,
  }
}

function byName(list: Task[], name: string): Task | undefined {
  return list.find((t) => t.path[t.path.length - 1] === name)
}

describe('mise runner', () => {
  const TASKS = JSON.stringify([
    {
      name: 'build',
      description: 'Build it',
      source: '%ROOT%/mise.toml',
      run: ['cargo build'],
      global: false,
    },
    { name: 'dev', description: '', source: '%ROOT%/mise.toml', run: ['vite dev'], global: false },
    { name: 'secret', source: '%ROOT%/mise.toml', run: ['x'], hide: true, global: false },
    { name: 'mine', source: '/home/me/.config/mise/config.toml', run: ['y'], global: true },
    {
      name: 'deploy',
      description: 'Ship it',
      source: '%ROOT%/mise-tasks/deploy',
      file: '%ROOT%/mise-tasks/deploy',
      global: false,
    },
  ])
  const CONFIG = "[tasks.build]\nrun = 'x'\n"

  test('is withheld without opting into execution', async () => {
    const dir = await root({ 'mise.toml': CONFIG })
    const { options, calls } = opts()
    const report = (await collect(dir, { ...options, only: ['mise'] })).reports[0]!

    expect(report.status).toBe('absent')
    expect(report.skippedForExec).toBe(true)
    // mise evaluates the target repository's config, which can carry hooks
    // that run commands. Nothing may be executed without the caller asking.
    expect(calls.filter((c) => c.binary === 'mise')).toEqual([])
  })

  test('reads config tasks and file tasks, dropping hidden ones', async () => {
    const dir = await root({ 'mise.toml': CONFIG })
    const { options } = opts([
      { binary: 'mise', argv: ['tasks', '--json'], stdout: TASKS.replaceAll('%ROOT%', dir) },
    ])
    const found = tasks(await collect(dir, { ...options, only: ['mise'], allowExec: true }))

    expect(found.map((t) => t.path[2]).sort()).toEqual(['build', 'deploy', 'dev'])
    expect(byName(found, 'build')?.argv).toEqual(['mise', 'run', 'build'])
    expect(byName(found, 'build')?.doc).toBe('Build it')
    // A file task points at the script, not at the directory that collected it.
    expect(byName(found, 'deploy')?.source).toBe('mise-tasks/deploy')
    expect(byName(found, 'deploy')?.tags).toContain('file-task')
  })

  test('a nested task carries its directory in argv, not in cwd', async () => {
    // `mise run` finds tasks by walking up from where it starts, so a nested
    // task's command has to name its directory. Root-level tasks stay unadorned.
    const dir = await root({ 'mise.toml': CONFIG })
    const nested = JSON.stringify([
      {
        name: 'api',
        source: `${dir}/services/api/mise.toml`,
        run: ['x'],
        dir: 'services/api',
        global: false,
      },
      { name: 'build', source: `${dir}/mise.toml`, run: ['y'], global: false },
    ])
    const { options } = opts([{ binary: 'mise', argv: ['tasks', '--json'], stdout: nested }])
    const found = tasks(await collect(dir, { ...options, only: ['mise'], allowExec: true }))

    expect(byName(found, 'api')?.argv).toEqual(['mise', '-C', 'services/api', 'run', 'api'])
    expect(byName(found, 'api')?.cwd).toBe('.')
    expect(byName(found, 'build')?.argv).toEqual(['mise', 'run', 'build'])
    expect(found.every((t) => t.cwd === '.')).toBe(true)
  })

  test('omits global tasks: they belong to the machine, not the project', async () => {
    const dir = await root({ 'mise.toml': CONFIG })
    const { options } = opts([
      { binary: 'mise', argv: ['tasks', '--json'], stdout: TASKS.replaceAll('%ROOT%', dir) },
    ])
    const report = (await collect(dir, { ...options, only: ['mise'], allowExec: true })).reports[0]!

    expect(report.tasks.some((t) => t.path[2] === 'mine')).toBe(false)
    expect(report.diagnostics.some((d) => /global/.test(d.message))).toBe(true)
  })

  test('file tasks alone are enough: no config file needed', async () => {
    const dir = await root({ 'mise-tasks/deploy': '#!/usr/bin/env bash\necho hi\n' })
    const { options } = opts([{ binary: 'mise', argv: ['tasks', '--json'], stdout: '[]' }])
    const { profile, catalog } = await detectAndCollect(dir, {
      ...options,
      only: ['mise'],
      allowExec: true,
    })

    expect(catalog.reports[0]?.status).toBe('ok')
    const evidence = profile.packages.flatMap((p) => p.tools).flatMap((t) => t.evidence)
    expect(evidence.map((e) => e.source)).toContain('mise-tasks')
  })

  test.each([
    'mise.toml',
    '.mise.toml',
    'mise.local.toml',
    '.mise.local.toml',
    '.config/mise/config.toml',
    '.tool-versions',
  ])('a root %s detects mise', async (file) => {
    const dir = await root({ [file]: CONFIG })
    const { options } = opts([{ binary: 'mise', argv: ['tasks', '--json'], stdout: '[]' }])
    const { profile } = await detectAndCollect(dir, { ...options, only: ['mise'], allowExec: true })

    expect(profile.tools).toContain('mise')
  })

  test.each(['mise-tasks/x', '.mise/tasks/x', '.config/mise/tasks/x'])(
    'a task directory file %s detects mise',
    async (file) => {
      const dir = await root({ [file]: '#!/bin/sh\n' })
      const { options } = opts([{ binary: 'mise', argv: ['tasks', '--json'], stdout: '[]' }])
      const { profile } = await detectAndCollect(dir, {
        ...options,
        only: ['mise'],
        allowExec: true,
      })

      expect(profile.tools).toContain('mise')
    },
  )

  test('a config below the root does not detect mise', async () => {
    const dir = await root({ 'services/api/mise.toml': CONFIG })
    const { options } = opts()
    const { profile, catalog } = await detectAndCollect(dir, {
      ...options,
      only: ['mise'],
      allowExec: true,
    })

    expect(profile.tools).not.toContain('mise')
    expect(catalog.reports.find((r) => r.runner === 'mise')).toBeUndefined()
  })

  test('watches the root configs and the task directories', () => {
    expect(mise.roles.runner?.watch).toEqual([
      '/mise.toml',
      '/.mise.toml',
      '/mise.local.toml',
      '/.mise.local.toml',
      '/.config/mise/config.toml',
      '/.tool-versions',
      '/mise-tasks/',
      '/.mise/tasks/',
      '/.config/mise/tasks/',
    ])
  })

  test('an untrusted config explains itself rather than reporting nothing', async () => {
    const dir = await root({ 'mise.toml': CONFIG })
    const { options } = opts([
      {
        binary: 'mise',
        argv: ['tasks', '--json'],
        exitCode: 1,
        stderr: 'mise ERROR Config file mise.toml is not trusted.',
      },
    ])
    const report = (await collect(dir, { ...options, only: ['mise'], allowExec: true })).reports[0]!

    expect(report.status).toBe('error')
    expect(report.diagnostics[0]?.message).toContain('mise trust')
  })

  test('invoke appends arguments to the task', async () => {
    const dir = await root({ 'mise.toml': CONFIG })
    const { options } = opts([
      { binary: 'mise', argv: ['tasks', '--json'], stdout: TASKS.replaceAll('%ROOT%', dir) },
    ])
    const { project, catalog } = await detectAndCollect(dir, {
      ...options,
      only: ['mise'],
      allowExec: true,
    })
    const build = byName(tasks(catalog), 'build')!

    expect(project.runners.invoke(build, ['a', 'b'])).toEqual(['mise', 'run', 'build', 'a', 'b'])
  })
})
