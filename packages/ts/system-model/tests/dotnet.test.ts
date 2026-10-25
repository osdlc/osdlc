import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import type { ToolDef } from '../src/tool.ts'
import { detectAndCollect, fakeWhich, fixtureRoot, removeRoot } from './support.ts'
import { dotnet } from '../src/plugins/dotnet/index.ts'

const TOOLS = [dotnet]

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

describe('dotnet runner', () => {
  test('a solution and its projects get the conventional verbs', async () => {
    const { profile, catalog } = await run({
      'App.sln': '',
      'src/App/App.csproj': '<Project Sdk="Microsoft.NET.Sdk" />',
      'src/Lib/Lib.fsproj': '<Project Sdk="Microsoft.NET.Sdk" />',
    })
    expect(profile.ecosystems).toEqual(['dotnet'])
    const found = tasks(catalog)
    expect(found.filter((t) => t.source === 'App.sln').map((t) => t.path[2])).toEqual([
      'build',
      'test',
      'restore',
      'publish',
    ])
    expect(found.filter((t) => t.source === 'src/App/App.csproj').map((t) => t.path[2])).toEqual([
      'build',
      'test',
      'run',
      'restore',
      'publish',
    ])
    expect(found.every((t) => t.origin === 'synthesized' && t.cwd === '.')).toBe(true)
    expect(
      named(
        found.filter((t) => t.source === 'App.sln'),
        'build',
      ).argv,
    ).toEqual(['dotnet', 'build', 'App.sln'])
  })

  test('run takes --project and passes arguments after --', async () => {
    const { project, catalog } = await run({ 'tool/Tool.csproj': '<Project />' })
    const runTask = named(tasks(catalog), 'run')
    expect(runTask.argv).toEqual(['dotnet', 'run', '--project', 'tool/Tool.csproj'])
    expect(project.runners.invoke(runTask, ['--port', '5000'])).toEqual([
      'dotnet',
      'run',
      '--project',
      'tool/Tool.csproj',
      '--',
      '--port',
      '5000',
    ])
    expect(project.runners.invoke(named(tasks(catalog), 'test'), ['--no-build'])).toEqual([
      'dotnet',
      'test',
      'tool/Tool.csproj',
      '--no-build',
    ])
  })

  test('a .slnx solution counts, and the file is never read', async () => {
    const { catalog } = await run({ 'App.slnx': '<<< not xml' })
    expect(tasks(catalog).map((t) => t.argv.join(' '))).toContain('dotnet build App.slnx')
    expect(catalog.reports[0]!.diagnostics).toEqual([])
  })

  test('absent without a solution or project file', async () => {
    const { catalog } = await run({ 'README.md': '' })
    expect(catalog.reports).toEqual([])
  })
})
