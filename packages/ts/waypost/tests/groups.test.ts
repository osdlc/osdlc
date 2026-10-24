/**
 * The row groups: tasks, then the dependencies, tools and git hooks that
 * system-model synthesizes. Every surface orders and labels them from
 * `groups.ts`, and `--json` carries them.
 */

import { afterAll, describe, expect, test } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { captureIo } from '@osdlc/cli-tool'
import { SYNTHESIZED_RUNNERS, type Catalog } from '@osdlc/system-model/detect'

import { orderedCatalog } from '../src/catalog.ts'
import { main } from '../src/cli.ts'
import { catalogGroups, GROUPS, groupOf, runnerLabel } from '../src/groups.ts'

const dirs: string[] = []
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
})

async function temp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'waypost-groups-'))
  dirs.push(dir)
  return dir
}

/** A repository with something in every group. */
async function everyGroup(): Promise<string> {
  const dir = await temp()
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'p', scripts: { b: 'x' } }))
  await writeFile(join(dir, 'package-lock.json'), '{}')
  await writeFile(join(dir, 'mise.toml'), '[tools]\nnode = "24"\n')
  await writeFile(
    join(dir, 'lefthook.yml'),
    'pre-commit:\n  commands:\n    lint:\n      run: echo\n',
  )
  return dir
}

async function json(dir: string): Promise<Catalog & { groups: ReturnType<typeof catalogGroups> }> {
  const io = captureIo()
  expect(await main(['--json', '-C', dir], {}, await temp(), io)).toBe(0)
  return JSON.parse(io.out) as Catalog & { groups: ReturnType<typeof catalogGroups> }
}

describe('GROUPS', () => {
  test('names the runners system-model synthesizes, which the page cannot import', () => {
    expect(GROUPS.map((g) => g.runner).filter(Boolean)).toEqual(Object.values(SYNTHESIZED_RUNNERS))
  })

  test('a runner that is not synthesized is a task runner', () => {
    expect(groupOf('just').id).toBe('tasks')
    expect(groupOf('hook-manager').id).toBe('hooks')
  })

  test('a synthesized runner is labelled by its group, any other by its id', () => {
    expect(runnerLabel('package-manager')).toBe('dependencies')
    expect(runnerLabel('hook-manager')).toBe('git hooks')
    expect(runnerLabel('make')).toBe('make')
  })
})

describe('--json groups', () => {
  test('lists every non-empty group in display order, with its runners', async () => {
    const doc = await json(await everyGroup())
    expect(doc.groups.map((g) => [g.id, g.title])).toEqual([
      ['tasks', 'Tasks'],
      ['dependencies', 'Dependencies'],
      ['tools', 'Tools'],
      ['hooks', 'Git hooks'],
    ])
    expect(doc.groups[1]!.runners).toEqual(['package-manager'])
    const tasks = doc.reports.flatMap((r) => r.tasks).map((t) => t.display)
    expect(tasks).toEqual(expect.arrayContaining(['npm ci', 'mise install', 'lefthook install']))
  })

  test('leaves out a group with nothing in it', async () => {
    const dir = await temp()
    await writeFile(join(dir, 'Makefile'), 'lint:\n\techo l\n')
    expect((await json(dir)).groups.map((g) => g.id)).toEqual(['tasks'])
  })
})

describe('orderedCatalog', () => {
  test('keeps each group together; a configured order applies within a group', async () => {
    const doc = await json(await everyGroup())
    const ordered = orderedCatalog(doc, ['hook-manager', 'node-scripts', 'mise'])
    expect(ordered.reports.map((r) => r.runner)).toEqual([
      'node-scripts',
      'mise',
      'package-manager',
      'tool-manager',
      'hook-manager',
    ])
  })
})
