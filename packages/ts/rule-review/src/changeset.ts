/**
 * Reading the changeset out of git.
 *
 * Goes through `@osdlc/typed-git`'s typed client. The one hand-built argv is
 * {@link emptyTree}, which no typed verb covers.
 */
import { Git } from '@osdlc/typed-git'

/**
 * A repository to read: a typed-git client, or a directory inside the checkout.
 * A directory reads the checkout that holds it.
 */
export type Repo = Git | string

function asGit(repo: Repo): Git {
  return typeof repo === 'string' ? new Git(repo) : repo
}

import type { FileDiff } from './prompt.ts'

/**
 * What a run is judged against: the changed files and the base they were
 * computed from.
 *
 * @experimental Used by the check runner, whose API may still change.
 */
export interface Changeset {
  /** Repo-relative paths. */
  files: readonly string[]
  /**
   * The ref the files were computed against. A check script sees it as
   * `CHECK_BASE`; it is empty when the changeset is every tracked file.
   */
  base: string
}

/**
 * Resolve the default comparison base: the remote's own default branch.
 *
 * Reads `origin/HEAD`. When it is unset (a repository with no `origin`, or a
 * clone whose remote HEAD was never fetched) the answer is `master` if only a
 * `master` branch exists, locally or on `origin`, and `main` otherwise.
 */
export function defaultBase(repo: Repo): string {
  const git = asGit(repo)
  const head = git.symbolicRef('refs/remotes/origin/HEAD')
  if (head !== null) return head.replace(/^refs\/remotes\/origin\//, '')
  const has = (name: string): boolean =>
    git.objectExists(name) || git.objectExists(`origin/${name}`)
  return !has('main') && has('master') ? 'master' : 'main'
}

/**
 * Rev syntax that names a commit directly rather than a branch.
 *
 * `HEAD` is the one that bites: `origin/HEAD` exists in any cloned repo as the
 * symbolic ref to the default branch, so treating every base as a branch name
 * silently rewrites `--base HEAD` into `--base main` and compares the whole
 * branch when the caller asked for the working tree.
 */
const NAMES_A_COMMIT = /^HEAD$|[~^:@]|^[0-9a-f]{7,40}$/

/**
 * Resolve `base` to the ref actually worth diffing against.
 *
 * A commit-naming rev (`HEAD`, a sha, `main~2`) is used as written — there is
 * no remote copy of those to prefer.
 *
 * For a branch name, the two refs can disagree in three ways: local behind
 * remote (a stale checkout that never fetched), local ahead of or diverged
 * from remote (an unpushed or rewritten branch), or only one of the two
 * existing at all (a branch never pushed, or named but not fetched locally).
 * Only the "local behind" case should prefer the remote copy — a local `main`
 * that lags would make already-merged commits look like part of this change.
 * Local ahead or diverged means the caller's own branch IS the fork point they
 * mean, and resolving to the remote's stale tip would walk the merge base
 * back past every commit they made, and pull in every file changed on the
 * remote since: the bug this function exists to close. When only one ref
 * exists, that one is used; neither existing falls through to the name as
 * written.
 */
export function resolveBase(repo: Repo, base: string): string {
  const git = asGit(repo)
  if (NAMES_A_COMMIT.test(base)) return base
  const remote = `origin/${base}`
  const localExists = git.objectExists(base)
  const remoteExists = git.objectExists(remote)
  if (!localExists) return remoteExists ? remote : base
  if (!remoteExists) return base
  // Both exist: local an ancestor of (behind or equal to) remote keeps the
  // stale-branch protection; ahead or diverged uses the local ref.
  return git.isAncestor(base, remote) ? remote : base
}

/**
 * Resolve the comparison point: the merge base of `base` and `HEAD`.
 *
 * Diffing against the merge base rather than the branch tip means a stale base
 * branch does not make unrelated commits look like part of this change — the
 * `base...HEAD` guarantee — while still leaving a concrete rev the working
 * tree can be diffed against.
 *
 * Before the first commit HEAD is unborn and there is no merge base. A base
 * that resolves (a fetched remote branch) is diffed against directly. Any
 * other base, `HEAD` and the unborn current branch included, names nothing
 * yet, so every file is uncommitted work and the comparison point is the
 * empty tree. That keeps a pre-commit hook from blocking the first commit.
 */
function forkPoint(git: Git, base: string): string {
  if (!git.hasHistory()) {
    const ref = resolveBase(git, base)
    return git.objectExists(ref) ? ref : emptyTree(git)
  }
  const ref = resolveBase(git, base)
  return git.mergeBase(ref, 'HEAD') ?? ref
}

/** The empty tree's id in this repo's object format (sha1 or sha256). No verb covers it. */
function emptyTree(git: Git): string {
  return git.rawChecked(['hash-object', '-t', 'tree', '--stdin'], { input: '' }).stdout.trim()
}

/**
 * Files changed between the fork point and the working tree.
 *
 * Uncommitted work is included deliberately. Under a pre-push hook the working
 * tree matches HEAD and this is the branch diff either way; run on demand
 * mid-change it reports what you are actually about to be judged on, rather
 * than an empty changeset because nothing is committed yet.
 *
 * Deleted files are included unless `opts.existingOnly` is set, which keeps
 * only added, copied, modified and renamed files, as {@link stagedFiles} does.
 * A renamed file is listed under both paths; `existingOnly` keeps the new one.
 */
export function changedFiles(
  repo: Repo,
  base: string,
  opts: { existingOnly?: boolean } = {},
): string[] {
  const git = asGit(repo)
  // `noRenames` lists a rename as its deleted old path plus its added new
  // path, so the rules that governed the old path still see the removal.
  const tracked = git
    .diffNameStatus({ range: forkPoint(git, base), noRenames: true })
    .filter((e) => opts.existingOnly !== true || 'ACMR'.includes(e.status[0] ?? ''))
    .map((e) => e.path)
  // `git diff` never lists an untracked file, so a brand-new file would go
  // unjudged — exactly the case a rule about new code most wants to see.
  const untracked = git.lsFiles({ others: true, excludeStandard: true })
  return [...new Set([...tracked, ...untracked])].sort()
}

/** Files added, copied, modified or renamed in the index, sorted. */
export function stagedFiles(repo: Repo): string[] {
  const git = asGit(repo)
  return git.diffNameOnly({ cached: true, diffFilter: 'ACMR' }).sort()
}

/** Every file in the index, sorted, once each. */
export function trackedFiles(repo: Repo): string[] {
  const git = asGit(repo)
  // `ls-files` prints one line per index entry, and a conflicted path has up
  // to three (base, ours, theirs).
  return [...new Set(git.lsFiles({ cached: true }))].sort()
}

/**
 * Unified diff per file.
 *
 * Deleted files are included, with their deletion diff. A file with no diff
 * against the base is rendered whole, as added (an untracked file, or an
 * unchanged one). A path with no diff that does not exist is left out. Once
 * there is a commit, a `base` that does not resolve throws, as does a failed
 * `diffText`.
 * `git.try.diffAddedFile` turns every git failure (exit 2 included) into an
 * error result, so a file it cannot render is left out, whatever the cause.
 */
export function fileDiffs(repo: Repo, base: string, files: readonly string[]): FileDiff[] {
  const git = asGit(repo)
  const ref = forkPoint(git, base)
  const out: FileDiff[] = []
  for (const file of files) {
    // `:(literal)` so a path such as `pages/[id].vue` is not read as a glob.
    const tracked = git.diffText(ref, { paths: [`:(literal)${file}`] }).trim()
    if (tracked !== '') {
      out.push({ file, diff: tracked })
      continue
    }
    // Untracked files produce no diff above; render them as all-added so new
    // and modified files reach the judge in the same shape.
    const added = git.try.diffAddedFile(file)
    if (added.ok && added.value.trim() !== '') out.push({ file, diff: added.value.trim() })
  }
  return out
}
