/**
 * A failed PR's worktree, kept for a person to pick up (`--keep-failed`).
 *
 * The tree lives at `<checkout>/.pr-update/failed/<owner>-<name>-<number>/`, on a branch named for
 * the PR, so `git worktree list` shows it and a person can finish the fix and push it. Beside it,
 * `<owner>-<name>-<number>.json` records the head and base sha the run saw, so a later run can tell
 * whether the PR has moved since. The verify log is written into the tree and kept out of commits.
 *
 * The tree is the state the update ended in. A verify failure leaves the built merge or rebase
 * result. A conflict is aborted, which leaves the PR's own head.
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { atomicWrite } from '@osdlc/etag-write'
import type { Git } from '@osdlc/typed-git'

/** The log a failed verify leaves in a kept worktree. */
export const VERIFY_LOG = '.pr-update-verify.log'

/** What a kept worktree was built from. */
export interface KeptRecord {
  /** `owner/name`. */
  repo: string
  number: number
  head: string
  base: string
  headOid: string | null
  baseOid: string | null
  /** Absolute path of the worktree. */
  path: string
  branch: string
}

function keptRoot(checkout: string): string {
  return join(checkout, '.pr-update', 'failed')
}

function keptName(repo: string, number: number): string {
  return `${repo.replace('/', '-').replace(/[^A-Za-z0-9._-]/g, '_')}-${number}`
}

/** Where a PR's kept worktree goes under `checkout`. */
export function keptPath(checkout: string, repo: string, number: number): string {
  return join(keptRoot(checkout), keptName(repo, number))
}

function sidecar(checkout: string, repo: string, number: number): string {
  return `${keptPath(checkout, repo, number)}.json`
}

/** The kept worktree of one PR under `checkout`, or null. */
export function findKept(checkout: string, repo: string, number: number): KeptRecord | null {
  try {
    const record = JSON.parse(readFileSync(sidecar(checkout, repo, number), 'utf8')) as KeptRecord
    return existsSync(record.path) ? record : null
  } catch {
    return null
  }
}

/** Every kept worktree under `checkout`. */
export function listKept(checkout: string): KeptRecord[] {
  let names: string[]
  try {
    names = readdirSync(keptRoot(checkout)).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }
  const out: KeptRecord[] = []
  for (const name of names) {
    try {
      const record = JSON.parse(readFileSync(join(keptRoot(checkout), name), 'utf8')) as KeptRecord
      if (existsSync(record.path)) out.push(record)
    } catch {
      // A half-written record names nothing to discard.
    }
  }
  return out
}

/** Remove a kept worktree, its branch and its record. `git` is any worktree of the repository. */
export function discardKept(git: Git, checkout: string, record: KeptRecord): void {
  git.try.worktreeRemove(record.path, { force: true })
  rmSync(record.path, { recursive: true, force: true })
  git.try.worktreePrune()
  git.try.deleteBranch(record.branch, { force: true })
  rmSync(sidecar(checkout, record.repo, record.number), { force: true })
}

/** Whether a kept worktree was built from the head and base a target still has. */
export function keptIsCurrent(
  record: KeptRecord,
  t: { headOid: string | null; baseOid: string | null },
): boolean {
  return record.headOid === t.headOid && record.baseOid === t.baseOid
}

/**
 * Move `worktree` to its kept path and put a branch named for the PR on it. A kept worktree this
 * PR already has is discarded first. `git` is any worktree of the repository.
 *
 * @throws when git cannot move the worktree (one holding submodules, say). It is then unmoved.
 */
export function keepWorktree(
  git: Git,
  checkout: string,
  worktree: string,
  target: Omit<KeptRecord, 'path' | 'branch'>,
  verifyLog: string | undefined,
): KeptRecord {
  const old = findKept(checkout, target.repo, target.number)
  if (old !== null) discardKept(git, checkout, old)
  const path = keptPath(checkout, target.repo, target.number)
  const branch = `pr-update/failed-${keptName(target.repo, target.number)}`
  mkdirSync(keptRoot(checkout), { recursive: true })
  git.worktreeMove(worktree, path)
  const kept = git.at(path)
  kept.checkout('HEAD', { branch, resetBranch: true })
  if (verifyLog !== undefined) {
    atomicWrite(join(path, VERIFY_LOG), verifyLog)
    // The exclude file is shared by the repository's worktrees, and names only this file.
    const common = git.gitCommonDir()
    if (common !== null) {
      const exclude = join(common, 'info', 'exclude')
      mkdirSync(join(common, 'info'), { recursive: true })
      const has = existsSync(exclude) && readFileSync(exclude, 'utf8').includes(`/${VERIFY_LOG}`)
      if (!has) appendFileSync(exclude, `\n/${VERIFY_LOG}\n`)
    }
  }
  const record: KeptRecord = { ...target, path, branch }
  atomicWrite(sidecar(checkout, target.repo, target.number), `${JSON.stringify(record)}\n`)
  return record
}
