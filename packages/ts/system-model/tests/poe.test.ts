import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import { poe, uv } from '../src/plugins/python/index.ts'
import { detectAndCollect, fixtureRoot, removeRoot } from './support.ts'

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
async function run(files: Record<string, string>, tools = [poe]) {
  return detectAndCollect(await root(files), { discovery: 'walk', tools })
}

function named(list: Task[], name: string): Task {
  const task = list.find((t) => t.path[t.path.length - 1] === name)
  if (task === undefined) throw new Error(`no task ${name}`)
  return task
}

const PYPROJECT = `
[project]
name = "demo"

[tool.poe.tasks]
test = "pytest"
lint = { cmd = "ruff check .", help = "Lint the code" }
_private = "echo hidden"
check = ["lint", "test"]
release = { shell = "make release", deps = ["lint", "missing --flag"] }

[tool.poe.tasks.serve]
cmd = "app serve"
args = [
  { name = "host", options = ["-h", "--host"], default = "localhost", help = "Bind address" },
  { name = "mode", choices = ["dev", "prod"], required = true },
  { name = "verbose", type = "boolean" },
  { name = "files", positional = true, multiple = true },
]
`

describe('poe runner', () => {
  test('lists tasks from [tool.poe.tasks], skipping private ones', async () => {
    const { catalog } = await run({ 'pyproject.toml': PYPROJECT })
    const found = tasks(catalog)
    expect(found.map((t) => t.path[2])).toEqual(['test', 'lint', 'check', 'release', 'serve'])
    expect(named(found, 'test')).toMatchObject({
      argv: ['poe', 'test'],
      cwd: '.',
      source: 'pyproject.toml',
      origin: 'declared',
      detail: 'pytest',
    })
    expect(named(found, 'lint').doc).toBe('Lint the code')
    expect(named(found, 'check').tags).toContain('sequence')
  })

  test('args become parameters with their binding', async () => {
    const { catalog } = await run({ 'pyproject.toml': PYPROJECT })
    expect(named(tasks(catalog), 'serve').parameters).toEqual([
      {
        name: 'host',
        required: false,
        variadic: false,
        default: 'localhost',
        binding: { kind: 'flag', flag: '--host' },
        doc: 'Bind address',
      },
      {
        name: 'mode',
        required: true,
        variadic: false,
        binding: { kind: 'flag', flag: '--mode' },
        choices: ['dev', 'prod'],
      },
      {
        name: 'verbose',
        required: false,
        variadic: false,
        binding: { kind: 'switch', flag: '--verbose' },
      },
      { name: 'files', required: false, variadic: true },
    ])
  })

  test('invoke binds named values and appends positional ones', async () => {
    const { project, catalog } = await run({ 'pyproject.toml': PYPROJECT })
    const serve = named(tasks(catalog), 'serve')
    expect(
      project.runners.invoke(serve, { mode: 'dev', verbose: 'true', files: ['a', 'b'] }),
    ).toEqual(['poe', 'serve', '--host', 'localhost', '--mode', 'dev', '--verbose', 'a', 'b'])
    expect(project.runners.invoke(serve, { mode: 'dev', verbose: 'false' })).toEqual([
      'poe',
      'serve',
      '--host',
      'localhost',
      '--mode',
      'dev',
    ])
    expect(() => project.runners.invoke(serve, { mode: 'staging' })).toThrow(/one of dev, prod/)
    expect(project.runners.invoke(named(tasks(catalog), 'test'), ['-k', 'fast'])).toEqual([
      'poe',
      'test',
      '-k',
      'fast',
    ])
  })

  test('deps fill dependsOn, keeping the names that match no task', async () => {
    const { catalog } = await run({ 'pyproject.toml': PYPROJECT })
    const release = named(tasks(catalog), 'release')
    expect(release.dependsOn).toEqual(['poe:pyproject.toml:lint'])
    expect(release.dependsOnUnresolved).toEqual(['missing'])
  })

  test('runs through uv when uv manages the package', async () => {
    const { catalog } = await run(
      {
        'pyproject.toml': '[project]\nname = "x"\n',
        'uv.lock': '',
        'svc/pyproject.toml': '[project]\nname = "svc"\n[tool.poe.tasks]\nup = "app"\n',
        'svc/uv.lock': '',
      },
      [uv, poe],
    )
    expect(named(tasks(catalog), 'up').argv).toEqual([
      'uv',
      'run',
      '--project',
      'svc',
      'poe',
      '-C',
      'svc',
      'up',
    ])
  })

  test('reads poe_tasks.toml when pyproject.toml has no tool.poe', async () => {
    const { catalog } = await run({
      'pyproject.toml': '[project]\nname = "x"\n',
      'poe_tasks.toml': '[tasks]\nfmt = "black ."\n',
      'poe_tasks.yaml': 'tasks:\n  ignored: echo\n',
    })
    expect(tasks(catalog).map((t) => [t.path[2], t.source])).toEqual([['fmt', 'poe_tasks.toml']])
  })

  test('reads poe_tasks.yaml with the tool.poe prefix', async () => {
    const { catalog } = await run({
      'tools/poe_tasks.yaml': 'tool:\n  poe:\n    tasks:\n      gen: python gen.py\n',
    })
    expect(named(tasks(catalog), 'gen').argv).toEqual(['poe', '-C', 'tools', 'gen'])
  })

  test('a malformed poe_tasks file is a diagnostic, and a bad task is skipped', async () => {
    const { catalog } = await run({
      'poe_tasks.toml': '[tasks\nbroken',
      'b/poe_tasks.json': JSON.stringify({ tasks: { ok: 'echo', bad: 3 }, include: 'x.toml' }),
    })
    const messages = catalog.reports[0]!.diagnostics.map((d) => [d.source, d.message])
    expect(messages).toContainEqual(['poe_tasks.toml', expect.stringMatching(/^parse failed/)])
    expect(messages).toContainEqual(['b/poe_tasks.json', expect.stringMatching(/bad is not/)])
    expect(messages).toContainEqual(['b/poe_tasks.json', expect.stringMatching(/include/)])
    expect(tasks(catalog).map((t) => t.path[2])).toEqual(['ok'])
  })

  test('absent without a poe table or poe_tasks file', async () => {
    const { profile, catalog } = await run({ 'pyproject.toml': '[project]\nname = "x"\n' })
    expect(profile.tools).not.toContain('poe')
    expect(catalog.reports).toEqual([])
  })
})
