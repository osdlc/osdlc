import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import type { ToolDef } from '../src/tool.ts'
import { detectAndCollect, fakeWhich, fixtureRoot, removeRoot } from './support.ts'
import { readProcfile } from '../src/plugins/runners/procfile.ts'
import { procfile } from '../src/plugins/runners/index.ts'

const TOOLS = [procfile]

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

/** Fixture roots are not repositories, so discovery is pinned to the walk. */
async function run(
  files: Record<string, string>,
  tools: readonly ToolDef[] = TOOLS,
  which: Record<string, string> = {},
) {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return detectAndCollect(dir, { discovery: 'walk', tools, which: fakeWhich(which) })
}

function named(list: Task[], name: string): Task {
  const task = list.find((t) => t.path[t.path.length - 1] === name)
  if (task === undefined) throw new Error(`no task ${name}`)
  return task
}

const PROCFILE = '# processes\nweb: bundle exec rails s -p $PORT\nworker: sidekiq\n\nnot a line\n'

describe('procfile runner', () => {
  test('each entry is a declared service', async () => {
    const { catalog } = await run({ Procfile: PROCFILE }, TOOLS, { overmind: '/bin/overmind' })
    const found = tasks(catalog)
    expect(found.map((t) => t.path[2])).toEqual(['web', 'worker'])
    expect(named(found, 'web')).toMatchObject({
      argv: ['overmind', 'start', '-l', 'web'],
      cwd: '.',
      detail: 'bundle exec rails s -p $PORT',
      persistent: { value: true, declared: true },
      origin: 'declared',
    })
  })

  test('uses the first process manager on the PATH', async () => {
    const files = { Procfile: PROCFILE, 'app/Procfile.dev': 'css: tailwind -w\n' }
    const foreman = await run(files, TOOLS, { foreman: '/f', honcho: '/h' })
    expect(named(tasks(foreman.catalog), 'css').argv).toEqual([
      'foreman',
      'start',
      'css',
      '-f',
      'app/Procfile.dev',
    ])
    const honcho = await run(files, TOOLS, { honcho: '/h' })
    expect(named(tasks(honcho.catalog), 'css')).toMatchObject({
      argv: ['honcho', '-f', 'Procfile.dev', 'start', 'css'],
      cwd: 'app',
    })
    expect(named(tasks(honcho.catalog), 'web').argv).toEqual(['honcho', 'start', 'web'])
  })

  test('with no manager, the command runs through sh in its directory', async () => {
    const { project, catalog } = await run({ 'app/Procfile.dev': 'css: tailwind -w\n' })
    const css = named(tasks(catalog), 'css')
    expect(css).toMatchObject({ argv: ['sh', '-c', 'tailwind -w'], cwd: 'app' })
    expect(project.runners.invoke(css, ['--minify'])).toEqual([
      'sh',
      '-c',
      'tailwind -w "$@"',
      'sh',
      '--minify',
    ])
  })

  test('a process manager takes no arguments', async () => {
    const { project, catalog } = await run({ Procfile: PROCFILE }, TOOLS, { overmind: '/o' })
    expect(() => project.runners.invoke(named(tasks(catalog), 'web'), ['x'])).toThrow(
      /takes no arguments/,
    )
    expect(project.runners.invoke(named(tasks(catalog), 'web'), [])).toEqual([
      'overmind',
      'start',
      '-l',
      'web',
    ])
  })

  test('a line that is not an entry and a repeated name are diagnostics', async () => {
    const { catalog } = await run({ Procfile: `${PROCFILE}web: again\n` })
    expect(catalog.reports[0]!.diagnostics.map((d) => d.message)).toEqual([
      'line 5 is not a `name: command` entry, so it was skipped',
      'process web is declared more than once; the first was kept',
    ])
    expect(readProcfile('﻿a: b\r\n').entries).toEqual([{ name: 'a', command: 'b' }])
  })

  test('absent without a Procfile', async () => {
    const { catalog } = await run({ 'Procfile.prod': 'web: x\n' })
    expect(catalog.reports).toEqual([])
  })
})
