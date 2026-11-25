/**
 * The README's quick start, run through the package name: prep the last commit
 * of a small repository and read the manifest.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, expect, test } from 'vitest'

import { spawnRunner } from '@osdlc/command-seam'
import { runPrep } from '@osdlc/code-stats/prep'

const root = realpathSync(mkdtempSync(join(tmpdir(), 'code-stats-prep-readme-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const git = (...args: string[]): void => {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' })
}

test('a changed file is kept, a lockfile is set aside, and the package is the group', () => {
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Example')
  git('config', 'user.email', 'example@example.invalid')
  mkdirSync(join(root, 'pkg'))
  writeFileSync(join(root, 'pkg', 'package.json'), '{}\n')
  writeFileSync(join(root, 'pkg', 'a.ts'), 'export const a = 1\n')
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 1\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'initial')
  writeFileSync(join(root, 'pkg', 'a.ts'), 'export const a = 2\n')
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 2\n')
  git('commit', '-q', '-a', '-m', 'change')

  // Diff the last commit against its parent; the runners are how it reaches git and gh.
  const manifest = runPrep(
    { cwd: root, pr: null, base: 'HEAD~1' },
    { git: spawnRunner('git'), gh: spawnRunner('gh') },
  )

  expect(manifest.files.kept.map((f) => f.path)).toEqual(['pkg/a.ts'])
  expect(manifest.files.dropped).toEqual([{ path: 'pnpm-lock.yaml', reason: 'generated' }])
  expect(manifest.groups).toMatchObject([
    { id: 'g1', roots: ['pkg'], files: ['pkg/a.ts'], lines: 2 },
  ])
})
