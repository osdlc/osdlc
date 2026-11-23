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

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { isCommandFailed } from '@osdlc/command-seam'
import { atomicWrite } from '@osdlc/etag-write'
import type { Git } from '@osdlc/typed-git'

import { PRUNE_ALL, type WorktreeRecords } from './registrations.ts'

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
  /**
   * How a tree removed from `dir` leaves git's records. Defaults to {@link PRUNE_ALL}, the
   * project root's way; a place outside the checkout passes `ownedUnder` (see `./registrations.ts`).
   */
  records?: WorktreeRecords | undefined
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

/**
 * The record in the file `name` of `place`, when it is one this place could have written: its
 * `number` an integer, its file named for its repository and number, and its `path` the kept
 * path those give. A record is JSON on disk, and its `path` is what a discard deletes, so one
 * naming any other folder is ignored.
 */
function readRecord(place: KeptPlace, name: string): KeptRecord | null {
  let record: KeptRecord
  try {
    record = JSON.parse(readFileSync(join(place.dir, name), 'utf8')) as KeptRecord
  } catch {
    return null
  }
  if (typeof record !== 'object' || record === null) return null
  const { repo, number, path } = record
  if (typeof repo !== 'string' || !Number.isInteger(number) || typeof path !== 'string') return null
  if (name !== `${keptName(place, repo, number)}.json`) return null
  return path === keptPath(place, repo, number) && existsSync(path) ? record : null
}

/** The kept worktree of one PR in `place`, or null when it has no valid record or its worktree is gone. */
export function findKept(place: KeptPlace, repo: string, number: number): KeptRecord | null {
  const record = readRecord(place, `${keptName(place, repo, number)}.json`)
  return record !== null && record.repo === repo && record.number === number ? record : null
}

/** Every kept worktree in `place` with a valid record. */
export function listKept(place: KeptPlace): KeptRecord[] {
  let names: string[]
  try {
    names = readdirSync(place.dir).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }
  return names.flatMap((name) => readRecord(place, name) ?? [])
}

/**
 * The git directory `record` names as its owner when that directory is gone, else null. Its tree
 * can no longer be read through git, so nothing can tell whether a person changed it.
 */
export function keptOwnerGone(record: KeptRecord): string | null {
  return record.gitDir !== undefined && !existsSync(record.gitDir) ? record.gitDir : null
}

/** Why a PR whose kept tree's owner is gone is left alone. */
export function keptOwnerGoneReason(record: KeptRecord, gitDir: string): string {
  return `kept worktree ${record.path}: its git directory ${gitDir} is gone; pass --discard-kept to remove the kept tree`
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
  if (owner === null) rmSync(record.path, { recursive: true, force: true })
  else {
    dropTree(owner, record.path, place.records ?? PRUNE_ALL)
    owner.try.deleteBranch(record.branch, { force: true })
  }
  rmSync(sidecar(place, record.repo, record.number), { force: true })
}

/**
 * Whether anyone has changed or committed to a kept worktree since it was kept. A tree git
 * cannot read counts as changed, so it is never removed for being stale.
 */
export function keptIsTouched(git: Git, record: KeptRecord): boolean {
  try {
    const tree = git.at(record.path)
    if (tree.statusPorcelain().length > 0) return true
    return record.builtOid != null && tree.revParse('HEAD') !== record.builtOid
  } catch {
    return true
  }
}

/** Whether a kept worktree was built from the head and base a target still has. */
export function keptIsCurrent(
  record: KeptRecord,
  t: { headOid: string | null; baseOid: string | null },
): boolean {
  return record.headOid !== null && record.headOid === t.headOid && record.baseOid === t.baseOid
}

/** Renames a path, as `fs.renameSync` does. A test passes one that fails. */
export type Rename = (from: string, to: string) => void

/**
 * Whether `from` and `to`, two existing directories, are on different filesystems, where
 * `git worktree move` cannot go: git's `rename()` has no copy fallback. Found by renaming an empty
 * probe folder from one into the other and reading the error's code. Any other failure is not
 * taken as an answer, so the move is still tried.
 */
function crossesDevice(from: string, to: string, rename: Rename): boolean {
  const probe = mkdtempSync(join(from, '.pr-update-probe-'))
  const moved = join(to, basename(probe))
  try {
    rename(probe, moved)
    return false
  } catch (e) {
    return (e as NodeJS.ErrnoException | null)?.code === 'EXDEV'
  } finally {
    rmSync(probe, { recursive: true, force: true })
    rmSync(moved, { recursive: true, force: true })
  }
}

/**
 * Whether `e`, thrown by `git worktree move` under `LC_ALL=C`, ends a line with the C library's
 * text for EXDEV (`Invalid cross-device link` on Linux, `Cross-device link` on macOS). Only a
 * fallback for when the probe could not tell: the text is matched at the end of git's line, after
 * the quoted paths, so a path that holds the words does not match.
 */
function saysCrossDevice(e: unknown): boolean {
  const failure = (e as { failure?: { detail?: unknown; cause?: unknown } } | null)?.failure
  const cause = failure?.cause
  const text = [
    e instanceof Error ? e.message : String(e),
    typeof failure?.detail === 'string' ? failure.detail : '',
    isCommandFailed(cause) ? cause.result.stderr : '',
  ].join('\n')
  return /: (invalid )?cross-device link\s*$/im.test(text)
}

/** git's messages in English, so {@link saysCrossDevice} can read them. */
const C_LOCALE = { env: { LC_ALL: 'C' } }

type KeptTarget = Pick<KeptRecord, 'repo' | 'number' | 'head' | 'base' | 'headOid' | 'baseOid'>

/**
 * Move `worktree` to its kept path in `place` and put a branch named for the PR on it. A kept
 * worktree this PR already has is discarded first. `git` is any worktree of the repository.
 *
 * When the two paths are on different filesystems, where `git worktree move` cannot go, the kept
 * tree is made with `git worktree add` at `worktree`'s HEAD instead, and `worktree` is removed
 * once the keep has fully succeeded. The kept tree has the same commit and verify log; uncommitted
 * changes and untracked files in `worktree`, such as build output, are not carried over.
 *
 * `opts.rename` stands in for `fs.renameSync` in the check for different filesystems.
 *
 * @throws when git cannot move the worktree (one holding submodules, say), when the kept tree this
 * PR already has holds a person's changes, when a folder with no record is in the kept path's
 * place, or when the branch, log or record cannot be written. The worktree is then back at
 * `worktree`; a kept tree `worktree add` made is removed with its branch.
 */
export function keepWorktree(
  git: Git,
  place: KeptPlace,
  worktree: string,
  target: KeptTarget,
  verifyLog: string | undefined,
  opts: { rename?: Rename | undefined } = {},
): KeptRecord {
  const records = place.records ?? PRUNE_ALL
  const old = findKept(place, target.repo, target.number)
  if (old !== null) {
    const gone = keptOwnerGone(old)
    if (gone !== null) throw new Error(keptOwnerGoneReason(old, gone))
    if (keptIsTouched(git, old))
      throw new Error(
        `kept worktree ${old.path} has local changes; push them or pass --discard-kept`,
      )
    discardKept(git, place, old)
  }
  const path = keptPath(place, target.repo, target.number)
  if (existsSync(path)) {
    // A run stopped between making the tree and writing its record. It may hold a person's work,
    // so it is never moved into or removed.
    throw new Error(
      `${path} is in the way and has no record (a run stopped part-way); ` +
        `remove it with \`git worktree remove --force ${path}\` in its checkout, then run again`,
    )
  }
  const branch = `pr-update/failed-${qualifiedName(target.repo, target.number)}`
  mkdirSync(place.dir, { recursive: true })
  let moved = !crossesDevice(dirname(worktree), place.dir, opts.rename ?? renameSync)
  if (moved) {
    try {
      git.worktreeMove(worktree, path, C_LOCALE)
    } catch (e) {
      if (!saysCrossDevice(e)) throw e
      moved = false
    }
  }
  if (!moved) {
    const tip = git.at(worktree).revParse('HEAD')
    if (tip === null) throw new Error(`cannot read the commit of ${worktree} to keep it`)
    git.worktreeAdd(path, { detach: true, startPoint: tip })
  }
  let record: KeptRecord
  try {
    record = finishKeep(git, place, path, branch, target, verifyLog)
  } catch (e) {
    if (moved) moveBack(git, place, path, worktree, branch, target)
    else {
      // The run worktree was left as it was, so the added tree and its branch are all to undo.
      dropTree(git, path, records)
      git.try.deleteBranch(branch, { force: true })
    }
    throw e
  }
  if (!moved) dropTree(git, worktree, records)
  return record
}

/** Remove the worktree at `path`, its folder, and git's record of it. */
function dropTree(git: Git, path: string, records: WorktreeRecords): void {
  const removed = git.try.worktreeRemove(path, { force: true }).ok
  rmSync(path, { recursive: true, force: true })
  records.forget(git, path, removed)
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
      const text = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
      // Written once: a later keep finds the line and adds nothing.
      if (!text.split(/\r?\n/).includes(`/${VERIFY_LOG}`)) {
        appendFileSync(exclude, `${text === '' || text.endsWith('\n') ? '' : '\n'}/${VERIFY_LOG}\n`)
      }
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
