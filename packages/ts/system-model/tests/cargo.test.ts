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

describe('cargo runner', () => {
  const MANIFEST = '[package]\nname = "demo"\n'

  test('synthesizes the conventional verbs and marks them as such', async () => {
    const dir = await root({ 'Cargo.toml': MANIFEST })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, only: ['cargo'] }))

    expect(found.map((t) => t.path[2])).toEqual([
      'test',
      'clippy',
      'fmt',
      'fmt-check',
      'build',
      'clean',
    ])
    // Nothing in the manifest declares these; the runner infers them.
    expect(found.every((t) => t.origin === 'synthesized')).toBe(true)
  })

  test('fmt-check, build and clean map to their own cargo subcommands', async () => {
    const dir = await root({ 'Cargo.toml': MANIFEST })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, only: ['cargo'] }))

    expect(byName(found, 'fmt-check')?.argv).toEqual(['cargo', 'fmt', '--check'])
    expect(byName(found, 'build')?.argv).toEqual(['cargo', 'build'])
    expect(byName(found, 'clean')?.argv).toEqual(['cargo', 'clean'])
  })

  test('a nested crate is addressed by its manifest path', async () => {
    const dir = await root({
      'Cargo.toml': '[workspace]\nmembers = ["crates/core"]\n',
      'crates/core/Cargo.toml': '[package]\nname = "core"\n',
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, only: ['cargo'] }))
    const nested = found.filter((t) => t.path[1] === 'crates/core')

    expect(nested.length).toBe(6)
    expect(byName(nested, 'build')?.argv).toEqual([
      'cargo',
      'build',
      '--manifest-path',
      'crates/core/Cargo.toml',
    ])
    expect(byName(nested, 'build')?.source).toBe('crates/core/Cargo.toml')
  })

  test('no Cargo.toml means no report', async () => {
    const dir = await root({ 'README.md': '# hi\n' })
    const { options } = opts()
    const catalog = await collect(dir, { ...options, only: ['cargo'] })

    expect(catalog.reports.find((r) => r.runner === 'cargo')).toBeUndefined()
  })

  test('invoke appends arguments, and a `cargo run` task puts them after `--`', async () => {
    const dir = await root({ 'Cargo.toml': MANIFEST })
    const { options } = opts()
    const { project, catalog } = await detectAndCollect(dir, { ...options, only: ['cargo'] })
    const test_ = byName(tasks(catalog), 'test')!

    expect(project.runners.invoke(test_, ['name', '--nocapture'])).toEqual([
      'cargo',
      'test',
      'name',
      '--nocapture',
    ])
    // No built-in verb is `run`; the branch is exercised on a task shaped like one.
    const run: Task = { ...test_, argv: ['cargo', 'run'] }
    expect(project.runners.invoke(run, ['--flag'])).toEqual(['cargo', 'run', '--', '--flag'])
    expect(project.runners.invoke(run, [])).toEqual(['cargo', 'run'])
  })
})
