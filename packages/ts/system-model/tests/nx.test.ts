import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import type { ToolDef } from '../src/tool.ts'
import { detectAndCollect, fakeWhich, fixtureRoot, removeRoot } from './support.ts'
import { nx } from '../src/plugins/runners/index.ts'

const TOOLS = [nx]

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

const NX_JSON = JSON.stringify({ targetDefaults: { test: { dependsOn: ['build'] } } })

describe('nx runner', () => {
  test('lists project.json and package.json nx targets', async () => {
    const { catalog } = await run({
      'nx.json': NX_JSON,
      'apps/web/project.json': JSON.stringify({
        name: 'web',
        targets: {
          build: { executor: '@nx/vite:build' },
          serve: { command: 'vite', continuous: true },
          test: { executor: 'nx:run-commands', options: { commands: ['vitest run'] } },
        },
      }),
      'libs/ui/package.json': JSON.stringify({
        name: '@acme/ui',
        nx: { targets: { lint: { command: 'eslint .' } } },
      }),
    })
    const found = tasks(catalog)
    expect(found.map((t) => t.path.slice(1))).toEqual([
      ['web', 'build'],
      ['web', 'serve'],
      ['web', 'test'],
      ['@acme/ui', 'lint'],
    ])
    expect(named(found, 'build')).toMatchObject({
      argv: ['nx', 'run', 'web:build'],
      cwd: '.',
      source: 'apps/web/project.json',
      detail: '@nx/vite:build',
    })
    expect(named(found, 'serve').persistent).toEqual({ value: true, declared: true })
    expect(named(found, 'test').detail).toBe('vitest run')
    expect(named(found, 'lint').source).toBe('libs/ui/package.json')
  })

  test('arguments go after --', async () => {
    const { project, catalog } = await run({
      'nx.json': '{}',
      'project.json': JSON.stringify({ name: 'root', targets: { e2e: { command: 'pw' } } }),
    })
    const e2e = named(tasks(catalog), 'e2e')
    expect(project.runners.invoke(e2e, ['--headed'])).toEqual([
      'nx',
      'run',
      'root:e2e',
      '--',
      '--headed',
    ])
  })

  test('dependsOn from the target, else from targetDefaults', async () => {
    const { catalog } = await run({
      'nx.json': NX_JSON,
      'a/project.json': JSON.stringify({
        name: 'a',
        targets: {
          build: { dependsOn: ['^build', 'gen', { target: 'lint', projects: ['b'] }] },
          gen: {},
          test: {},
        },
      }),
      'b/project.json': JSON.stringify({ name: 'b', targets: { lint: {} } }),
    })
    const found = tasks(catalog)
    expect(named(found, 'build').dependsOn).toEqual([
      'nx:a/project.json:gen',
      'nx:b/project.json:lint',
    ])
    expect(named(found, 'build').dependsOnUnresolved).toEqual(['^build'])
    expect(named(found, 'test').dependsOn).toEqual(['nx:a/project.json:build'])
  })

  test('a project with no name takes its directory name', async () => {
    const { catalog } = await run({
      'nx.json': '{}',
      'tools/gen/project.json': JSON.stringify({ targets: { run: {} } }),
    })
    expect(named(tasks(catalog), 'run').argv).toEqual(['nx', 'run', 'gen:run'])
  })

  test('a malformed project.json or nx.json is a diagnostic', async () => {
    const broken = await run({ 'nx.json': '{', 'project.json': '{}' })
    expect(broken.catalog.reports[0]!.diagnostics).toEqual([
      expect.objectContaining({
        message: expect.stringMatching(/^unparseable nx\.json: /),
        source: 'nx.json',
      }),
    ])
    const { catalog } = await run({ 'nx.json': '{}', 'a/project.json': '{ nope' })
    expect(catalog.reports[0]!.diagnostics).toEqual([
      expect.objectContaining({
        message: expect.stringMatching(/^unparseable project\.json: /),
        source: 'a/project.json',
      }),
    ])
  })

  test('reads nx.json and project.json with comments and trailing commas', async () => {
    const { catalog } = await run({
      'nx.json':
        '{\n  // defaults\n  "targetDefaults": { "test": { "dependsOn": ["build"] } },\n}\n',
      'apps/web/project.json':
        '{\n  "name": "web", /* the app */\n  "targets": { "build": {}, "test": {}, },\n}\n',
    })
    expect(catalog.reports[0]!.diagnostics).toEqual([])
    expect(named(tasks(catalog), 'test').dependsOn).toEqual(['nx:apps/web/project.json:build'])
  })

  test('a second project with the same name is skipped with a diagnostic', async () => {
    const { catalog } = await run({
      'nx.json': '{}',
      'a/project.json': JSON.stringify({ name: 'app', targets: { build: {} } }),
      'b/project.json': JSON.stringify({
        name: 'app',
        targets: { build: { dependsOn: ['build'] } },
      }),
    })
    const found = tasks(catalog)
    expect(found.map((t) => t.id)).toEqual(['nx:a/project.json:build'])
    expect(found[0]!.dependsOn).toBeUndefined()
    expect(catalog.reports[0]!.diagnostics).toEqual([
      expect.objectContaining({
        message: 'project app is also declared in a; this one is skipped',
        source: 'b/project.json',
      }),
    ])
  })

  test('absent without nx.json', async () => {
    const { catalog } = await run({ 'project.json': JSON.stringify({ targets: { a: {} } }) })
    expect(catalog.reports).toEqual([])
  })
})
