/**
 * The README's opening example, run through the package name: a branch already
 * merged into the default branch is proposed for deletion, with the command that
 * would act on it, and the sweep itself deletes nothing.
 */
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, expect, test } from 'vitest'

import { Git } from '@osdlc/typed-git'
import { IDENTITY } from '@osdlc/typed-git/testing'
import { sweepRepo } from '@osdlc/repo-cleaner'

const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-readme-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const git = (args: string[]): string =>
  new Git(root, { env: { ...IDENTITY } }).rawChecked(args).stdout.trim()

test('a branch merged into main is listed as safe to delete, and still exists', () => {
  git(['init', '-q', '-b', 'main'])
  git(['commit', '--allow-empty', '-q', '-m', 'initial'])
  git(['branch', 'fix/login-redirect'])
  const tip = git(['rev-parse', 'fix/login-redirect'])

  const sweep = sweepRepo(root, { noGh: true, cwd: root })

  const item = sweep.items.find(
    (i) => i.category === 'local_branch' && i.id === 'fix/login-redirect',
  )
  expect(item?.classification).toBe('safe-to-delete')
  expect(item?.commands).toEqual([`git update-ref -d refs/heads/fix/login-redirect ${tip}`])
  expect(git(['rev-parse', 'fix/login-redirect'])).toBe(tip)
})
