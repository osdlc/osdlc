import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import type { ToolDef } from '../src/tool.ts'
import { detectAndCollect, fakeWhich, fixtureRoot, removeRoot } from './support.ts'

import { hatch } from '../src/plugins/python/index.ts'

const TOOLS = [hatch]

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

[tool.hatch.envs.default.scripts]
test = "pytest {args}"
cov = ["coverage run -m pytest", "coverage report"]

[tool.hatch.envs.lint.scripts]
check = "ruff check ."
bad = 3
`

describe('hatch runner', () => {
  test('names default scripts plainly and others env:script', async () => {
    const { catalog } = await run({ 'pyproject.toml': PYPROJECT })
    const found = tasks(catalog)
    expect(found.map((t) => t.path[2])).toEqual(['test', 'cov', 'lint:check'])
    expect(named(found, 'test')).toMatchObject({ argv: ['hatch', 'run', 'test'], cwd: '.' })
    expect(named(found, 'cov').detail).toBe('coverage run -m pytest; coverage report')
    expect(named(found, 'lint:check').argv).toEqual(['hatch', 'run', 'lint:check'])
  })

  test('arguments are appended, and a nested project runs in its directory', async () => {
    const { project, catalog } = await run({ 'py/pyproject.toml': PYPROJECT })
    const test_ = named(tasks(catalog), 'test')
    expect(test_.cwd).toBe('py')
    expect(project.runners.invoke(test_, ['-k', 'fast'])).toEqual([
      'hatch',
      'run',
      'test',
      '-k',
      'fast',
    ])
  })

  test("hatch.toml's envs win over pyproject.toml's", async () => {
    const { catalog } = await run({
      'pyproject.toml': PYPROJECT,
      'hatch.toml': '[envs.docs.scripts]\nbuild = "mkdocs build"\n',
    })
    expect(tasks(catalog).map((t) => [t.path[2], t.source])).toEqual([['docs:build', 'hatch.toml']])
  })

  test('a bad script and a broken hatch.toml are diagnostics', async () => {
    const { catalog } = await run({
      'pyproject.toml': PYPROJECT,
      'b/hatch.toml': '[envs\n',
    })
    const messages = catalog.reports[0]!.diagnostics.map((d) => [d.source, d.message])
    expect(messages).toContainEqual(['pyproject.toml', expect.stringMatching(/lint:bad/)])
    expect(messages).toContainEqual(['b/hatch.toml', expect.stringMatching(/^parse failed/)])
  })

  test('absent without hatch config', async () => {
    const { catalog } = await run({ 'pyproject.toml': '[project]\nname = "x"\n' })
    expect(catalog.reports).toEqual([])
  })
})
