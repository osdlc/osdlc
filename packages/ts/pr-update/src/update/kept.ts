/**
 * A failed PR's worktree, kept for a person to pick up (`--keep-failed`).
 *
 * The project root's trees live at `<checkout>/.pr-update/failed/<owner>-<name>-<number>/`. A
 * target other than the project root, under a host's `Ports.targetHome`, keeps them in its own
 * directory instead, as `<dir>/<number>/` (the standalone run's is
 * `kept/<host>/<owner>/<name>/` in pr-update's state directory). Either way the tree is on a
 * branch named for the PR, `pr-update/failed-<owner>-<name>-<number>`, so `git worktree list`
 * shows it and a person can finish the fix and push it. Beside it, a `.json` record of the same
 * name holds the head and base sha the run saw, so a later run can tell whether the PR has moved
 * since. The verify log is written into the tree and kept out of commits.
 *
 * The same repository can be served from different git directories on different runs (one
 * checkout, another, or a clone). So a record kept outside its checkout also stores the git
 * directory that owns the tree (`gitDir`), and removing the tree goes through that one.
 *
 * The tree is the state the update ended in. A verify failure leaves the built merge or rebase
 * result. A conflict is aborted, which leaves the PR's own head.
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { isCommandFailed } from '@osdlc/command-seam'
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
  /**
   * The git common directory that owns the tree, by its real path. Set for a tree kept outside
   * its checkout ({@link KeptPlace.gitDir}).
   */
  gitDir?: string
}

/** Where one repository's kept worktrees live. */
export interface KeptPlace {
  /** The directory that holds the trees, each with its `.json` record beside it. */
  dir: string
  /**
   * How a tree is named in {@link dir}: `<owner>-<name>-<number>` in a checkout's
   * `.pr-update/failed/`, or `<number>` in a directory that is one repository's own.
   */
  naming: 'checkout' | 'repository'
  /**
   * The git common directory serving this run, by its real path. Set for a place outside the
   * checkout: records made there store it, and a record another one owns is not this run's.
   */
  gitDir?: string | undefined
}

/** A checkout's own place: `<checkout>/.pr-update/failed/`. */
export function checkoutKept(checkout: string): KeptPlace {
  return { dir: join(checkout, '.pr-update', 'failed'), naming: 'checkout' }
}

/** `<owner>-<name>-<number>`, safe as one path segment and in a branch name. */
function qualifiedName(repo: string, number: number): string {
  return `${repo.replace('/', '-').replace(/[^A-Za-z0-9._-]/g, '_')}-${number}`
}

function keptName(place: KeptPlace, repo: string, number: number): string {
  return place.naming === 'checkout' ? qualifiedName(repo, number) : String(number)
}

/** Where a PR's kept worktree goes in `place`. */
export function keptPath(place: KeptPlace, repo: string, number: number): string {
  return join(place.dir, keptName(place, repo, number))
}

function sidecar(place: KeptPlace, repo: string, number: number): string {
  return `${keptPath(place, repo, number)}.json`
}

/** The kept worktree of one PR in `place`, or null when it has no record or its worktree is gone. */
export function findKept(place: KeptPlace, repo: string, number: number): KeptRecord | null {
  try {
    const record = JSON.parse(readFileSync(sidecar(place, repo, number), 'utf8')) as KeptRecord
    return existsSync(record.path) && record.repo === repo ? record : null
  } catch {
    return null
  }
}

/** Every kept worktree in `place`. */
export function listKept(place: KeptPlace): KeptRecord[] {
  let names: string[]
  try {
    names = readdirSync(place.dir).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }
  const out: KeptRecord[] = []
  for (const name of names) {
    try {
      const record = JSON.parse(readFileSync(join(place.dir, name), 'utf8')) as KeptRecord
      if (existsSync(record.path)) out.push(record)
    } catch {
      // An unreadable record names nothing to discard.
    }
  }
  return out
}

/**
 * The git directory that owns `record`'s tree, when it is not the one serving `place`'s run and
 * it still exists; null otherwise. A run leaves such a tree alone: it is another checkout's.
 */
export function keptOwnerElsewhere(place: KeptPlace, record: KeptRecord): string | null {
  const owner = record.gitDir
  if (owner === undefined || place.gitDir === undefined || owner === place.gitDir) return null
  return existsSync(owner) ? owner : null
}

/**
 * Remove a kept worktree, its branch and its record. `git` is any worktree of the repository
 * serving the run. A record that names its owner is removed through that git directory instead;
 * when that directory is gone, only the tree's directory and the record are removed.
 */
export function discardKept(git: Git, place: KeptPlace, record: KeptRecord): void {
  const owner =
    record.gitDir === undefined ? git : existsSync(record.gitDir) ? git.at(record.gitDir) : null
  owner?.try.worktreeRemove(record.path, { force: true })
  rmSync(record.path, { recursive: true, force: true })
  owner?.try.worktreePrune()
  owner?.try.deleteBranch(record.branch, { force: true })
  rmSync(sidecar(place, record.repo, record.number), { force: true })
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
 * Whether `e`, thrown by `git worktree move`, says the two paths are on different filesystems.
 * git's `rename()` there has no copy fallback, so it fails with EXDEV, which git prints as
 * `Invalid cross-device link` (Linux) or `Cross-device link` (macOS).
 */
function isCrossDevice(e: unknown): boolean {
  const failure = (e as { failure?: { detail?: unknown; cause?: unknown } } | null)?.failure
  const cause = failure?.cause
  const text = [
    e instanceof Error ? e.message : String(e),
    typeof failure?.detail === 'string' ? failure.detail : '',
    isCommandFailed(cause) ? cause.result.stderr : '',
  ].join('\n')
  return /cross-device link|EXDEV/i.test(text)
}

type KeptTarget = Pick<KeptRecord, 'repo' | 'number' | 'head' | 'base' | 'headOid' | 'baseOid'>

/**
 * Move `worktree` to its kept path in `place` and put a branch named for the PR on it. A kept
 * worktree this PR already has is discarded first. `git` is any worktree of the repository.
 *
 * When the two paths are on different filesystems, where `git worktree move` cannot go, the kept
 * tree is made with `git worktree add` at `worktree`'s HEAD instead, and `worktree` is removed
 * once the keep has fully succeeded. The kept tree has the same commit and verify log; untracked
 * files in `worktree`, such as build output, are not carried over.
 *
 * @throws when git cannot move the worktree (one holding submodules, say), when the kept tree this
 * PR already has holds a person's changes, or when the branch, log or record cannot be written.
 * The worktree is then back at `worktree`; a kept tree `worktree add` made is removed with its
 * branch.
 */
export function keepWorktree(
  git: Git,
  place: KeptPlace,
  worktree: string,
  target: KeptTarget,
  verifyLog: string | undefined,
): KeptRecord {
  const old = findKept(place, target.repo, target.number)
  if (old !== null) {
    if (keptIsTouched(git, old))
      throw new Error(
        `kept worktree ${old.path} has local changes; push them or pass --discard-kept`,
      )
    discardKept(git, place, old)
  }
  const path = keptPath(place, target.repo, target.number)
  const branch = `pr-update/failed-${qualifiedName(target.repo, target.number)}`
  mkdirSync(place.dir, { recursive: true })
  let moved = true
  try {
    git.worktreeMove(worktree, path)
  } catch (e) {
    if (!isCrossDevice(e)) throw e
    moved = false
    const tip = git.at(worktree).revParse('HEAD')
    if (tip === null) throw e
    git.worktreeAdd(path, { detach: true, startPoint: tip })
  }
  let record: KeptRecord
  try {
    record = finishKeep(git, place, path, branch, target, verifyLog)
  } catch (e) {
    if (moved) moveBack(git, place, path, worktree, branch, target)
    else {
      // The run worktree was left as it was, so the added tree and its branch are all to undo.
      git.try.worktreeRemove(path, { force: true })
      rmSync(path, { recursive: true, force: true })
      git.try.worktreePrune()
      git.try.deleteBranch(branch, { force: true })
    }
    throw e
  }
  if (!moved) {
    git.try.worktreeRemove(worktree, { force: true })
    rmSync(worktree, { recursive: true, force: true })
    git.try.worktreePrune()
  }
  return record
}

/** Put a moved tree back at `worktree`, so a half-kept tree with no record is not left behind. */
function moveBack(
  git: Git,
  place: KeptPlace,
  path: string,
  worktree: string,
  branch: string,
  target: KeptTarget,
): void {
  try {
    git.worktreeMove(path, worktree)
    const tip = git.at(worktree).revParse('HEAD')
    if (tip !== null) git.at(worktree).checkout(tip)
    git.try.deleteBranch(branch, { force: true })
  } catch {
    // It stays at the kept path; the record lets a later run find and discard it.
    atomicWrite(
      sidecar(place, target.repo, target.number),
      `${JSON.stringify(recordOf(git, place, path, branch, target))}\n`,
    )
  }
}

function finishKeep(
  git: Git,
  place: KeptPlace,
  path: string,
  branch: string,
  target: KeptTarget,
  verifyLog: string | undefined,
): KeptRecord {
  git.at(path).checkout('HEAD', { branch, resetBranch: true })
  if (verifyLog !== undefined) {
    atomicWrite(join(path, VERIFY_LOG), verifyLog)
    // The exclude file is shared by the repository's worktrees, and names only this file.
    const found = git.gitCommonDir()
    if (found !== null) {
      const common = resolve(path, found)
      const exclude = join(common, 'info', 'exclude')
      mkdirSync(join(common, 'info'), { recursive: true })
      const has = existsSync(exclude) && readFileSync(exclude, 'utf8').includes(`/${VERIFY_LOG}`)
      if (!has) appendFileSync(exclude, `\n/${VERIFY_LOG}\n`)
    }
  }
  const record = recordOf(git, place, path, branch, target)
  atomicWrite(sidecar(place, target.repo, target.number), `${JSON.stringify(record)}\n`)
  return record
}

function recordOf(
  git: Git,
  place: KeptPlace,
  path: string,
  branch: string,
  target: KeptTarget,
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
    ...(place.gitDir === undefined ? {} : { gitDir: place.gitDir }),
  }
}
