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
 * A checkout's `.pr-update/failed/` is inside its working tree, so the repository's own content
 * can put a record there. A record is therefore never trusted to say what to delete: one whose
 * branch is not the kept branch of its PR, whose path is not its kept path or is a symbolic link,
 * or that names a git directory from a checkout's own place is refused, and so is one whose
 * folder `git worktree list` in the git directory serving its place does not show. A
 * tree it shows on another branch, or detached, is a person's ({@link KeptTreeCheck}), and is
 * never removed. A refused record is left as it is, tree and file, and reported
 * ({@link KeptRefusal}). Every removal goes through {@link discardKept}, which checks the
 * folders too.
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
  realpathSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

import { isCommandFailed } from '@osdlc/command-seam'
import { atomicWrite } from '@osdlc/etag-write'
import type { Git } from '@osdlc/typed-git'

import {
  FOLDER_MODE,
  isGone,
  lstatOrNull,
  ownedByMe,
  placeProblem,
  type FolderCheckOptions,
  type OwnedCheck,
} from '../folders.ts'
import { realOr } from '../real-path.ts'
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

/** A kept record a run will not act on: the record's file, and why. Nothing of it is removed. */
export interface KeptRefusal {
  record: string
  reason: string
}

/** Told of each kept record that is refused. */
export type OnKeptRefused = (refusal: KeptRefusal) => void

/**
 * Told of a path that could not be read while looking for kept records (the place's folder, a
 * record file, or the tree one names), with the error. One that is not there is not told.
 */
export type OnKeptUnreadable = (path: string, err: unknown) => void

/** Tells `onUnreadable` of `path`, unless `err` says nothing is there. */
function tellUnreadable(
  path: string,
  err: unknown,
  onUnreadable: OnKeptUnreadable | undefined,
): void {
  const code = (err as NodeJS.ErrnoException).code
  if (code !== 'ENOENT' && code !== 'ENOTDIR') onUnreadable?.(path, err)
}

/** A kept tree that {@link discardKept} would not remove. */
export class KeptRefusedError extends Error {
  override name = 'KeptRefusedError'
  // A field, not a parameter property, so Node can run this file by stripping its types.
  readonly refusal: KeptRefusal
  constructor(refusal: KeptRefusal) {
    super(`kept record ${refusal.record} left alone: ${refusal.reason}`)
    this.refusal = refusal
  }
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
   * The folder pr-update or its host owns that holds `dir` (`TargetHome.keptRoot`). Set for a
   * place outside the checkout: {@link discardKept} removes a tree there only when the folders
   * from `root` down to it pass the folder rule (`placeProblem` in `../folders.ts`).
   */
  root?: string | undefined
  /**
   * Whose files count as the person's, and the folder check, for that rule. Default
   * `ownedByMe`, and a fix of `chmod -R go-w <root>`. Pruning passes its own.
   */
  rootCheck?: { owned: OwnedCheck; folders: FolderCheckOptions } | undefined
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

/** The branch a kept tree of `repo#number` is on: `pr-update/failed-<owner>-<name>-<number>`. */
export function keptBranch(repo: string, number: number): string {
  return `pr-update/failed-${qualifiedName(repo, number)}`
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
 * `number` an integer, its file named for its repository and number, its `path` the absolute
 * kept path those give, and its `branch` the kept branch they give. A record in a checkout's own
 * place names no `gitDir`: pr-update writes one only outside a checkout, and an owner named
 * there would come from the repository's content. A record is JSON on disk, and its `path`,
 * `branch` and `gitDir` say what a discard deletes, so a record that breaks any of these rules
 * is refused: `onRefused` is told, and the caller leaves it alone. One that is not a record at
 * all, or whose tree is gone, is ignored, and so is one that cannot be read, or whose tree
 * cannot, after `onUnreadable` is told.
 */
function readRecord(
  place: KeptPlace,
  name: string,
  onRefused: OnKeptRefused | undefined,
  onUnreadable: OnKeptUnreadable | undefined,
): KeptRecord | null {
  const file = join(place.dir, name)
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (e) {
    tellUnreadable(file, e, onUnreadable)
    return null
  }
  let record: KeptRecord
  try {
    record = JSON.parse(text) as KeptRecord
  } catch {
    return null
  }
  if (typeof record !== 'object' || record === null) return null
  const { repo, number, path, branch, gitDir } = record
  if (typeof repo !== 'string' || !Number.isInteger(number) || typeof path !== 'string') return null
  if (name !== `${keptName(place, repo, number)}.json`) return null
  const refuse = (reason: string): null => {
    onRefused?.({ record: file, reason })
    return null
  }
  // Checked before anything reads `path`: a relative one would be read against the cwd.
  if (!isAbsolute(path) || !isKeptPath(place, path, repo, number)) {
    return refuse(`its path ${path} is not the kept path ${keptPath(place, repo, number)}`)
  }
  let st
  try {
    st = lstatOrNull(path)
  } catch (e) {
    tellUnreadable(path, e, onUnreadable)
    return null
  }
  if (st === null) return null
  // A link there could make another worktree of the owner's look like this one.
  if (st.isSymbolicLink()) return refuse(`its path ${path} is a symbolic link`)
  if (branch !== keptBranch(repo, number)) {
    return refuse(`its branch ${String(branch)} is not ${keptBranch(repo, number)}`)
  }
  if (gitDir !== undefined && place.gitDir === undefined) {
    return refuse(
      `it names the git directory ${String(gitDir)}, which a checkout's own record never does`,
    )
  }
  if (gitDir !== undefined && (typeof gitDir !== 'string' || !isAbsolute(gitDir))) {
    return refuse(`its git directory ${String(gitDir)} is not an absolute path`)
  }
  return record
}

/**
 * Whether `path` is the kept path of `repo#number` in `place`: the same string, or the right
 * name in a folder that resolves to `place.dir`, so a path whose spelling differs (a drive
 * letter's case, a symlink) still counts. A folder that cannot be resolved does not.
 */
function isKeptPath(place: KeptPlace, path: string, repo: string, number: number): boolean {
  if (path === keptPath(place, repo, number)) return true
  if (basename(path) !== keptName(place, repo, number)) return false
  try {
    return realpathSync.native(dirname(path)) === realpathSync.native(place.dir)
  } catch {
    return false
  }
}

/**
 * The kept worktree of one PR in `place`, or null when it has no valid record or its worktree is
 * gone. A record that is refused (see `readRecord`) is told to `onRefused`, and reads as none.
 */
export function findKept(
  place: KeptPlace,
  repo: string,
  number: number,
  onRefused?: OnKeptRefused,
): KeptRecord | null {
  const record = readRecord(place, `${keptName(place, repo, number)}.json`, onRefused, undefined)
  return record !== null && record.repo === repo && record.number === number ? record : null
}

/**
 * Every kept worktree in `place` with a valid record; each refused one is told to `onRefused`,
 * and the folder, when it cannot be listed, and each record that cannot be read to `onUnreadable`.
 * Names starting with `.` are skipped, as in every walk pr-update makes of its own folders: a
 * run's probe (`.pr-update-probe-*`) is one, and a hard kill can leave it behind.
 */
export function listKept(
  place: KeptPlace,
  onRefused?: OnKeptRefused,
  onUnreadable?: OnKeptUnreadable,
): KeptRecord[] {
  let names: string[]
  try {
    names = readdirSync(place.dir).filter((n) => !n.startsWith('.') && n.endsWith('.json'))
  } catch (e) {
    tellUnreadable(place.dir, e, onUnreadable)
    return []
  }
  return names.flatMap((name) => readRecord(place, name, onRefused, onUnreadable) ?? [])
}

/**
 * The git directory `record` names as its owner when that directory is gone, else null. Its tree
 * can no longer be read through git, so nothing can tell whether a person changed it. One that
 * cannot be read is not gone.
 */
export function keptOwnerGone(record: KeptRecord): string | null {
  return record.gitDir !== undefined && isGone(record.gitDir) ? record.gitDir : null
}

/** Why a PR whose kept tree's owner is gone is left alone. */
export function keptOwnerGoneReason(record: KeptRecord, gitDir: string): string {
  return `kept worktree ${record.path}: its git directory ${gitDir} is gone; pass --discard-kept to remove the kept tree`
}

/**
 * The git directory that owns `record`'s tree, when it is not the one serving `place`'s run and
 * is not gone; null otherwise. A run leaves such a tree alone: it is another checkout's.
 * The two are compared by real path, so a record an older run wrote under another spelling of
 * the same directory (a Windows short name, another letter case on macOS) is still this run's.
 */
export function keptOwnerElsewhere(place: KeptPlace, record: KeptRecord): string | null {
  const owner = record.gitDir
  if (owner === undefined || place.gitDir === undefined) return null
  if (owner === place.gitDir || realOr(owner) === realOr(place.gitDir)) return null
  return isGone(owner) ? null : owner
}

/**
 * The git directory that owns `record`'s tree, or null when it is gone. One that cannot be read is
 * not gone, and git then says it cannot list its worktrees. `git` is any worktree of
 * the repository serving `place`'s run. A checkout's own place has no `gitDir`, so its trees are
 * that checkout's, whatever a record says. A place outside the checkout (`KeptPlace.gitDir`) is
 * written only by pr-update, and its records name their owner.
 */
function keptOwner(git: Git, place: KeptPlace, record: KeptRecord): Git | null {
  if (place.gitDir === undefined || record.gitDir === undefined) return git
  return isGone(record.gitDir) ? null : git.at(record.gitDir)
}

/**
 * What `git worktree list` in the owner of `record`'s tree says of it:
 * - `kept`: listed at its path on its kept branch, or its owner is gone, so there is nothing to
 *   ask and its place alone was checked (`readRecord`);
 * - `moved`: listed at its path, but on another branch or a detached HEAD. A person did that: the
 *   tree is theirs now, counts as changed, and is never removed;
 * - `forged`: not listed at its path, or the list could not be read (`unlisted`). The record does
 *   not name a tree pr-update kept, or nothing says it does, and is refused.
 *
 * Asked before anything runs git in the tree itself, since a folder that is not a worktree can
 * hold a `.git` file that points anywhere. A path is matched as given or by its real path; a
 * kept path that is itself a symbolic link was refused by `readRecord`.
 */
export type KeptTreeCheck =
  | { kind: 'kept' }
  | { kind: 'moved'; branch: string | null; why: string }
  | { kind: 'forged'; why: string; unlisted?: true }

/** See {@link KeptTreeCheck}. */
export function keptTreeCheck(git: Git, place: KeptPlace, record: KeptRecord): KeptTreeCheck {
  const owner = keptOwner(git, place, record)
  if (owner === null) return { kind: 'kept' }
  const listed = owner.try.worktrees()
  if (!listed.ok) {
    return { kind: 'forged', why: `its owner's worktrees could not be listed`, unlisted: true }
  }
  const path = realOr(record.path)
  const entry = listed.value.find((w) => w.path === record.path || realOr(w.path) === path)
  if (entry === undefined) {
    return { kind: 'forged', why: `${record.path} is not a worktree of its checkout` }
  }
  if (entry.branch !== record.branch) {
    const branch = entry.branch ?? null
    return {
      kind: 'moved',
      branch,
      why: `${record.path} is on ${branch ?? 'a detached HEAD'}, not ${record.branch}`,
    }
  }
  return { kind: 'kept' }
}

/**
 * Why `record`'s tree may not be removed for the folders it is in, or null. A place with a
 * `root` (outside the checkout) is checked from it ({@link KeptPlace.rootCheck}); a checkout's
 * own place is the person's checkout, and is not.
 */
export function keptFolderProblem(place: KeptPlace, record: KeptRecord): string | null {
  const root = place.root
  if (root === undefined) return null
  const check = place.rootCheck ?? {
    owned: ownedByMe,
    folders: { fix: () => `run \`chmod -R go-w ${root}\`` },
  }
  return placeProblem(root, record.path, check.owned, check.folders)
}

/** The refusal of `record` in `place`, for `why`. */
export function keptRefusal(place: KeptPlace, record: KeptRecord, why: string): KeptRefusal {
  return { record: sidecar(place, record.repo, record.number), reason: why }
}

/**
 * Remove a kept worktree, its branch and its record. `git` is any worktree of the repository
 * serving the run. A record outside its checkout that names its owner is removed through that
 * git directory instead; when that directory is gone, only the tree's directory and the record
 * are removed. Every removal of a kept tree goes through here.
 *
 * @throws KeptRefusedError, removing nothing, when the owner does not list the tree as its
 *   worktree on the record's branch ({@link keptTreeCheck}), or when a folder between the
 *   place's `root` and the tree fails the folder rule ({@link keptFolderProblem}).
 */
export function discardKept(git: Git, place: KeptPlace, record: KeptRecord): void {
  const owner = keptOwner(git, place, record)
  const tree = keptTreeCheck(git, place, record)
  if (tree.kind !== 'kept') throw new KeptRefusedError(keptRefusal(place, record, tree.why))
  const folder = keptFolderProblem(place, record)
  if (folder !== null) throw new KeptRefusedError(keptRefusal(place, record, folder))
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
 *
 * The probe is named `.pr-update-probe-*` and removed at once, but a hard kill can leave it in
 * either folder. Its name starts with `.` so pr-update's own walks of these folders skip it.
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
    const tree = keptTreeCheck(git, place, old)
    if (tree.kind === 'forged') throw new KeptRefusedError(keptRefusal(place, old, tree.why))
    // A tree a person moved to a branch of their own is theirs, changed or not.
    if (tree.kind === 'moved' || keptIsTouched(git, old))
      throw new Error(
        `kept worktree ${old.path} has local changes; push them or pass --discard-kept`,
      )
    // Checks the folders too, so a replacement removes nothing from a folder others can write to.
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
  const branch = keptBranch(target.repo, target.number)
  mkdirSync(place.dir, { recursive: true, mode: FOLDER_MODE })
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
  // `noTrack`: no `branch.<kept>.remote` or `.merge` in the checkout's config, even under
  // `branch.autoSetupMerge=always`.
  git.at(path).checkout('HEAD', { branch, resetBranch: true, noTrack: true })
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
