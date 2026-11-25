/**
 * Archiving unlanded work to the remote before `run` deletes it.
 *
 * With the `archive` option, a run's first step per repository builds one
 * commit whose tree is the remote default branch's and whose parents are that
 * branch's tip plus the work about to be lost, and pushes it to
 * `refs/heads/archive/<repo>-local-<date>`. A row whose work the archive holds
 * carries `discard-archived` in place of `abandon-unmerged` and
 * `discard-changes`.
 *
 * A worktree's uncommitted files go in a snapshot commit built in a temporary
 * index (`GIT_INDEX_FILE`), so the worktree's own index and files are not
 * touched. Left out of a snapshot: ignored files, secret-shaped files, files
 * matching `exclude`, and files over `maxFileBytes`. Not held at all:
 * submodule commits, files and stashes.
 */

import { lstatSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import type { Git } from '@osdlc/typed-git'

import type { ArchiveRecord } from './receipt.ts'
import type { Risk, Row, RowId } from './types.ts'
import { globRegExp } from './util.ts'

/** What the `archive` option takes. */
export interface ArchiveOptions {
  /**
   * Globs of files left out of a snapshot, besides the secret-shaped ones. A
   * glob without a `/` matches a file or directory name anywhere; one with a `/` matches
   * the path from the worktree root. `*` stays inside a directory, `**` does not.
   */
  exclude?: readonly string[] | undefined
  /** Files larger than this many bytes are left out of a snapshot. Default {@link DEFAULT_MAX_FILE_BYTES}. */
  maxFileBytes?: number | undefined
}

/** A snapshot leaves out a file over 10 MiB. */
export const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024

/** A file left out of a snapshot, and why. */
export interface LeftOut {
  path: string
  reason: 'secret' | 'excluded' | 'too-large'
}

/** File names that look like secrets. */
const SECRET_NAME =
  /^(\.env.*|.*\.pem|.*\.key|.*\.p12|.*\.pfx|id_rsa.*|id_ed25519.*|\.npmrc|\.netrc|credentials(\..*)?)$/i

/** The reason `path` stays out of a snapshot, or null. `root` is where `path` is read for its size. */
export function leftOutReason(
  path: string,
  root: string,
  opts: ArchiveOptions,
): LeftOut['reason'] | null {
  const name = basename(path)
  if (SECRET_NAME.test(name)) return 'secret'
  const segments = path.split('/')
  for (const glob of opts.exclude ?? []) {
    const re = globRegExp(glob)
    // A glob without a `/` matches a file or directory name anywhere on the path.
    if (glob.includes('/') ? re.test(path) : segments.some((seg) => re.test(seg))) {
      return 'excluded'
    }
  }
  try {
    if (lstatSync(join(root, path)).size > (opts.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES)) {
      return 'too-large'
    }
  } catch {
    // A deleted file has no size; it is archived as a deletion.
  }
  return null
}

/**
 * The modified, staged and untracked files of the worktree `git` is at that a
 * snapshot would leave out.
 */
export function snapshotLeftOut(git: Git, opts: ArchiveOptions): LeftOut[] {
  const out: LeftOut[] = []
  for (const entry of git.statusEntries()) {
    const reason = leftOutReason(entry.path, git.cwd, opts)
    if (reason !== null) out.push({ path: entry.path, reason })
  }
  return out
}

/** What the archive holds of a row, and so which of its risks `discard-archived` replaces. */
export interface Coverage {
  covers: Risk[]
  leftOut: LeftOut[]
}

/**
 * Which of `row`'s risks an archive covers. A branch's or remote branch's
 * unlanded commits are. A worktree's unpushed commits and files are, except
 * submodule work, which the archive does not hold, a worktree whose directory
 * is gone, and, for its files, a snapshot that would leave one out.
 *
 * @param git The client for reading a worktree's files; unused for a branch.
 */
export function coverageOf(row: Row, opts: ArchiveOptions, git: (path: string) => Git): Coverage {
  const covers: Risk[] = []
  let leftOut: LeftOut[] = []
  if (row.kind !== 'worktree') {
    if (row.risks.includes('abandon-unmerged')) covers.push('abandon-unmerged')
    return { covers, leftOut }
  }
  const e = row.evidence
  if (e.onDisk === false) return { covers, leftOut }
  const submodules = e.submodules ?? []
  const submoduleWork = submodules.some((s) => s.unpushedCommits > 0 || s.stashes > 0)
  if (row.risks.includes('abandon-unmerged') && !submoduleWork) covers.push('abandon-unmerged')
  if (row.risks.includes('discard-changes')) {
    leftOut = snapshotLeftOut(git(row.name), opts)
    const submoduleDirty = submodules.some((s) => s.dirtyFiles > 0)
    if (leftOut.length === 0 && !submoduleDirty) covers.push('discard-changes')
  }
  return { covers, leftOut }
}

/** True when a row, or the candidate of one, could put something in an archive. */
export function mayContribute(row: Pick<Row, 'risks'>): boolean {
  return row.risks.includes('abandon-unmerged') || row.risks.includes('discard-changes')
}

/** One row's work in an archive. */
export interface ArchiveRowJob {
  id: RowId
  row: Row
  /** `discard-changes` was allowed for the row itself, so a snapshot may leave files out. */
  discardAllowed: boolean
}

interface Held {
  sha: string
  source: string
  rows: RowId[]
  leftOut: LeftOut[]
}

/** The tree of the worktree's files as a snapshot holds them, built in a temporary index. */
function snapshotTree(git: Git, leftOut: readonly LeftOut[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'repo-cleaner-archive-'))
  try {
    const env = { GIT_INDEX_FILE: join(dir, 'index') }
    git.readTree('HEAD', { env })
    // An excluded pathspec leaves the file as HEAD has it.
    git.add(['.', ...leftOut.map((f) => `:(exclude,literal)${f.path}`)], { all: true, env })
    return git.writeTree({ env })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * What a worktree held when it was archived: its HEAD and, with `files`, its
 * snapshot tree. The remove step compares it again, so work added after the
 * archive is not deleted on the strength of an archive that lacks it.
 */
export function worktreeStamp(git: Git, opts: ArchiveOptions, files: boolean): string {
  const head = git.resolveRef('HEAD')
  return stampOf(
    head,
    files && head !== null ? snapshotTree(git, snapshotLeftOut(git, opts)) : null,
  )
}

const stampOf = (head: string | null, tree: string | null): string => `${head ?? ''}:${tree ?? ''}`

/**
 * Commit the worktree `git` is at, uncommitted files included, without
 * touching its index or files. `sha` is null when nothing differs from HEAD;
 * `unheld` is true when something is dirty that a snapshot cannot hold, such
 * as a staged change the working file has since been reverted from; `stamp` is
 * the {@link worktreeStamp} of what was committed.
 */
function snapshot(
  git: Git,
  opts: ArchiveOptions,
): { sha: string | null; leftOut: LeftOut[]; unheld: boolean; stamp: string } {
  const head = git.resolveRef('HEAD')
  if (head === null) return { sha: null, leftOut: [], unheld: false, stamp: stampOf(null, null) }
  const leftOut = snapshotLeftOut(git, opts)
  const tree = snapshotTree(git, leftOut)
  const stamp = stampOf(head, tree)
  if (tree === git.resolveRef('HEAD^{tree}')) {
    return { sha: null, leftOut, unheld: git.statusEntries().length > leftOut.length, stamp }
  }
  const sha = git.commitTree(
    tree,
    { parents: [head], message: `snapshot of ${git.cwd}\n\nuncommitted files on top of ${head}` },
    { env: identityEnv(git) },
  )
  return { sha, leftOut, unheld: false, stamp }
}

/** `<repo>-local-<YYYY-MM-DD>`, the branch name after `archive/`. */
function branchBase(root: string, now: Date): string {
  const repo = basename(root).replace(/[^A-Za-z0-9._-]/g, '-') || 'repo'
  return `archive/${repo}-local-${now.toISOString().slice(0, 10)}`
}

/** An identity for `commit-tree` when git has none configured. */
function identityEnv(git: Git): Record<string, string> | undefined {
  if (git.configGet('user.name') !== null && git.configGet('user.email') !== null) return undefined
  return {
    GIT_AUTHOR_NAME: 'repo-cleaner',
    GIT_AUTHOR_EMAIL: 'repo-cleaner@localhost',
    GIT_COMMITTER_NAME: 'repo-cleaner',
    GIT_COMMITTER_EMAIL: 'repo-cleaner@localhost',
  }
}

/**
 * Build the archive of `jobs` and push it, then confirm the remote has it.
 * Returns the receipt record, null when there was nothing to hold, and the {@link worktreeStamp} of each worktree on disk.
 *
 * @param git The client at the repository's root.
 * @param defaultRef The remote default branch, `<remote>/<branch>`.
 * @throws when the default branch cannot be read, a snapshot would leave out a
 *   file nobody allowed to lose, the push is refused, or the remote does not
 *   list the archive afterwards. Nothing has been deleted.
 */
export function pushArchive(
  git: Git,
  remote: string,
  defaultRef: string,
  jobs: readonly ArchiveRowJob[],
  opts: ArchiveOptions,
  now: Date,
): { record: ArchiveRecord | null; stamps: Map<RowId, string> } {
  const defaultTip = git.resolveRef(defaultRef)
  const tree = git.resolveRef(`${defaultRef}^{tree}`)
  if (defaultTip === null || tree === null) throw new Error(`cannot read ${defaultRef}`)
  const held = new Map<string, Held>()
  const hold = (sha: string, source: string, row: RowId, leftOut: LeftOut[] = []): void => {
    if (sha === defaultTip) return
    const was = held.get(sha)
    if (was === undefined) held.set(sha, { sha, source, rows: [row], leftOut })
    else {
      was.rows.push(row)
      was.source += `, ${source}`
    }
  }
  const stamps = new Map<RowId, string>()
  for (const { row, discardAllowed } of jobs) {
    if (row.kind !== 'worktree') {
      if (row.risks.includes('abandon-unmerged')) hold(row.evidence.sha, row.id, row.id)
      continue
    }
    if (row.evidence.onDisk === false) continue
    const at = git.at(row.name)
    if (row.risks.includes('discard-changes')) {
      const snap = snapshot(at, opts)
      if ((snap.leftOut.length > 0 || snap.unheld) && !discardAllowed) {
        throw new Error(
          `refused: ${row.name} has changes the archive cannot hold (${snap.leftOut.map((f) => f.path).join(', ') || 'staged changes the files no longer show'}); allow discard-changes for it`,
        )
      }
      // The stamp of the very tree that was committed, so a file written since is a change.
      stamps.set(row.id, snap.stamp)
      if (snap.sha !== null) {
        hold(snap.sha, row.id, row.id, snap.leftOut)
        continue
      }
    } else stamps.set(row.id, worktreeStamp(at, opts, false))
    const head = row.risks.includes('abandon-unmerged') ? at.resolveRef('HEAD') : null
    if (head !== null) hold(head, row.id, row.id)
  }
  if (held.size === 0) return { record: null, stamps }
  const parents = [...held.values()]
  const lines = [
    `repo-cleaner archive of local work, ${now.toISOString()}`,
    '',
    `parent 1: ${defaultTip} ${defaultRef}`,
    ...parents.flatMap((p, i) => [
      `parent ${i + 2}: ${p.sha} ${p.source}`,
      ...p.leftOut.map((f) => `  left out (${f.reason}): ${f.path}`),
    ]),
    '',
    'Not archived: ignored files, submodule commits and files, stashes.',
  ]
  const sha = git.commitTree(
    tree,
    { parents: [defaultTip, ...parents.map((p) => p.sha)], message: lines.join('\n') },
    { env: identityEnv(git) },
  )
  const base = branchBase(git.cwd, now)
  let ref = `refs/heads/${base}`
  for (let n = 2; git.lsRemote(remote, ref).some((r) => r.ref === ref); n++) {
    ref = `refs/heads/${base}-${n}`
  }
  const report = git.push(remote, `${sha}:${ref}`)
  const refused = report.refs.find((r) => r.flag === '!')
  if (refused !== undefined) {
    throw new Error(`push of the archive to ${remote} refused: ${refused.summary}`)
  }
  if (git.lsRemote(remote, ref).find((r) => r.ref === ref)?.sha !== sha) {
    throw new Error(`${remote} does not list ${ref} at ${sha} after the push`)
  }
  const record: ArchiveRecord = {
    remote,
    ref,
    sha,
    parents: parents.map((p, i) => ({
      parent: i + 2,
      sha: p.sha,
      source: p.source,
      rows: p.rows,
      leftOut: p.leftOut,
    })),
  }
  return { record, stamps }
}
