/**
 * A failed PR's worktree, kept as evidence of what went wrong (`--keep-failed`).
 *
 * A failed PR's run worktree stays where it is, under the repository's run worktrees
 * (`Ports.targetHome`'s `worktrees`; the standalone run's are `worktrees/<host>/<owner>/<name>/`
 * in pr-update's cache directory), and the run goes on in a new one. Nothing is moved, so a tree
 * holding submodules is kept like any other. The tree is put on a branch named for the PR,
 * `pr-update/failed-<owner>-<name>-<number>`, so `git worktree list` shows it, and
 * `pr-update kept push` can send its commit somewhere a person works. A `.json` record named for
 * the PR, in the repository's own `kept` directory (the standalone run's is
 * `kept/<host>/<owner>/<name>/<number>.json` in pr-update's state directory), maps the PR to the
 * tree and holds the head and base sha the run saw, so a later run can tell whether the PR has
 * moved since. The record is what tells a kept tree from a dead run's worktree: a run worktree a
 * valid record names is never removed as a dead run's. The verify log is written into the tree and
 * kept out of commits.
 *
 * The tree is in the cache, so a tool that empties caches removes it with the rest; it is
 * evidence, not work.
 *
 * The same repository can be served from different git directories on different runs (one
 * checkout, another, or a clone). So a record also stores the git directory that owns the tree
 * (`gitDir`), and removing the tree goes through that one.
 *
 * A record's `path`, `branch` and `gitDir` say what a discard deletes, so a record is never
 * trusted alone: one whose branch is not the kept branch of its PR, or whose path is not a folder
 * directly in the repository's run worktrees or is a symbolic link, is refused, and so is one
 * whose folder `git worktree list` in the git directory that owns it does not show, or shows on a
 * run's scratch branch ({@link KeptTreeCheck}). A refused record is left as it is, tree and file,
 * and reported ({@link KeptRefusal}). Every removal through a record goes through
 * {@link discardKept}, which checks the folders too.
 *
 * A kept tree is pr-update's, as everything it makes is: no one works inside it, so what is in
 * it never keeps it. It goes when its PR moves, with `--retry-failed`, or with `--discard-kept`.
 *
 * The tree is the state the update ended in. A verify failure leaves the built merge or rebase
 * result. A conflict is aborted, which leaves the PR's own head.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

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
import { rawRemovalProblem, runTreeLive } from '../run-trees.ts'
import { PRUNE_ALL, removeWorktree, type WorktreeRecords } from './registrations.ts'

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
  /** Absolute path of the worktree: a run worktree, kept where it is. */
  path: string
  branch: string
  /** HEAD of the tree when it was kept. */
  builtOid?: string | null
  /**
   * The git common directory that owns the tree, by its real path ({@link KeptPlace.gitDir}).
   * Unset when it could not be read when the tree was kept.
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

/** Where one repository's kept worktrees and their records live. */
export interface KeptPlace {
  /** The directory that holds the records, `<number>.json` each. */
  dir: string
  /** The directory that holds the repository's run worktrees, and so its kept trees. */
  trees: string
  /**
   * The git common directory serving this run, by its real path: records made here store it, and
   * a record another one owns is not this run's. Unset when it could not be read.
   */
  gitDir?: string | undefined
  /**
   * The folder pr-update or its host owns that holds `trees` (`TargetHome.worktreesRoot`):
   * {@link discardKept} removes a tree only when the folders from `root` down to it pass the
   * folder rule (`placeProblem` in `../folders.ts`). Unset means the folders are not checked.
   */
  root?: string | undefined
  /**
   * Whose files count as the person's, and the folder check, for that rule. Default
   * `ownedByMe`, and a fix of `chmod -R go-w <root>`. Pruning passes its own.
   */
  rootCheck?: { owned: OwnedCheck; folders: FolderCheckOptions } | undefined
  /**
   * How a tree removed from `trees` leaves git's records. Defaults to {@link PRUNE_ALL}, the
   * library default; every CLI run passes `ownedUnder` (see `./registrations.ts`), so the
   * person's other worktrees are not touched.
   */
  records?: WorktreeRecords | undefined
}

/** `<owner>-<name>-<number>`, safe as one path segment and in a branch name. */
function qualifiedName(repo: string, number: number): string {
  return `${repo.replace('/', '-').replace(/[^A-Za-z0-9._-]/g, '_')}-${number}`
}

/** The branch a kept tree of `repo#number` is on: `pr-update/failed-<owner>-<name>-<number>`. */
export function keptBranch(repo: string, number: number): string {
  return `pr-update/failed-${qualifiedName(repo, number)}`
}

/**
 * The branch `pr-update kept push` pushes a kept tree of `repo#number` as by default:
 * `kept/<owner>-<name>-<number>`. Not under `pr-update/`, which pr-update makes and deletes: a
 * pushed branch is the person's, and a later keep of the same PR in the checkout pushed to
 * would take it over.
 */
export function keptPushBranch(repo: string, number: number): string {
  return `kept/${qualifiedName(repo, number)}`
}

/** The file of a PR's record in `place`: `<number>.json`. */
function sidecar(place: KeptPlace, number: number): string {
  return join(place.dir, `${number}.json`)
}

/**
 * The record in the file `name` of `place`, when it is one this place could have written: its
 * `number` an integer, its file named for its number, its `path` an absolute folder directly in
 * `place.trees`, its `branch` the kept branch its repository and number give, and its `gitDir`,
 * when set, an absolute path. A record is JSON on disk, and its `path`,
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
  gone = false,
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
  if (name !== `${number}.json`) return null
  const refuse = (reason: string): null => {
    onRefused?.({ record: file, reason })
    return null
  }
  // Checked before anything reads `path`: a relative one would be read against the cwd.
  if (!isAbsolute(path) || !isInTrees(place, path)) {
    return refuse(`its path ${path} is not a folder in ${place.trees}`)
  }
  let st
  try {
    st = lstatOrNull(path)
  } catch (e) {
    tellUnreadable(path, e, onUnreadable)
    return null
  }
  if (st === null && !gone) return null
  // A link there could make another worktree of the owner's look like this one.
  if (st?.isSymbolicLink() === true) return refuse(`its path ${path} is a symbolic link`)
  if (branch !== keptBranch(repo, number)) {
    return refuse(`its branch ${String(branch)} is not ${keptBranch(repo, number)}`)
  }
  if (gitDir !== undefined && (typeof gitDir !== 'string' || !isAbsolute(gitDir))) {
    return refuse(`its git directory ${String(gitDir)} is not an absolute path`)
  }
  return record
}

/**
 * Whether `path` is a folder directly in `place.trees`: its parent is that folder, as written or
 * by real path, so a path whose spelling differs (a drive letter's case, a symlink) still counts.
 * A folder that cannot be resolved does not, and nor does a name that is `.`, `..` or empty.
 */
function isInTrees(place: KeptPlace, path: string): boolean {
  const name = basename(path)
  if (name === '' || name === '.' || name === '..' || resolve(path) !== path) return false
  if (dirname(path) === place.trees) return true
  try {
    return realpathSync.native(dirname(path)) === realpathSync.native(place.trees)
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
  const record = readRecord(place, `${number}.json`, onRefused, undefined)
  return record !== null && record.repo === repo && record.number === number ? record : null
}

/**
 * Every kept worktree in `place` with a valid record; each refused one is told to `onRefused`,
 * and the folder, when it cannot be listed, and each record that cannot be read to `onUnreadable`.
 * Names starting with `.` are skipped, as in every walk pr-update makes of its own folders: no
 * record is named so. A record whose tree is gone is left out, unless `gone` is set (a prune
 * drops such records with their clone's entries).
 */
export function listKept(
  place: KeptPlace,
  onRefused?: OnKeptRefused,
  onUnreadable?: OnKeptUnreadable,
  gone = false,
): KeptRecord[] {
  let names: string[]
  try {
    names = readdirSync(place.dir).filter((n) => !n.startsWith('.') && n.endsWith('.json'))
  } catch (e) {
    tellUnreadable(place.dir, e, onUnreadable)
    return []
  }
  return names.flatMap((name) => readRecord(place, name, onRefused, onUnreadable, gone) ?? [])
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
 * the repository serving `place`'s run. A record or place that names no git directory (one that
 * could not be read when it was made) is that repository's.
 */
function keptOwner(git: Git, place: KeptPlace, record: KeptRecord): Git | null {
  if (place.gitDir === undefined || record.gitDir === undefined) return git
  return isGone(record.gitDir) ? null : git.at(record.gitDir)
}

/**
 * What `git worktree list` in the owner of `record`'s tree says of it:
 * - `kept`: listed at its path, on any branch but a scratch one, or its owner is gone, so there is
 *   nothing to ask and its place alone was checked (`readRecord`);
 * - `forged`: not listed at its path, listed on a scratch branch (a run's worktree, which a
 *   record can name now that kept trees stay among them), or the list could not be read
 *   (`unlisted`). The record does not name a tree pr-update kept, or nothing says it does, and is
 *   refused.
 *
 * Asked before anything runs git in the tree itself, since a folder that is not a worktree can
 * hold a `.git` file that points anywhere. A path is matched as given or by its real path; a
 * kept path that is itself a symbolic link was refused by `readRecord`.
 */
export type KeptTreeCheck = { kind: 'kept' } | { kind: 'forged'; why: string; unlisted?: true }

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
  // A keep puts its tree on the PR's branch before it writes the record, so a record naming a
  // tree on a scratch branch (`WORK_BRANCH` in execute.ts) is not its own: that is a run's.
  if (entry.branch?.startsWith('pr-update/scratch-') === true) {
    return { kind: 'forged', why: `${record.path} is a run's worktree, on its scratch branch` }
  }
  // A live run's worktree, detached as between PRs, is that run's. (A tree a live run of another
  // process kept keeps that run's name, but is on the PR's branch.)
  if (entry.branch !== record.branch && runTreeLive(record.path)) {
    return {
      kind: 'forged',
      why: `${record.path} is the worktree of a run that is still going, not on ${record.branch}`,
    }
  }
  return { kind: 'kept' }
}

/**
 * Why `record`'s tree may not be removed for the folders it is in, or null. A place with a
 * `root` is checked from it ({@link KeptPlace.rootCheck}); one with none is not.
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
  return { record: sidecar(place, record.number), reason: why }
}

/**
 * Remove a kept worktree, its branch and its record. `git` is any worktree of the repository
 * serving the run. A record that names its owner is removed through that
 * git directory instead; when that directory is gone, only the tree's directory and the record
 * are removed. Every removal of a kept tree goes through here.
 *
 * @throws KeptRefusedError, removing nothing, when the owner does not list the tree as its
 *   worktree ({@link keptTreeCheck}), when a folder between the place's `root` and the tree
 *   fails the folder rule ({@link keptFolderProblem}), or, when the owner is gone, when the
 *   folder is a live run's worktree, names another git directory in its `.git`, or has a `.git`
 *   that cannot be read (`rawRemovalProblem` in `../run-trees.ts`). Also, leaving the record, when git will
 *   not remove the tree (a locked one, say).
 */
export function discardKept(git: Git, place: KeptPlace, record: KeptRecord): void {
  const owner = keptOwner(git, place, record)
  const tree = keptTreeCheck(git, place, record)
  if (tree.kind !== 'kept') throw new KeptRefusedError(keptRefusal(place, record, tree.why))
  const folder = keptFolderProblem(place, record)
  if (folder !== null) throw new KeptRefusedError(keptRefusal(place, record, folder))
  if (owner === null) {
    // Removed as a plain folder, so the record's path alone must not make it removable.
    let problem: string | null
    try {
      problem = rawRemovalProblem(record.path, record.gitDir!)?.why ?? null
    } catch (e) {
      problem = `its .git cannot be read (${(e as Error).message.split('\n')[0]})`
    }
    if (problem !== null) throw new KeptRefusedError(keptRefusal(place, record, problem))
    rmSync(record.path, { recursive: true, force: true })
  } else {
    dropTree(owner, record.path, place.records ?? PRUNE_ALL)
    owner.try.deleteBranch(record.branch, { force: true })
  }
  dropKeptRecord(place, record)
}

/** Remove `record`'s file, once its tree is gone. */
export function dropKeptRecord(place: KeptPlace, record: KeptRecord): void {
  rmSync(sidecar(place, record.number), { force: true })
}

/** Whether a kept worktree was built from the head and base a target still has. */
export function keptIsCurrent(
  record: KeptRecord,
  t: { headOid: string | null; baseOid: string | null },
): boolean {
  return record.headOid !== null && record.headOid === t.headOid && record.baseOid === t.baseOid
}

type KeptTarget = Pick<KeptRecord, 'repo' | 'number' | 'head' | 'base' | 'headOid' | 'baseOid'>

/**
 * Keep the run worktree `worktree` where it is: put a branch named for the PR on it, write the
 * verify log into it, and write its record in `place`. A kept worktree this PR already has is
 * discarded first. `git` is any worktree of the repository. The scratch branch `worktree` was on
 * is left for the caller, which makes the run a new worktree.
 *
 * @throws when the kept tree this PR already has cannot be discarded, or when the branch, log or
 * record cannot be written. The worktree is then as it was, detached at its commit, and no record
 * names it.
 */
export function keepWorktree(
  git: Git,
  place: KeptPlace,
  worktree: string,
  target: KeptTarget,
  verifyLog: string | undefined,
): KeptRecord {
  const old = findKept(place, target.repo, target.number)
  // Checks the record and the folders, so a replacement removes nothing it should not.
  if (old !== null) discardKept(git, place, old)
  const branch = keptBranch(target.repo, target.number)
  const tree = git.at(worktree)
  const tip = tree.revParse('HEAD')
  try {
    return finishKeep(git, place, worktree, branch, target, verifyLog)
  } catch (e) {
    // Back to the run worktree it was: no record, no kept branch.
    rmSync(sidecar(place, target.number), { force: true })
    if (tip !== null) tree.try.checkout(tip)
    git.try.deleteBranch(branch, { force: true })
    throw e
  }
}

/**
 * Remove the worktree at `path`, its folder, and git's record of it.
 *
 * @throws when git will not remove it (a locked one, say).
 */
function dropTree(git: Git, path: string, records: WorktreeRecords): void {
  const left = removeWorktree(git, path, records)
  if (left !== undefined) throw new Error(left)
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
  mkdirSync(place.dir, { recursive: true, mode: FOLDER_MODE })
  atomicWrite(sidecar(place, target.number), `${JSON.stringify(record)}\n`)
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
