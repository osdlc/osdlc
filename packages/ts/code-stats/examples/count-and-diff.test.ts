import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import {
  DIFF_FLAGS,
  changeSpecFrom,
  compareChanges,
  compareReportSchema,
  countReportSchema,
  countTree,
  diffChange,
  diffReportSchema,
  measureChange,
  openRepo,
  parseChangeSpec,
  readDiff,
  renderCompare,
  renderDiff,
} from '@osdlc/code-stats'

const made: string[] = []
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** A throwaway repository on branch `main`; `commit` writes files and commits them. */
function repo() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'code-stats-example-')))
  made.push(dir)
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.name=Example', '-c', 'user.email=example@example.invalid', ...args],
      {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
      },
    ).trim()
  git('init', '-q', '-b', 'main')
  const commit = (message: string, files: Record<string, string>) => {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), content)
    }
    git('add', '-A')
    git('commit', '-q', '--allow-empty', '-m', message)
  }
  return { dir, git, commit }
}

/** Two commits: a file, then the same file with a comment added and one line changed. */
function twoCommits() {
  const r = repo()
  r.commit('one', { 'src/a.ts': "import { b } from './b.ts'\n\nexport const a = b + 1\n" })
  r.commit('two', {
    'src/a.ts': "import { b } from './b.ts'\n\n// one more\nexport const a = b + 2\n",
  })
  return r
}

test('countTree and diffChange against a small repository', () => {
  const r = twoCommits()

  const tree = countTree({ cwd: r.dir, paths: ['src'] })
  expect(tree.kinds).toEqual({ logic: 1, boilerplate: 1, comment: 1, doc: 0, blank: 1 })
  expect(countReportSchema.parse(tree)).toEqual(tree)

  const report = diffChange(parseChangeSpec('HEAD~1..HEAD'), { cwd: r.dir })
  expect(report.kindOperations.logic.changed).toBe(1)
  expect(report.kindOperations.comment.added).toBe(1)
  expect(renderDiff(report)).toContain('| Comments | 1 | 0 | 0 | 0 | +1 |')
  expect(diffReportSchema.parse(report)).toEqual(report)
})

test('compareChanges measures two changes the same way', () => {
  const r = twoCommits()
  const first = parseChangeSpec('HEAD~1..HEAD')
  const same = compareChanges(first, first, { cwd: r.dir })
  expect(same.a.kindOperations).toEqual(same.b.kindOperations)
  expect(compareReportSchema.parse(same)).toEqual(same)
  expect(renderCompare(same)).toContain('HEAD~1..HEAD')
})

test('changeSpecFrom turns separate selectors into a change', () => {
  expect(changeSpecFrom({ pr: 7 })).toEqual({ kind: 'pr', number: 7 })
  expect(changeSpecFrom({ base: 'main' })).toEqual({
    kind: 'merge-base',
    base: 'main',
    head: 'HEAD',
  })
  expect(changeSpecFrom({ base: 'a', head: 'b' })).toEqual({ kind: 'range', base: 'a', head: 'b' })
  expect(changeSpecFrom({ worktree: true })).toEqual({ kind: 'worktree' })
  expect(changeSpecFrom({})).toBeNull()
  expect(() => changeSpecFrom({ pr: 7, worktree: true })).toThrow('mutually exclusive')
})

test('measureChange keeps the repository and the diff the report counted', () => {
  const r = twoCommits()
  const measured = measureChange(parseChangeSpec('HEAD~1..HEAD'), { cwd: r.dir })
  expect(measured.report.files).toBe(1)
  expect(measured.files.map((f) => f.path)).toEqual(['src/a.ts'])
  expect(measured.texts.head.get('src/a.ts')).toMatchObject({ kind: 'text' })

  // The same repository, and the same diff text the report was counted from.
  const again = readDiff(measured.repo, measured.change)
  expect(again).toContain('+// one more')
  expect(openRepo(r.dir).root).toBe(measured.repo.root)
})

test('DIFF_FLAGS pin the diff to what parseDiff reads', () => {
  const r = twoCommits()
  const text = r.git('diff', '-U0', ...DIFF_FLAGS, 'HEAD~1', 'HEAD')
  expect(text).toContain('--- a/src/a.ts')
  expect(text).toContain('+++ b/src/a.ts')
})
