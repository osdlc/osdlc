import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { spawnRunner } from '@osdlc/command-seam'
import { makeGitFixture, type GitFixture } from '@osdlc/typed-git/testing'

import { runPrep, type PrepArgs } from '../src/prep/run.ts'

export const fixtures: GitFixture[] = []

export function cleanupFixtures(): void {
  for (const f of fixtures.splice(0)) f.cleanup()
}

/**
 * A repo whose `main` holds `before` and whose `feature` branch (checked out)
 * holds `after` on top: a file mapped to null is deleted. `main` is the
 * `--base` of the change the branch makes.
 */
export function branchRepo(before: Record<string, string>, after: Record<string, string | null>) {
  const fx = makeGitFixture({ prefix: 'code-stats-prep-' })
  fixtures.push(fx)
  const base = fx.commit('base', { '.gitignore': 'node_modules\n', ...before })
  fx.git.checkout('main', { branch: 'feature' })
  const head = commitAfter(fx, 'feature', after)
  return { fx, base, head }
}

/** Another commit on the current branch; null deletes the file. */
export function commitAfter(
  fx: GitFixture,
  message: string,
  files: Record<string, string | null>,
): string {
  const write: Record<string, string> = {}
  for (const [path, text] of Object.entries(files)) {
    if (text === null) rmSync(join(fx.dir, path))
    else write[path] = text
  }
  return fx.commit(message, write)
}

export function put(fx: GitFixture, path: string, text: string): void {
  mkdirSync(dirname(join(fx.dir, path)), { recursive: true })
  writeFileSync(join(fx.dir, path), text)
}

/** `prep` over a fixture against `main`, real git, no gh. */
export function prep(fx: GitFixture, args: Partial<PrepArgs> = {}) {
  return runPrep(
    { cwd: fx.dir, pr: null, base: 'main', ...args },
    { git: spawnRunner('git'), gh: spawnRunner('gh') },
  )
}

/** `n` distinct one-line functions, to make a file of any size. */
export function body(lines: number, name = 'fn'): string {
  const rows = Array.from({ length: lines }, (_, i) => `  const v${i} = ${i}`)
  return `export function ${name}() {\n${rows.join('\n')}\n}\n`
}
