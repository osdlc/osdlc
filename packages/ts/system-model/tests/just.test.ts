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

describe('just runner', () => {
  const JUSTFILE = [
    '# a comment',
    '[doc("Build everything.")]',
    'build:',
    '    cargo build',
    '',
    'release-lib lib bump *flags:',
    '    ./release {{lib}}',
    '',
    'ci base="main": build',
    '    echo ci',
    '',
    'alias b := build',
    'set shell := ["bash", "-c"]',
  ].join('\n')

  const DUMP = JSON.stringify({
    recipes: {
      build: {
        name: 'build',
        doc: 'Build everything.',
        parameters: [],
        body: [['cargo build']],
      },
      'release-lib': {
        name: 'release-lib',
        parameters: [
          { name: 'lib', kind: 'singular', default: null },
          { name: 'bump', kind: 'singular', default: null },
          { name: 'flags', kind: 'star', default: null },
        ],
      },
      hidden: { name: 'hidden', private: true, parameters: [] },
    },
  })

  const withJust = { which: fakeWhich({ just: '/usr/bin/just' }) }

  test('uses --dump when execution is allowed, and drops private recipes', async () => {
    const dir = await root({ justfile: JUSTFILE })
    const { options } = opts([{ binary: 'just', argv: ['--justfile'], stdout: DUMP }])
    const found = tasks(
      await collect(dir, { ...options, ...withJust, only: ['just'], allowExec: true }),
    )

    expect(found.map((t) => t.path[2]).sort()).toEqual(['build', 'release-lib'])
    expect(byName(found, 'build')?.doc).toBe('Build everything.')
  })

  test('parameters are data and never reach argv', async () => {
    const dir = await root({ justfile: JUSTFILE })
    const { options } = opts([{ binary: 'just', argv: ['--justfile'], stdout: DUMP }])
    const found = tasks(
      await collect(dir, { ...options, ...withJust, only: ['just'], allowExec: true }),
    )
    const release = byName(found, 'release-lib')!

    // `<lib>` in a shell string is an input redirection, so placeholders stay out of argv.
    expect(release.argv).toEqual(['just', 'release-lib'])
    expect(release.display).toBe('just release-lib <lib> <bump> *flags')
    expect(release.parameters).toEqual([
      { name: 'lib', required: true, variadic: false },
      { name: 'bump', required: true, variadic: false },
      { name: 'flags', required: false, variadic: true },
    ])
  })

  test('falls back to scanning when the binary is missing, and says so', async () => {
    const dir = await root({ justfile: JUSTFILE })
    const { options } = opts()
    const catalog = await collect(dir, { ...options, only: ['just'], allowExec: true })
    const report = catalog.reports[0]!

    expect(report.status).toBe('ok')
    expect(report.tasks.map((t) => t.path[2]).sort()).toEqual(['build', 'ci', 'release-lib'])
    expect(report.diagnostics[0]?.severity).toBe('warning')
    expect(report.diagnostics[0]?.message).toContain('not on the PATH')
  })

  test('the scan reads recipe shapes with `*` parameters and dependencies', async () => {
    const dir = await root({ justfile: JUSTFILE })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, only: ['just'] }))
    const names = found.map((t) => t.path[2])

    expect(names).toContain('release-lib')
    expect(names).toContain('ci')
    // `alias b := build` and `set shell := [...]` are assignments, not recipes.
    expect(names).not.toContain('alias')
    expect(names).not.toContain('set')
  })

  test('falls back to the scan when --dump fails, rather than dropping the file', async () => {
    // A justfile whose `import` target is missing makes `just --dump` exit 1.
    const dir = await root({ justfile: JUSTFILE })
    const { options } = opts([
      {
        binary: 'just',
        argv: ['--justfile'],
        exitCode: 1,
        stderr: 'error: Import file `deps.just` not found',
      },
    ])
    const report = (
      await collect(dir, { ...options, ...withJust, only: ['just'], allowExec: true })
    ).reports[0]!

    expect(report.status).toBe('ok')
    expect(report.tasks.map((t) => t.path[2]).sort()).toEqual(['build', 'ci', 'release-lib'])
    expect(report.diagnostics[0]?.severity).toBe('warning')
    expect(report.diagnostics[0]?.source).toBe('justfile')
    expect(report.diagnostics[0]?.message).toContain('Import file')
    expect(report.diagnostics[0]?.message).toContain('parsed from source')
  })

  test('a nested justfile is addressed from the root', async () => {
    const dir = await root({ 'sub/justfile': 'deploy:\n    echo go\n' })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, only: ['just'] }))

    expect(found[0]?.argv).toEqual([
      'just',
      '--justfile',
      'sub/justfile',
      '--working-directory',
      'sub',
      'deploy',
    ])
  })

  test('detects every justfile basename', async () => {
    const dir = await root({
      'a/Justfile': 'one:\n    echo\n',
      'b/.justfile': 'two:\n    echo\n',
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, only: ['just'] }))

    expect(found.map((t) => t.source).sort()).toEqual(['a/Justfile', 'b/.justfile'])
  })

  test('reads one justfile per directory, the last in sorted order', async () => {
    const dir = await root({
      '.justfile': 'hidden-one:\n    echo\n',
      justfile: 'visible-one:\n    echo\n',
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, only: ['just'] }))

    expect(found.map((t) => t.path[2])).toEqual(['visible-one'])
    expect(found[0]?.source).toBe('justfile')
  })

  test('no justfile means no report', async () => {
    const dir = await root({ 'README.md': '# hi\n' })
    const { options } = opts()
    const catalog = await collect(dir, { ...options, only: ['just'] })

    expect(catalog.reports.find((r) => r.runner === 'just')).toBeUndefined()
  })

  test('invoke appends arguments to the recipe', async () => {
    const dir = await root({ justfile: JUSTFILE })
    const { options } = opts()
    const { project, catalog } = await detectAndCollect(dir, { ...options, only: ['just'] })
    const build = byName(tasks(catalog), 'build')!

    expect(project.runners.invoke(build, ['--release', 'x'])).toEqual([
      'just',
      'build',
      '--release',
      'x',
    ])
    expect(project.runners.invoke(build, [])).toEqual(['just', 'build'])
  })
})
