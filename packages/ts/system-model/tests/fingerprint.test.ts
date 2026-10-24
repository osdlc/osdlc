/**
 * Fingerprint behaviour, against real fixture trees.
 *
 * These use real files rather than a mocked `fs` on purpose: the properties
 * being asserted (a touch does not invalidate, a directory's entries do) are
 * properties of `stat` and `readFile`, and a mock would only prove the mock.
 */

import { describe, expect, test } from 'vitest'
import { mkdir, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { AsyncCommandRunner } from '@osdlc/command-seam'

import { builtins } from '../src/builtins.ts'
import { createLister } from '../src/discovery.ts'
import { fingerprint, MAX_FINGERPRINT_FILES } from '../src/fingerprint.ts'
import { fixtureRoot, removeRoot } from './support.ts'

/** A lister over a fixture root. `walk` so no git repository is needed. */
function listerFor(root: string): (pattern: string) => Promise<string[]> {
  const noGit: AsyncCommandRunner = {
    async run() {
      return { exitCode: 127, stdout: '', stderr: '' }
    },
  }
  return createLister(root, 'walk', noGit)
}

async function digestOf(root: string, paths: string[], patterns: string[] = []): Promise<string> {
  const fp = await fingerprint({ root, paths, patterns, files: listerFor(root) })
  return fp.digest
}

describe('fingerprint', () => {
  test('a changed file changes the digest', async () => {
    const root = await fixtureRoot({ justfile: 'build:\n\techo one\n' })
    try {
      const before = await digestOf(root, ['justfile'])
      await writeFile(join(root, 'justfile'), 'build:\n\techo two\n', 'utf-8')
      expect(await digestOf(root, ['justfile'])).not.toBe(before)
    } finally {
      await removeRoot(root)
    }
  })

  test('a touched-but-unchanged file does NOT change the digest', async () => {
    const root = await fixtureRoot({ justfile: 'build:\n\techo one\n' })
    try {
      const before = await digestOf(root, ['justfile'])
      const later = new Date(Date.now() + 60_000)
      await utimes(join(root, 'justfile'), later, later)
      // Rewritten with identical bytes as well: a formatter's no-op edit.
      await writeFile(join(root, 'justfile'), 'build:\n\techo one\n', 'utf-8')
      expect(await digestOf(root, ['justfile'])).toBe(before)
    } finally {
      await removeRoot(root)
    }
  })

  test('a deleted path changes the digest', async () => {
    const root = await fixtureRoot({ justfile: 'build:\n' })
    try {
      const present = await digestOf(root, ['justfile'])
      const absent = await digestOf(root, ['justfile', 'gone.toml'])
      expect(absent).not.toBe(present)
    } finally {
      await removeRoot(root)
    }
  })

  test('a recorded directory invalidates when a file is added inside it', async () => {
    // The `mise-tasks/` case: `ctx.exists()` on the directory is true before
    // and after, so an existence check alone would never change.
    const root = await fixtureRoot({ 'mise-tasks/build': '#!/bin/sh\n' })
    try {
      const before = await digestOf(root, ['mise-tasks'])
      await writeFile(join(root, 'mise-tasks', 'test'), '#!/bin/sh\n', 'utf-8')
      expect(await digestOf(root, ['mise-tasks'])).not.toBe(before)
    } finally {
      await removeRoot(root)
    }
  })

  test('a watch pattern picks up a newly added nested file', async () => {
    const root = await fixtureRoot({ 'mise.toml': "[tasks.build]\nrun = 'x'\n" })
    try {
      const recorded = ['mise.toml']
      const watchedBefore = await digestOf(root, recorded, ['mise.toml'])
      const unwatchedBefore = await digestOf(root, recorded)

      await mkdir(join(root, 'sub'), { recursive: true })
      await writeFile(join(root, 'sub', 'mise.toml'), '[tasks.deploy]\n', 'utf-8')

      // The recorded reads alone cannot see a file that did not exist when
      // they were recorded, which is exactly why `watch` exists.
      expect(await digestOf(root, recorded)).toBe(unwatchedBefore)
      expect(await digestOf(root, recorded, ['mise.toml'])).not.toBe(watchedBefore)
    } finally {
      await removeRoot(root)
    }
  })

  test('an anchored watch pattern ignores a file of the same name deeper down', async () => {
    const root = await fixtureRoot({ 'mise.toml': 'a\n' })
    try {
      const before = await digestOf(root, [], ['/mise.toml'])
      await mkdir(join(root, 'sub'), { recursive: true })
      await writeFile(join(root, 'sub', 'mise.toml'), 'b\n', 'utf-8')
      expect(await digestOf(root, [], ['/mise.toml'])).toBe(before)
      expect(await digestOf(root, [], ['mise.toml'])).not.toBe(before)
    } finally {
      await removeRoot(root)
    }
  })

  test('a trailing-slash watch pattern covers every file under the directory', async () => {
    const root = await fixtureRoot({ '.moon/tasks/all.yml': 'a\n' })
    try {
      const before = await digestOf(root, [], ['/.moon/tasks/'])
      await writeFile(join(root, '.moon/tasks/node.yml'), 'b\n', 'utf-8')
      const added = await digestOf(root, [], ['/.moon/tasks/'])
      expect(added).not.toBe(before)

      await writeFile(join(root, '.moon/tasks/all.yml'), 'c\n', 'utf-8')
      expect(await digestOf(root, [], ['/.moon/tasks/'])).not.toBe(added)
    } finally {
      await removeRoot(root)
    }
  })

  test('paths are sorted and reported', async () => {
    const root = await fixtureRoot({ b: '1', a: '2' })
    try {
      const fp = await fingerprint({
        root,
        paths: ['b', 'a'],
        patterns: [],
        files: listerFor(root),
      })
      expect(fp.paths).toEqual(['a', 'b'])
      expect(fp.truncated).toBe(false)
    } finally {
      await removeRoot(root)
    }
  })

  test('patterns and excludes are stored sorted and deduplicated where they are sets', async () => {
    const root = await fixtureRoot({ a: '1' })
    try {
      const fp = await fingerprint({
        root,
        paths: [],
        patterns: ['b', 'a', 'b'],
        excludes: ['z', 'y'],
        files: listerFor(root),
      })
      expect(fp.patterns).toEqual(['a', 'b'])
      expect(fp.excludes).toEqual(['y', 'z'])
    } finally {
      await removeRoot(root)
    }
  })

  test('the cap truncates deterministically, after sorting', async () => {
    const many: Record<string, string> = {}
    const names: string[] = []
    for (let i = 0; i < MAX_FINGERPRINT_FILES + 10; i++) {
      const name = `f${String(i).padStart(4, '0')}.txt`
      many[name] = String(i)
      names.push(name)
    }
    const root = await fixtureRoot(many)
    try {
      const shuffled = [...names].reverse()
      const fp = await fingerprint({ root, paths: shuffled, patterns: [], files: listerFor(root) })
      expect(fp.truncated).toBe(true)
      expect(fp.paths.length).toBe(MAX_FINGERPRINT_FILES)
      expect(fp.paths).toEqual([...names].sort().slice(0, MAX_FINGERPRINT_FILES))
    } finally {
      await removeRoot(root)
    }
  })
})

describe('declared watch patterns', () => {
  const declared = builtins.filter((t) => t.roles.runner?.watch !== undefined)

  test('some runners declare one at all', () => {
    expect(declared.map((t) => t.id).sort()).toEqual(['gradle', 'mise', 'moon', 'sbt'])
  })

  test('each declared pattern matches something in a fixture built for it', async () => {
    const fixtures: Record<string, Record<string, string>> = {
      moon: {
        '.moon/workspace.yml': 'projects: []\n',
        '.moon/tasks/all.yml': 'tasks: {}\n',
        'apps/web/moon.yml': 'tasks: {}\n',
      },
      mise: {
        'mise.toml': '[tasks.a]\n',
        '.mise.toml': '[tasks.b]\n',
        'mise.local.toml': '[tasks.c]\n',
        '.mise.local.toml': '[tasks.d]\n',
        '.config/mise/config.toml': '[tasks.e]\n',
        '.tool-versions': 'node 22\n',
        // Not named `build`: that name is excluded at any depth.
        'mise-tasks/deploy': '#!/bin/sh\n',
        '.mise/tasks/test': '#!/bin/sh\n',
        '.config/mise/tasks/lint': '#!/bin/sh\n',
      },
      sbt: { 'build.sbt': 'name := "x"\n', 'sub/other.sbt': 'name := "y"\n' },
      gradle: {
        'build.gradle': '',
        'build.gradle.kts': '',
        'settings.gradle': '',
        'settings.gradle.kts': '',
      },
    }

    for (const tool of declared) {
      const files = fixtures[tool.id]
      // A runner that grows a `watch` without a fixture here fails loudly.
      expect(files, tool.id).toBeDefined()
      const root = await fixtureRoot(files ?? {})
      try {
        const lister = listerFor(root)
        for (const pattern of tool.roles.runner?.watch ?? []) {
          const hits = await lister(pattern)
          expect(hits.length, `${tool.id}:${pattern}`).toBeGreaterThan(0)
        }
      } finally {
        await removeRoot(root)
      }
    }
  })

  test('mise watches its root configs only, not a same-named file deeper down', async () => {
    const root = await fixtureRoot({ 'mise.toml': 'a\n', 'sub/mise.toml': 'b\n' })
    try {
      const mise = builtins.find((t) => t.id === 'mise')
      const hits = (
        await Promise.all((mise?.roles.runner?.watch ?? []).map((p) => listerFor(root)(p)))
      ).flat()
      expect(hits).toEqual(['mise.toml'])
    } finally {
      await removeRoot(root)
    }
  })
})
