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
import { join, resolve } from 'node:path'

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
  /** HEAD of the tree when it was kept; a later HEAD means someone committed to it. */
  builtOid?: string | null
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

/** The kept worktree of one PR under `checkout`, or null when it has no record or its worktree is gone. */
export function findKept(checkout: string, repo: string, number: number): KeptRecord | null {
  try {
    const record = JSON.parse(readFileSync(sidecar(checkout, repo, number), 'utf8')) as KeptRecord
    return existsSync(record.path) && record.repo === repo ? record : null
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
      // An unreadable record names nothing to discard.
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

/** Whether anyone has changed or committed to a kept worktree since it was kept. */
export function keptIsTouched(git: Git, record: KeptRecord): boolean {
  try {
    const tree = git.at(record.path)
    if (tree.statusPorcelain().length > 0) return true
    return record.builtOid != null && tree.revParse('HEAD') !== record.builtOid
  } catch {
    return false
  }
}

/** Whether a kept worktree was built from the head and base a target still has. */
export function keptIsCurrent(
  record: KeptRecord,
  t: { headOid: string | null; baseOid: string | null },
): boolean {
  return record.headOid !== null && record.headOid === t.headOid && record.baseOid === t.baseOid
}

/**
 * Move `worktree` to its kept path and put a branch named for the PR on it. A kept worktree this
 * PR already has is discarded first. `git` is any worktree of the repository.
 *
 * @throws when git cannot move the worktree (one holding submodules, say), when the kept tree this
 * PR already has holds a person's changes, or when the branch, log or record cannot be written. The
 * worktree is then back at `worktree`.
 */
export function keepWorktree(
  git: Git,
  checkout: string,
  worktree: string,
  target: Pick<KeptRecord, 'repo' | 'number' | 'head' | 'base' | 'headOid' | 'baseOid'>,
  verifyLog: string | undefined,
): KeptRecord {
  const old = findKept(checkout, target.repo, target.number)
  if (old !== null) {
    if (keptIsTouched(git, old))
      throw new Error(
        `kept worktree ${old.path} has local changes; push them or pass --discard-kept`,
      )
    discardKept(git, checkout, old)
  }
  const path = keptPath(checkout, target.repo, target.number)
  const branch = `pr-update/failed-${keptName(target.repo, target.number)}`
  mkdirSync(keptRoot(checkout), { recursive: true })
  git.worktreeMove(worktree, path)
  try {
    return finishKeep(git, checkout, path, branch, target, verifyLog)
  } catch (e) {
    // Put it back, so a half-kept tree with no record is not left behind.
    try {
      git.worktreeMove(path, worktree)
      const tip = git.at(worktree).revParse('HEAD')
      if (tip !== null) git.at(worktree).checkout(tip)
      git.try.deleteBranch(branch, { force: true })
    } catch {
      // It stays at the kept path; the record lets a later run find and discard it.
      atomicWrite(
        sidecar(checkout, target.repo, target.number),
        `${JSON.stringify(recordOf(git, path, branch, target))}\n`,
      )
    }
    throw e
  }
}

function finishKeep(
  git: Git,
  checkout: string,
  path: string,
  branch: string,
  target: Pick<KeptRecord, 'repo' | 'number' | 'head' | 'base' | 'headOid' | 'baseOid'>,
  verifyLog: string | undefined,
): KeptRecord {
  git.at(path).checkout('HEAD', { branch, resetBranch: true })
  if (verifyLog !== undefined) {
    atomicWrite(join(path, VERIFY_LOG), verifyLog)
    // The exclude file is shared by the repository's worktrees, and names only this file.
    const found = git.gitCommonDir()
    if (found !== null) {
      const common = resolve(checkout, found)
      const exclude = join(common, 'info', 'exclude')
      mkdirSync(join(common, 'info'), { recursive: true })
      const has = existsSync(exclude) && readFileSync(exclude, 'utf8').includes(`/${VERIFY_LOG}`)
      if (!has) appendFileSync(exclude, `\n/${VERIFY_LOG}\n`)
    }
  }
  const record = recordOf(git, path, branch, target)
  atomicWrite(sidecar(checkout, target.repo, target.number), `${JSON.stringify(record)}\n`)
  return record
}

function recordOf(
  git: Git,
  path: string,
  branch: string,
  target: Pick<KeptRecord, 'repo' | 'number' | 'head' | 'base' | 'headOid' | 'baseOid'>,
): KeptRecord {
  const { repo, number, head, base, headOid, baseOid } = target
  return {
    repo,
    number,
    head,
    base,
    headOid,
    baseOid,
    path,
    branch,
    builtOid: git.at(path).revParse('HEAD'),
  }
}
