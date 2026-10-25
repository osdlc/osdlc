import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import type { ToolDef } from '../src/tool.ts'
import { detectAndCollect, fakeWhich, fixtureRoot, removeRoot } from './support.ts'
import { npm, pnpm } from '../src/plugins/node/index.ts'
import { vscodeTasks } from '../src/plugins/runners/index.ts'

const TOOLS = [vscodeTasks]

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

const TASKS = `{
  // Comments and trailing commas are allowed.
  "version": "2.0.0",
  "tasks": [
    { "label": "build", "type": "shell", "command": "cargo build --release", },
    { "label": "pipe", "type": "shell", "command": "make | tee log", "args": ["it's"] },
    {
      "label": "test",
      "type": "process",
      "command": "\${workspaceFolder}/bin/test",
      "args": ["--name", "\${workspaceFolderBasename}"],
      "dependsOn": ["build", "missing"],
      "detail": "Run the tests",
    },
    { "label": "watch", "type": "shell", "command": "tsc -w", "isBackground": true },
    { "label": "lint-file", "type": "shell", "command": "eslint \${file}" },
    { "label": "web", "type": "npm", "script": "dev", "path": "apps/web" },
    { "label": "all", "dependsOn": ["build", "test"] },
    { "label": "gulp", "type": "gulp", "task": "default" },
    /* block comment */
  ],
}`

describe('vscode-tasks runner', () => {
  test('lists shell and process tasks with their argv', async () => {
    const { profile, catalog } = await run({ '.vscode/tasks.json': TASKS })
    const found = tasks(catalog)
    expect(found.map((t) => t.path[2])).toEqual([
      'build',
      'pipe',
      'test',
      'watch',
      'lint-file',
      'web',
    ])
    expect(named(found, 'build')).toMatchObject({
      argv: ['cargo', 'build', '--release'],
      cwd: '.',
      source: '.vscode/tasks.json',
      origin: 'declared',
    })
    expect(named(found, 'pipe').argv).toEqual(['sh', '-c', "make | tee log 'it'\\''s'"])
    const base = profile.root.split('/').pop()!
    expect(named(found, 'test')).toMatchObject({
      argv: [`${profile.root}/bin/test`, '--name', base],
      doc: 'Run the tests',
      dependsOn: ['vscode-tasks:.vscode/tasks.json:build'],
      dependsOnUnresolved: ['missing'],
    })
    expect(named(found, 'watch').persistent).toEqual({ value: true, declared: true })
  })

  test('an editor variable is kept and marks the task', async () => {
    const { catalog } = await run({ '.vscode/tasks.json': TASKS })
    expect(named(tasks(catalog), 'lint-file')).toMatchObject({
      argv: ['eslint', '${file}'],
      parametersUnknown: 'editor-variable',
    })
    expect(named(tasks(catalog), 'build').parametersUnknown).toBeUndefined()
  })

  test('an npm task resolves to the package script through its manager', async () => {
    const { catalog } = await run(
      {
        '.vscode/tasks.json': TASKS,
        'package.json': JSON.stringify({ workspaces: ['apps/*'] }),
        'pnpm-lock.yaml': '',
        'apps/web/package.json': JSON.stringify({ scripts: { dev: 'vite' } }),
      },
      [npm, pnpm, vscodeTasks],
    )
    expect(named(tasks(catalog), 'web')).toMatchObject({
      argv: ['pnpm', 'run', '--dir', 'apps/web', 'dev'],
      detail: 'npm script dev',
    })
  })

  test('arguments are appended, or passed as "$@" to a sh -c line', async () => {
    const { project, catalog } = await run({ '.vscode/tasks.json': TASKS })
    const found = tasks(catalog)
    expect(project.runners.invoke(named(found, 'build'), ['-p', 'x'])).toEqual([
      'cargo',
      'build',
      '--release',
      '-p',
      'x',
    ])
    expect(project.runners.invoke(named(found, 'pipe'), ['a b'])).toEqual([
      'sh',
      '-c',
      `make | tee log 'it'\\''s' "$@"`,
      'sh',
      'a b',
    ])
  })

  test('options.cwd sets the directory, and one outside the root is skipped', async () => {
    const { catalog } = await run({
      'ws/.vscode/tasks.json': JSON.stringify({
        tasks: [
          { label: 'here', command: 'ls' },
          { label: 'sub', command: 'ls', options: { cwd: '${workspaceFolder}/src' } },
          { label: 'away', command: 'ls', options: { cwd: '../..' } },
        ],
      }),
    })
    const found = tasks(catalog)
    expect(found.map((t) => [t.path[2], t.cwd])).toEqual([
      ['here', 'ws'],
      ['sub', 'ws/src'],
    ])
    expect(catalog.reports[0]!.diagnostics.map((d) => d.message)).toContainEqual(
      expect.stringMatching(/^away: options.cwd is outside/),
    )
  })

  test('tasks only VS Code can run are named in one diagnostic', async () => {
    const { catalog } = await run({ '.vscode/tasks.json': TASKS })
    expect(catalog.reports[0]!.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'info',
        message: 'tasks that only VS Code can run were skipped: all, gulp',
      }),
    ])
  })

  test('a malformed tasks.json is a diagnostic', async () => {
    const { catalog } = await run({ '.vscode/tasks.json': '{ "tasks": [ { "label": ' })
    expect(catalog.reports[0]).toMatchObject({ status: 'absent', tasks: [] })
    expect(catalog.reports[0]!.diagnostics[0]!.message).toMatch(/^unparseable tasks.json/)
  })

  test('absent without .vscode/tasks.json', async () => {
    const { catalog } = await run({ '.vscode/settings.json': '{}' })
    expect(catalog.reports).toEqual([])
  })
})
