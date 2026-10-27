import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
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

describe('node-scripts runner', () => {
  test('derives the run verb from the lockfile rather than assuming one', async () => {
    const dir = await root({
      'package.json': JSON.stringify({ name: 'root', scripts: { build: 'tsc' } }),
      'pnpm-lock.yaml': '',
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, only: ['node-scripts'] }))

    expect(found[0]?.argv).toEqual(['pnpm', 'run', 'build'])
  })

  test('finds the lockfile by walking UP from a nested package', async () => {
    const dir = await root({
      'bun.lock': '',
      'package.json': JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
      'packages/leaf/package.json': JSON.stringify({ name: 'leaf', scripts: { test: 'bun test' } }),
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, only: ['node-scripts'] }))

    expect(found[0]?.argv).toEqual(['bun', 'run', '--cwd', 'packages/leaf', 'test'])
  })

  test("addresses a nested package with each manager's own directory flag", async () => {
    // `--cwd` is a bun/yarn-1 flag. npm treats it as an unknown config and
    // runs the root package's script. pnpm rejects it.
    const cases: Array<[string, string, string[]]> = [
      ['package-lock.json', 'npm', ['npm', 'run', '--prefix', 'packages/leaf', 'build']],
      ['pnpm-lock.yaml', 'pnpm', ['pnpm', 'run', '--dir', 'packages/leaf', 'build']],
      ['yarn.lock', 'yarn', ['yarn', '--cwd', 'packages/leaf', 'run', 'build']],
      ['bun.lock', 'bun', ['bun', 'run', '--cwd', 'packages/leaf', 'build']],
    ]

    for (const [lockfile, kind, argv] of cases) {
      const dir = await root({
        [lockfile]: '',
        'package.json': JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
        'packages/leaf/package.json': JSON.stringify({ name: 'leaf', scripts: { build: 'tsc' } }),
        // pnpm reads its members from here, not from `workspaces`.
        ...(kind === 'pnpm' ? { 'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n" } : {}),
      })
      const { options } = opts()
      const found = tasks(await collect(dir, { ...options, only: ['node-scripts'] }))

      expect([kind, found[0]?.argv]).toEqual([kind, argv])
      expect(found[0]?.display).toBe(argv.join(' '))
    }
  })

  test('a one-shot vite subcommand is not a persistent task', async () => {
    // `persistent` means "keeps running until stopped". `vite build` exits;
    // only the bare dev server and an explicit watcher keep going.
    const dir = await root({
      'package.json': JSON.stringify({
        scripts: {
          build: 'vite build',
          dev: 'vite',
          'build:watch': 'vite build --watch',
        },
      }),
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, only: ['node-scripts'] }))

    expect(byName(found, 'build')?.persistent).toEqual({ value: false, declared: false })
    expect(byName(found, 'dev')?.persistent).toEqual({ value: true, declared: false })
    expect(byName(found, 'build:watch')?.persistent).toEqual({ value: true, declared: false })
  })

  test('the packageManager field outranks the lockfile', async () => {
    const dir = await root({
      'package.json': JSON.stringify({
        name: 'root',
        packageManager: 'yarn@4.1.0',
        scripts: { build: 'tsc' },
      }),
      'package-lock.json': '',
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, only: ['node-scripts'] }))

    expect(found[0]?.argv).toEqual(['yarn', 'run', 'build'])
  })

  test("runs a yarn script through `run`, so a yarn builtin's name runs the script", async () => {
    // `yarn version` and `yarn pack` are yarn's own commands. Without `run`
    // the catalog would offer yarn's command under the script's name.
    const dir = await root({
      'yarn.lock': '',
      'package.json': JSON.stringify({ scripts: { version: 'echo v', pack: 'echo p' } }),
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, only: ['node-scripts'] }))

    expect(found.map((t) => t.argv)).toEqual([
      ['yarn', 'run', 'version'],
      ['yarn', 'run', 'pack'],
    ])
  })

  test('defaults to npm when nothing declares a manager', async () => {
    const dir = await root({ 'package.json': JSON.stringify({ scripts: { go: 'node .' } }) })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, only: ['node-scripts'] }))

    expect(found[0]?.argv).toEqual(['npm', 'run', 'go'])
  })

  test('a package without scripts yields no tasks', async () => {
    const dir = await root({ 'package.json': JSON.stringify({ name: 'bare' }) })
    const { options } = opts()
    const catalog = await collect(dir, { ...options, only: ['node-scripts'] })

    expect(tasks(catalog)).toEqual([])
  })

  test('a malformed manifest is a diagnostic, not a crash', async () => {
    const dir = await root({
      'package.json': JSON.stringify({ scripts: { ok: 'true' } }),
      'broken/package.json': '{ not json',
    })
    const { options } = opts()
    const report = (await collect(dir, { ...options, only: ['node-scripts'] })).reports[0]!

    expect(report.tasks.length).toBe(1)
    expect(report.diagnostics).toEqual([
      { severity: 'warning', message: 'unparseable manifest', source: 'broken/package.json' },
    ])
  })

  test('a malformed manifest under fixtures/ is noise, not a diagnostic', async () => {
    const dir = await root({
      'package.json': JSON.stringify({ scripts: { ok: 'true' } }),
      'tests/fixtures/mini/package.json': '{ not json',
    })
    const { options } = opts()
    const report = (await collect(dir, { ...options, only: ['node-scripts'] })).reports[0]!

    expect(report.diagnostics).toEqual([])
  })

  test('invoke follows each manager: npm adds `--`, the others append', async () => {
    const cases: Array<[string, string[]]> = [
      ['package-lock.json', ['npm', 'run', 'build', '--', '--watch']],
      ['pnpm-lock.yaml', ['pnpm', 'run', 'build', '--watch']],
      ['yarn.lock', ['yarn', 'run', 'build', '--watch']],
      ['bun.lock', ['bun', 'run', 'build', '--watch']],
    ]

    for (const [lockfile, expected] of cases) {
      const dir = await root({
        [lockfile]: '',
        'package.json': JSON.stringify({ name: 'root', scripts: { build: 'tsc' } }),
      })
      const { options } = opts()
      const { project, catalog } = await detectAndCollect(dir, {
        ...options,
        only: ['node-scripts'],
      })
      const build = tasks(catalog)[0]!

      expect(project.runners.invoke(build, ['--watch'])).toEqual(expected)
      expect(project.runners.invoke(build, [])).toEqual(build.argv)
    }
  })

  test('invoke uses the separator after a nested npm task too', async () => {
    const dir = await root({
      'package-lock.json': '',
      'package.json': JSON.stringify({ name: 'root' }),
      'packages/leaf/package.json': JSON.stringify({ name: 'leaf', scripts: { build: 'tsc' } }),
    })
    const { options } = opts()
    const { project, catalog } = await detectAndCollect(dir, { ...options, only: ['node-scripts'] })

    expect(project.runners.invoke(tasks(catalog)[0]!, ['-x'])).toEqual([
      'npm',
      'run',
      '--prefix',
      'packages/leaf',
      'build',
      '--',
      '-x',
    ])
  })
})
