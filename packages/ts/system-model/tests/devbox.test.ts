import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import type { ToolDef } from '../src/tool.ts'
import { detectAndCollect, fakeWhich, fixtureRoot, removeRoot } from './support.ts'
import { devbox } from '../src/plugins/runners/index.ts'

const TOOLS = [devbox]

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

const DEVBOX = `{
  // devbox.json accepts comments.
  "packages": ["nodejs@20"],
  "shell": {
    "scripts": {
      "test": "npm test",
      "setup": ["npm ci", "npm run build"],
      "bad": 3,
    },
  },
}`

describe('devbox runner', () => {
  test('lists shell.scripts', async () => {
    const { catalog } = await run({ 'devbox.json': DEVBOX })
    const found = tasks(catalog)
    expect(found.map((t) => t.path[2])).toEqual(['test', 'setup'])
    expect(named(found, 'test')).toMatchObject({
      argv: ['devbox', 'run', 'test'],
      cwd: '.',
      detail: 'npm test',
      origin: 'declared',
    })
    expect(named(found, 'setup').detail).toBe('npm ci; npm run build')
  })

  test('a nested devbox.json is named with --config, and arguments are appended', async () => {
    const { project, catalog } = await run({ 'svc/devbox.json': DEVBOX })
    const test_ = named(tasks(catalog), 'test')
    expect(test_.argv).toEqual(['devbox', 'run', '--config', 'svc', 'test'])
    expect(project.runners.invoke(test_, ['--', '-u'])).toEqual([
      'devbox',
      'run',
      '--config',
      'svc',
      'test',
      '--',
      '-u',
    ])
  })

  test('a bad script and a malformed file are diagnostics', async () => {
    const { catalog } = await run({ 'devbox.json': DEVBOX, 'b/devbox.json': '{ "shell": ' })
    const messages = catalog.reports[0]!.diagnostics.map((d) => [d.source, d.message])
    expect(messages).toContainEqual(['devbox.json', expect.stringMatching(/script bad is not/)])
    expect(messages).toContainEqual(['b/devbox.json', expect.stringMatching(/^unparseable/)])
  })

  test('absent without scripts or without devbox.json', async () => {
    const empty = await run({ 'devbox.json': '{ "packages": [] }' })
    expect(empty.catalog.reports[0]!.status).toBe('absent')
    const none = await run({ 'README.md': '' })
    expect(none.catalog.reports).toEqual([])
  })
})
