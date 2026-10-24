import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import { parsePyproject } from '../src/plugins/python/ecosystem.ts'
import { pythonTools } from '../src/plugins/python/index.ts'
import { collect, fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

/** Fixture roots are not repositories, so discovery is pinned to the walk. */
function opts(extra: Record<string, unknown> = {}) {
  return { discovery: 'walk' as const, tools: pythonTools, ...extra }
}

function byName(list: Task[], name: string): Task | undefined {
  return list.find((t) => t.path[t.path.length - 1] === name)
}

const PYPROJECT_WITH_SCRIPTS = [
  '[project]',
  'name = "demo"',
  '',
  '[project.scripts]',
  'mycli = "mypkg.cli:main"',
].join('\n')

const PYPROJECT_WITH_POETRY_SCRIPTS = [
  '[tool.poetry]',
  'name = "demo"',
  '',
  '[tool.poetry.scripts]',
  'mycli = "mypkg.cli:main"',
].join('\n')

describe('python runner — declared scripts', () => {
  test('[project.scripts] with a uv.lock present emits a `uv run` task', async () => {
    const dir = await root({
      'pyproject.toml': PYPROJECT_WITH_SCRIPTS,
      'uv.lock': '',
    })
    const found = tasks(await collect(dir, opts()))

    const task = byName(found, 'mycli')
    expect(task).toBeDefined()
    expect(task?.argv).toEqual(['uv', 'run', 'mycli'])
    expect(task?.origin).toBe('declared')
    expect(task?.cwd).toBe('.')
    expect(task?.display).toBe('uv run mycli')
    expect(task?.detail).toBe('mypkg.cli:main')
    expect(task?.tags).toEqual(['python', 'mycli', '.', 'uv'])
  })

  test('[tool.poetry.scripts] with a poetry.lock present emits a `poetry run` task', async () => {
    const dir = await root({
      'pyproject.toml': PYPROJECT_WITH_POETRY_SCRIPTS,
      'poetry.lock': '',
    })
    const found = tasks(await collect(dir, opts()))

    const task = byName(found, 'mycli')
    expect(task).toBeDefined()
    expect(task?.argv).toEqual(['poetry', 'run', 'mycli'])
    expect(task?.origin).toBe('declared')
  })

  test('no lockfile present: script is skipped and a diagnostic explains why', async () => {
    const dir = await root({
      'pyproject.toml': PYPROJECT_WITH_SCRIPTS,
    })
    const report = (await collect(dir, opts())).reports[0]!

    expect(byName(report.tasks, 'mycli')).toBeUndefined()
    expect(report.diagnostics).toHaveLength(1)
    expect(report.diagnostics[0]?.severity).toBe('info')
    expect(report.diagnostics[0]?.message).toContain('uv.lock')
    expect(report.diagnostics[0]?.message).toContain('poetry.lock')
    expect(report.diagnostics[0]?.source).toBe('pyproject.toml')
  })

  // uv is preferred when both lock files are present: it's the modern, faster
  // tool this repo generally leans toward, and precedence must be
  // deterministic either way.
  test('both uv.lock and poetry.lock present: uv wins', async () => {
    const dir = await root({
      'pyproject.toml': PYPROJECT_WITH_SCRIPTS,
      'uv.lock': '',
      'poetry.lock': '',
    })
    const found = tasks(await collect(dir, opts()))

    const task = byName(found, 'mycli')
    expect(task?.argv).toEqual(['uv', 'run', 'mycli'])
  })

  test('existing [tool.*] verb synthesis still works alongside new script tasks', async () => {
    const dir = await root({
      'pyproject.toml': [
        '[project]',
        'name = "demo"',
        '',
        '[project.scripts]',
        'mycli = "mypkg.cli:main"',
        '',
        '[tool.ruff.lint]',
        'select = ["E"]',
      ].join('\n'),
      'uv.lock': '',
    })
    const found = tasks(await collect(dir, opts()))

    const ruff = byName(found, 'ruff')
    expect(ruff?.argv).toEqual(['ruff', 'check', '.'])
    expect(ruff?.origin).toBe('synthesized')

    const script = byName(found, 'mycli')
    expect(script?.argv).toEqual(['uv', 'run', 'mycli'])
    expect(script?.origin).toBe('declared')
  })

  test('no argv element contains shell metacharacters', async () => {
    const dir = await root({
      'pyproject.toml': [
        PYPROJECT_WITH_SCRIPTS,
        '',
        '[tool.poetry.scripts]',
        'other = "mypkg:run"',
      ].join('\n'),
      'uv.lock': '',
    })
    const found = tasks(await collect(dir, opts()))

    const shellMeta = /[;|&`]|\$\(/
    for (const t of found) {
      for (const arg of t.argv) {
        expect(shellMeta.test(arg)).toBe(false)
      }
    }
  })

  test('a name declared in both sections is emitted only once', async () => {
    const dir = await root({
      'pyproject.toml': [
        '[project.scripts]',
        'mycli = "mypkg.cli:main"',
        '',
        '[tool.poetry.scripts]',
        'mycli = "mypkg.cli:main"',
      ].join('\n'),
      'uv.lock': '',
    })
    const found = tasks(await collect(dir, opts()))

    expect(found.filter((t) => t.path[t.path.length - 1] === 'mycli')).toHaveLength(1)
  })
})

describe('pyproject scripts, as detection parses them', () => {
  const scripts = (text: string) => parsePyproject(text, 'pyproject.toml').scripts

  test('a trailing comment after a quoted value is not part of it', () => {
    expect(scripts('[project.scripts]\nfoo = "bar" # note\n')).toEqual({ foo: 'bar' })
  })

  test('a section header that is a prefix of another is not confused with it', () => {
    const text = [
      '[tool.poetry.scripts-extra]',
      'fake = "nope:x"',
      '',
      '[tool.poetry.scripts]',
      'real = "mypkg:real"',
    ].join('\n')
    expect(scripts(text)).toEqual({ real: 'mypkg:real' })
  })

  test('single- and double-quoted values are both read; an empty section yields nothing', () => {
    expect(scripts('[project.scripts]\na = \'single\'\nb = "double"\n')).toEqual({
      a: 'single',
      b: 'double',
    })
    expect(scripts('[project.scripts]\n')).toEqual({})
  })

  test('invalid TOML sets error, and the runner reports it', async () => {
    expect(parsePyproject('[project\n', 'pyproject.toml').error).toMatch(/parse failed/)
    const dir = await root({ 'pyproject.toml': '[project\n' })
    const report = (await collect(dir, opts())).reports[0]!
    expect(report.tasks).toEqual([])
    expect(report.diagnostics[0]?.severity).toBe('warning')
  })
})

describe('python runner — declared scripts, directory joining', () => {
  test('a pyproject in a subdirectory checks <dir>/uv.lock, not the root, and expresses the directory via --project', async () => {
    const dir = await root({
      'sub/pyproject.toml': PYPROJECT_WITH_SCRIPTS,
      'sub/uv.lock': '',
    })
    const found = tasks(await collect(dir, opts()))

    const task = byName(found, 'mycli')
    expect(task).toBeDefined()
    expect(task?.argv).toEqual(['uv', 'run', '--project', 'sub', 'mycli'])
    expect(task?.cwd).toBe('.')
    expect(task?.display).toBe('uv run --project sub mycli')
  })

  test('a poetry project in a subdirectory expresses the directory via the global --directory flag, before `run`', async () => {
    const dir = await root({
      'sub/pyproject.toml': PYPROJECT_WITH_POETRY_SCRIPTS,
      'sub/poetry.lock': '',
    })
    const found = tasks(await collect(dir, opts()))

    const task = byName(found, 'mycli')
    expect(task).toBeDefined()
    expect(task?.argv).toEqual(['poetry', '--directory', 'sub', 'run', 'mycli'])
    expect(task?.cwd).toBe('.')
    expect(task?.display).toBe('poetry --directory sub run mycli')
  })

  test("a [tool.ruff] section in a subdirectory runs `ruff check <dir>` with cwd '.'", async () => {
    const dir = await root({
      'sub/pyproject.toml': '[project]\nname = "demo"\n\n[tool.ruff]\n',
    })
    const found = tasks(await collect(dir, opts()))

    const task = byName(found, 'ruff')
    expect(task).toBeDefined()
    expect(task?.argv).toEqual(['ruff', 'check', 'sub'])
    expect(task?.cwd).toBe('.')
    expect(task?.display).toBe('ruff check sub')
  })

  test("a root-level project's argv carries no redundant directory flag", async () => {
    const dir = await root({
      'pyproject.toml': PYPROJECT_WITH_SCRIPTS,
      'uv.lock': '',
    })
    const found = tasks(await collect(dir, opts()))

    const task = byName(found, 'mycli')
    expect(task?.argv).toEqual(['uv', 'run', 'mycli'])
    expect(task?.cwd).toBe('.')
  })

  test('a root uv.lock serves a subdirectory pyproject, as in a uv workspace', async () => {
    const dir = await root({
      'sub/pyproject.toml': PYPROJECT_WITH_SCRIPTS,
      'uv.lock': '',
    })
    const report = (await collect(dir, opts())).reports[0]!

    expect(byName(report.tasks, 'mycli')?.argv).toEqual(['uv', 'run', '--project', 'sub', 'mycli'])
  })
})

describe('python runner, tools', () => {
  test('offers a tool only when the project configures it', async () => {
    const dir = await root({
      'pyproject.toml': '[project]\nname = "demo"\n\n[tool.ruff.lint]\nselect = ["E"]\n',
    })
    const found = tasks(await collect(dir, opts()))
    expect(found.map((t) => t.path[2])).toEqual(['ruff'])
    expect(found[0]?.argv).toEqual(['ruff', 'check', '.'])
    expect(found[0]?.origin).toBe('synthesized')
  })

  test('is absent when a pyproject configures no known tool', async () => {
    const dir = await root({ 'pyproject.toml': '[project]\nname = "demo"\n' })
    const report = (await collect(dir, opts())).reports[0]!
    expect(report.status).toBe('absent')
  })
})
