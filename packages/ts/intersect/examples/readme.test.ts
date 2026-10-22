/**
 * The README's examples, through the package name only: pattern-against-pattern
 * overlap, the registry, and the filesystem entry against a throwaway tree.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { expect, test } from 'vitest'

import { compile, index, intersects, overlapping, witness } from '@osdlc/intersect'
import { filesInScope } from '@osdlc/intersect/fs'

test('does one pattern overlap another?', () => {
  expect(intersects('src/**/*.ts', 'src/api/handler.ts')).toBe(true)
  expect(intersects('src/api/**', 'src/web/**')).toBe(false)
  expect(intersects('src/api/**', 'src/**/*.ts')).toBe(true)
  // A pattern with no wildcard is that exact path, not its subtree.
  expect(intersects('src/siteA/components', 'src/siteA/components/Button.vue')).toBe(false)
  expect(intersects('src/siteA/components/**', 'src/siteA/components/Button.vue')).toBe(true)
})

test('which patterns clash, and where?', () => {
  const taskA = ['src/api/**', 'src/db/schema.ts']
  const taskB = ['src/api/routes/*.ts', 'docs/**']

  expect(overlapping(taskA, taskB)).toEqual(['src/api/**'])
  expect(compile(taskA).overlapping(taskB)).toEqual(['src/api/routes/*.ts'])
  const shared = witness(taskA, taskB)
  expect(shared).not.toBeNull()
  expect(intersects(shared!, taskA[0]!)).toBe(true)
})

test('registry: which rules apply to a scope?', () => {
  const guidelines = index([
    { id: 'guidelines/UI', patterns: ['**/*.{vue,html,jsx}'] },
    { id: 'guidelines/UI/vue', patterns: ['**/*.vue'] },
    { id: 'guidelines/api', patterns: ['src/api/**'] },
  ])

  expect(guidelines.applicableTo('src/siteA/components/**')).toEqual([
    'guidelines/UI',
    'guidelines/UI/vue',
  ])
})

test('filesystem: resolve patterns against a real folder', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'intersect-example-'))
  try {
    for (const file of [
      'src/api/user.ts',
      'src/api/routes/list.ts',
      'src/db/pool.ts',
      'docs/a.md',
    ]) {
      mkdirSync(dirname(join(cwd, file)), { recursive: true })
      writeFileSync(join(cwd, file), '')
    }
    expect(await filesInScope(['src/api/**', 'src/db/**'], { cwd })).toEqual([
      'src/api/routes/list.ts',
      'src/api/user.ts',
      'src/db/pool.ts',
    ])
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
