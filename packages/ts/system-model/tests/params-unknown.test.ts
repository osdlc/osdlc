/**
 * `Task.parametersUnknown`: a task whose parameters could not be read says
 * why, so an empty `parameters` is not read as "takes none".
 */

import { afterAll, describe, expect, test } from 'vitest'

import { tasks } from '../src/model.ts'
import { collect, fakeRunners, fakeWhich, fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

const JUSTFILE = { justfile: 'deploy env:\n    ./deploy {{env}}\n' }
const DUMP = JSON.stringify({
  recipes: { deploy: { name: 'deploy', parameters: [{ name: 'env', kind: 'singular' }] } },
})

describe('just', () => {
  test('a recipe scanned without exec is marked exec-withheld', async () => {
    const found = tasks(await collect(await root(JUSTFILE), { discovery: 'walk', only: ['just'] }))
    expect(found[0]).toMatchObject({ parameters: [], parametersUnknown: 'exec-withheld' })
  })

  test('tool-missing when exec is allowed and just is not on the PATH', async () => {
    const found = tasks(
      await collect(await root(JUSTFILE), {
        discovery: 'walk',
        only: ['just'],
        allowExec: true,
        which: fakeWhich({}),
      }),
    )
    expect(found[0]?.parametersUnknown).toBe('tool-missing')
  })

  test('tool-failed when the dump fails', async () => {
    const fake = fakeRunners([{ binary: 'just', argv: ['--justfile'], exitCode: 1, stderr: 'bad' }])
    const found = tasks(
      await collect(await root(JUSTFILE), {
        discovery: 'walk',
        only: ['just'],
        allowExec: true,
        which: fakeWhich({ just: '/bin/just' }),
        makeRunner: fake.make,
      }),
    )
    expect(found[0]?.parametersUnknown).toBe('tool-failed')
  })

  test('a dumped recipe has its parameters and no marker', async () => {
    const fake = fakeRunners([{ binary: 'just', argv: ['--justfile'], stdout: DUMP }])
    const found = tasks(
      await collect(await root(JUSTFILE), {
        discovery: 'walk',
        only: ['just'],
        allowExec: true,
        which: fakeWhich({ just: '/bin/just' }),
        makeRunner: fake.make,
      }),
    )
    expect(found[0]?.parameters.map((p) => p.name)).toEqual(['env'])
    expect(found[0]).not.toHaveProperty('parametersUnknown')
  })
})

describe('rake and GitHub Actions', () => {
  test('a scanned rake task is marked, a listed one is not', async () => {
    const dir = await root({ Rakefile: 'task :release do\nend\n' })
    const scanned = tasks(await collect(dir, { discovery: 'walk', only: ['rake'] }))
    expect(scanned[0]?.parametersUnknown).toBe('exec-withheld')

    const fake = fakeRunners([
      { binary: 'rake', argv: ['-AT'], stdout: 'rake release[lib]  # Release' },
    ])
    const listed = tasks(
      await collect(dir, {
        discovery: 'walk',
        only: ['rake'],
        allowExec: true,
        which: fakeWhich({ rake: '/bin/rake' }),
        makeRunner: fake.make,
      }),
    )
    expect(listed[0]?.parameters.map((p) => p.name)).toEqual(['lib'])
    expect(listed[0]).not.toHaveProperty('parametersUnknown')
  })

  test('a dispatch workflow is marked not-read', async () => {
    const dir = await root({
      '.github/workflows/release.yml': 'on:\n  workflow_dispatch:\n    inputs:\n      v: {}\n',
    })
    const found = tasks(await collect(dir, { discovery: 'walk', only: ['github-actions'] }))
    expect(found[0]?.parametersUnknown).toBe('not-read')
  })
})
