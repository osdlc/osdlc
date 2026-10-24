import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import { maven } from '../src/plugins/jvm/index.ts'
import { type Canned, collect, fakeRunners, fixtureRoot, removeRoot } from './support.ts'

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
function opts(canned: Canned[] = [], extra: Record<string, unknown> = {}) {
  const { make, calls } = fakeRunners(canned)
  return { options: { discovery: 'walk' as const, makeRunner: make, ...extra }, calls }
}

const SHELL_METACHARS = /[;|&`]|\$\(/

describe('maven runner', () => {
  test('absent when no pom.xml exists', async () => {
    const dir = await root({ 'README.md': 'nothing here\n' })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [maven] }))

    expect(found).toEqual([])
  })

  test('root pom.xml synthesizes the four lifecycle verbs', async () => {
    const dir = await root({ 'pom.xml': '<project></project>\n' })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [maven] }))

    expect(found.map((t) => t.path[2])).toEqual(['test', 'package', 'install', 'verify'])
    expect(found.every((t) => t.origin === 'synthesized')).toBe(true)

    const testTask = found.find((t) => t.path[2] === 'test')
    expect(testTask?.argv).toEqual(['mvn', 'test'])
    expect(testTask?.cwd).toBe('.')
    expect(testTask?.display).toBe('mvn test')
  })

  test('nested pom.xml addresses via -f with the pom file path', async () => {
    const dir = await root({ 'sub/pom.xml': '<project></project>\n' })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [maven] }))

    const testTask = found.find((t) => t.path[2] === 'test')
    expect(testTask?.argv).toEqual(['mvn', '-f', 'sub/pom.xml', 'test'])
    expect(testTask?.cwd).toBe('.')
  })

  test('multiple pom.xml files each produce their own four tasks, deterministically ordered', async () => {
    const dir = await root({
      'pom.xml': '<project></project>\n',
      'sub/pom.xml': '<project></project>\n',
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [maven] }))

    expect(found).toHaveLength(8)
    const bySource = (source: string) => found.filter((t) => t.source === source)
    expect(bySource('pom.xml').map((t) => t.path[2])).toEqual([
      'test',
      'package',
      'install',
      'verify',
    ])
    expect(bySource('sub/pom.xml').map((t) => t.path[2])).toEqual([
      'test',
      'package',
      'install',
      'verify',
    ])

    // A second collect yields the same order.
    const again = tasks(await collect(dir, { ...options, tools: [maven] }))
    expect(again.map((t) => t.id)).toEqual(found.map((t) => t.id))
  })

  test('no argv element ever contains shell metacharacters', async () => {
    const dir = await root({
      'pom.xml': '<project></project>\n',
      'sub/pom.xml': '<project></project>\n',
    })
    const { options } = opts()
    const found: Task[] = tasks(await collect(dir, { ...options, tools: [maven] }))

    for (const t of found) {
      for (const arg of t.argv) {
        expect(SHELL_METACHARS.test(arg)).toBe(false)
      }
    }
  })
})
