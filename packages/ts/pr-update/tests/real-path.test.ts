/** realOr: the one real-path helper the update, kept-tree, prune and preflight code share. */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { realOr } from '../src/real-path.ts'

let dir: string
beforeEach(() => {
  dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'pr-update-real-path-')))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

test('a path through a symbolic link resolves to its target', () => {
  mkdirSync(join(dir, 'real'))
  symlinkSync(join(dir, 'real'), join(dir, 'link'), 'dir')
  expect(realOr(join(dir, 'link'))).toBe(join(dir, 'real'))
})

test('a path that does not exist comes back as given', () => {
  const missing = join(dir, 'link-to-nowhere', 'x')
  expect(realOr(missing)).toBe(missing)
  expect(realOr('relative/missing')).toBe('relative/missing')
})
