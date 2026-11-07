/** Throwaway git repos for tests. */
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { Git } from '@osdlc/typed-git'

export function sh(git: Git, argv: string[]): void {
  const r = git.raw(argv)
  if (r.exitCode !== 0) throw new Error(`${argv.join(' ')}: ${r.stderr}`)
}

export function writeFile(root: string, rel: string, body: string): void {
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body, 'utf8')
}

/** A repo on `main` with one commit holding `files`. */
export function makeRepo(files: Record<string, string>): { root: string; git: Git } {
  // Real, as git reports it: on macOS the temp dir is under /var, a symlink to /private/var.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rule-review-repo-')))
  const git = new Git(root)
  sh(git, ['init', '-q', '-b', 'main', '.'])
  sh(git, ['config', 'user.email', 't@t'])
  sh(git, ['config', 'user.name', 't'])
  for (const [rel, body] of Object.entries(files)) writeFile(root, rel, body)
  commitAll(git, 'base')
  return { root, git }
}

export function commitAll(git: Git, message: string): void {
  git.add(['.'])
  git.commit({ message })
}
