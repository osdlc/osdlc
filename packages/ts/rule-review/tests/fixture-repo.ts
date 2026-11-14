/** Throwaway git repos for tests, on typed-git's fixture (pinned identity, no signing). */
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { Git } from '@osdlc/typed-git'
import { makeGitFixture } from '@osdlc/typed-git/testing'

/** Run a git command that must succeed. */
export function sh(git: Git, argv: string[]): void {
  git.rawChecked(argv)
}

export function writeFile(root: string, rel: string, body: string): void {
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body, 'utf8')
}

/**
 * A repo on `main` with one commit holding `files`. Its path is real, as git
 * reports it: on macOS the temp dir is under /var, a symlink to /private/var.
 */
export function makeRepo(files: Record<string, string>): { root: string; git: Git } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'rule-review-repo-')))
  const fixture = makeGitFixture({ dir })
  fixture.commit('base', files)
  return { root: fixture.dir, git: fixture.git }
}

export function commitAll(git: Git, message: string): void {
  git.add(['.'])
  git.commit({ message })
}
