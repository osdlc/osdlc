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
import { sweep } from '@osdlc/repo-cleaner'

const root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-readme-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const git = (args: string[]): string =>
  new Git(root, { env: { ...IDENTITY } }).rawChecked(args).stdout.trim()

test('a branch merged into main is proposed for deletion, and still exists', () => {
  git(['init', '-q', '-b', 'main'])
  git(['commit', '--allow-empty', '-q', '-m', 'initial'])
  git(['branch', 'fix/login-redirect'])
  const tip = git(['rev-parse', 'fix/login-redirect'])

  const result = sweep([root], { cwd: root })
  const row = result.repos[0].rows.find((r) => r.id === 'branch:fix/login-redirect')

  expect(row?.verdict).toBe('delete')
  expect(row?.commands).toEqual([`git update-ref -d refs/heads/fix/login-redirect ${tip}`])
  expect(git(['rev-parse', 'fix/login-redirect'])).toBe(tip)
})
