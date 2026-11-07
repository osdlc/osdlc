/**
 * Read a changeset out of git: the changed files, their diffs, and the base
 * they are measured from. `reviewChanges` does all of this itself; these are
 * the pieces, for a caller that builds its own run.
 */
import { expect, test } from 'vitest'

import {
  ChangesetError,
  changedFiles,
  defaultBase,
  fileDiffs,
  resolveBase,
  reviewChanges,
  ScopeError,
  stagedFiles,
  trackedFiles,
  type ReviewChangesOptions,
  type ReviewChangesResult,
  type Severity,
} from '@osdlc/rule-review'

import { commitAll, makeRepo, writeFile } from '../tests/fixture-repo.ts'

test('the changed files of a branch, their diffs, and the base they are measured from', () => {
  const { root, git } = makeRepo({ 'src/a.ts': 'export const a = 1\n', 'README.md': 'hi\n' })
  git.raw(['switch', '-q', '-c', 'feature'])
  writeFile(root, 'src/a.ts', 'export const a = 2\n')
  commitAll(git, 'change a')
  writeFile(root, 'src/new.ts', 'export const n = 1\n') // untracked work counts too

  // No origin here, so the default base is main, as written.
  expect(defaultBase(root)).toBe('main')
  expect(resolveBase(root, 'main')).toBe('main')

  const files = changedFiles(root, 'main')
  expect(files).toEqual(['src/a.ts', 'src/new.ts'])
  const [diff] = fileDiffs(root, 'main', files)
  expect(diff?.file).toBe('src/a.ts')
  expect(diff?.diff).toContain('+export const a = 2')

  expect(trackedFiles(root)).toEqual(['README.md', 'src/a.ts'])
  git.add(['src/new.ts'])
  expect(stagedFiles(root)).toEqual(['src/new.ts'])
})

test('reviewChanges refuses a directory outside git, a base that does not resolve, and a bad pattern', async () => {
  const { root } = makeRepo({ 'CLAUDE.md': 'Rules.\n', 'a.ts': 'a\n' })
  writeFile(root, 'a.ts', 'b\n')

  const badBase: ReviewChangesOptions = { cwd: root, base: 'no-such-branch' }
  const err = await reviewChanges(badBase).catch((e: unknown) => e)
  expect(err).toBeInstanceOf(ChangesetError)
  expect((err as ChangesetError).kind).toBe('bad-base')

  const badPattern = await reviewChanges({
    cwd: root,
    dryRun: true,
    config: { exclude: ['{1..3}'] },
  }).catch((e: unknown) => e)
  expect(badPattern).toBeInstanceOf(ScopeError)

  // A dry run reads everything and starts no agent.
  const floor: Severity = 'violation'
  const run: ReviewChangesResult = await reviewChanges({
    cwd: root,
    dryRun: true,
    config: { severityFloor: floor },
  })
  expect(run.changedFiles).toEqual(['a.ts'])
  expect(run.jobs).toHaveLength(1)
  expect(run.config.severityFloor).toBe('violation')
})
