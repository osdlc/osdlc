import { afterAll, describe, expect, test } from 'vitest'

import { tasks, type Task } from '../src/model.ts'
import { swiftpm } from '../src/plugins/swift/index.ts'
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

function byName(list: Task[], name: string): Task | undefined {
  return list.find((t) => t.path[t.path.length - 1] === name)
}

const MANIFEST = [
  '// swift-tools-version:5.9',
  'import PackageDescription',
  '',
  'let package = Package(name: "demo")',
  '',
].join('\n')

describe('swiftpm runner', () => {
  test('absent when there is no Package.swift', async () => {
    const dir = await root({ 'README.md': 'nothing here' })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [swiftpm] }))

    expect(found).toEqual([])
  })

  test('root-level Package.swift synthesizes build/test/run', async () => {
    const dir = await root({ 'Package.swift': MANIFEST })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [swiftpm] }))

    expect(found.map((t) => t.path[2])).toEqual(['build', 'test', 'run'])
    expect(found.every((t) => t.origin === 'synthesized')).toBe(true)
    expect(byName(found, 'build')?.argv).toEqual(['swift', 'build'])
  })

  test('nested Package.swift addresses via --package-path <dir>, not the manifest file', async () => {
    const dir = await root({ 'sub/Package.swift': MANIFEST })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [swiftpm] }))

    expect(byName(found, 'build')?.argv).toEqual(['swift', 'build', '--package-path', 'sub'])
    expect(byName(found, 'test')?.argv).toEqual(['swift', 'test', '--package-path', 'sub'])
    expect(byName(found, 'run')?.argv).toEqual(['swift', 'run', '--package-path', 'sub'])
  })

  test('multiple Package.swift manifests each produce their own three tasks', async () => {
    const dir = await root({
      'Package.swift': MANIFEST,
      'sub/Package.swift': MANIFEST,
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [swiftpm] }))

    expect(found).toHaveLength(6)
    expect(found.filter((t) => t.path[1] === '.')).toHaveLength(3)
    expect(found.filter((t) => t.path[1] === 'sub')).toHaveLength(3)
  })

  test('no argv element contains shell metacharacters', async () => {
    const dir = await root({
      'Package.swift': MANIFEST,
      'sub/Package.swift': MANIFEST,
    })
    const { options } = opts()
    const found = tasks(await collect(dir, { ...options, tools: [swiftpm] }))

    const shellMeta = /[;|&`]|\$\(/
    for (const task of found) {
      for (const arg of task.argv) {
        expect(shellMeta.test(arg)).toBe(false)
      }
    }
  })
})
