import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import type { ToolDef } from '../src/tool.ts'
import { detectAndCollect, fakeWhich, fixtureRoot, removeRoot } from './support.ts'

import { pdm } from '../src/plugins/python/index.ts'

const TOOLS = [pdm]

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

const PYPROJECT = `
[project]
name = "demo"

[tool.pdm.scripts]
_.env_file = ".env"
start = "flask run -p 54321"
test = { cmd = ["pytest", "-x"], help = "Run the tests" }
pre_test = { shell = "echo setup" }
all = { composite = ["lint", "test"] }
_helper = "echo internal"
bad = { nothing = true }
`

describe('pdm runner', () => {
  test('lists scripts, skipping the shared `_` table and internal names', async () => {
    const { catalog } = await run({ 'pyproject.toml': PYPROJECT })
    const found = tasks(catalog)
    expect(found.map((t) => t.path[2])).toEqual(['start', 'test', 'pre_test', 'all'])
    expect(named(found, 'start')).toMatchObject({
      argv: ['pdm', 'run', 'start'],
      cwd: '.',
      detail: 'flask run -p 54321',
      origin: 'declared',
    })
    expect(named(found, 'test')).toMatchObject({ doc: 'Run the tests', detail: 'pytest -x' })
    expect(named(found, 'all').detail).toBe('lint; test')
  })

  test('a pre_ script runs first', async () => {
    const { catalog } = await run({ 'pyproject.toml': PYPROJECT })
    expect(named(tasks(catalog), 'test').dependsOn).toEqual(['pdm:pyproject.toml:pre_test'])
    expect(named(tasks(catalog), 'start').dependsOn).toBeUndefined()
  })

  test('arguments are appended; a nested project is named with -p', async () => {
    const { project, catalog } = await run({
      'svc/pyproject.toml': '[tool.pdm.scripts]\nlint = "ruff check"\n',
    })
    const lint = named(tasks(catalog), 'lint')
    expect(lint.argv).toEqual(['pdm', 'run', '-p', 'svc', 'lint'])
    expect(project.runners.invoke(lint, ['src'])).toEqual([
      'pdm',
      'run',
      '-p',
      'svc',
      'lint',
      'src',
    ])
  })

  test('a script of an unknown shape is a diagnostic', async () => {
    const { catalog } = await run({ 'pyproject.toml': PYPROJECT })
    expect(catalog.reports[0]!.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringMatching(/^pdm script bad/),
      }),
    ])
  })

  test('a broken pyproject.toml lists nothing and does not throw', async () => {
    const { catalog } = await run({
      'pyproject.toml': '[tool.pdm.scripts]\nx = "a"\n',
      'b/pyproject.toml': '[tool.pdm.scripts\n',
    })
    expect(catalog.reports[0]!.status).toBe('ok')
    expect(tasks(catalog).map((t) => t.source)).toEqual(['pyproject.toml'])
  })

  test('absent without a tool.pdm table', async () => {
    const { profile, catalog } = await run({ 'pyproject.toml': '[project]\nname = "x"\n' })
    expect(profile.tools).not.toContain('pdm')
    expect(catalog.reports).toEqual([])
  })
})
