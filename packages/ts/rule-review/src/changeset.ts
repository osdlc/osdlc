/**
 * Reading the changeset out of git.
 *
 * Goes through `@osdlc/typed-git`'s typed client. The one hand-built argv is
 * {@link emptyTree}, which no typed verb covers.
 */
import { Git } from '@osdlc/typed-git'

import type { FileDiff } from './prompt.ts'

/**
 * A repository to read: a typed-git client, or a directory inside the checkout.
 * A directory reads the whole checkout that holds it, whichever subdirectory
 * it names, and paths come back relative to the checkout's top level.
 */
export type Repo = Git | string

/**
 * Why a changeset could not be read: the directory is not inside a git
 * checkout (`not-a-repository`), or the base does not resolve (`bad-base`).
 * `kind` may gain values in a minor release; treat an unknown one as a failure.
 */
export class ChangesetError extends Error {
  override readonly name = 'ChangesetError'
  constructor(
    readonly kind: 'not-a-repository' | 'bad-base',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

/**
 * A client on the checkout's top level. Some git commands answer relative to
 * the working directory, so a client opened on a subdirectory would list only
 * part of the change, with paths in two spellings.
 *
 * @throws {ChangesetError} `not-a-repository` when `repo` is a directory outside git.
 * @throws {FailureError} From `@osdlc/typed-git`, with `failure.kind` `not-installed` or
 *   `not-executable`, when git itself cannot be run.
 */
export function asGit(repo: Repo): Git {
  if (typeof repo !== 'string') return repo
  let top: string | null
  try {
    top = new Git(repo).topLevel()
  } catch (err) {
    // git that is not installed is not a missing repository: let its classified failure through.
    if (isMissingProgram(err)) throw err
    // A missing directory fails the spawn itself rather than reading as "not a repo".
    throw new ChangesetError('not-a-repository', `${repo}: ${errorText(err)}`, { cause: err })
  }
  if (top === null) {
    throw new ChangesetError('not-a-repository', `${repo} is not inside a git repository`)
  }
  return new Git(top)
}

/** Whether `err` is typed-git's classified "git is not installed / cannot run" failure. */
function isMissingProgram(err: unknown): boolean {
  const kind = (err as { failure?: { kind?: unknown } } | null)?.failure?.kind
  return kind === 'not-installed' || kind === 'not-executable'
}

/** An error's message, or the value as text. */
export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

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
   * `CHECK_BASE`: the fork point the files were measured from, or empty when
   * the changeset is every tracked file.
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
 * Rev syntax that no branch name can hold (`git check-ref-format` refuses
 * `~`, `^`, `:` and `@{`), plus `HEAD`. `origin/HEAD` exists in any clone as
 * the symbolic ref to the default branch, so reading `HEAD` as a branch would
 * turn `--base HEAD` (the working tree) into the whole branch.
 */
const NOT_A_BRANCH = /^HEAD$|[~^:]|@\{/

/**
 * Resolve `base` to the ref actually worth diffing against.
 *
 * A commit-naming rev (`HEAD`, a sha, `main~2`) is used as written — there is
 * no remote copy of those to prefer.
 *
 * For a branch name, `origin/<name>` is used when the local branch is behind
 * it or equal to it, so a stale local `main` does not make merged commits look
 * like part of this change. A local branch ahead of or diverged from its
 * remote is the caller's own fork point and is used as written. When only one
 * of the two exists, that one is used; when neither does, the name as
 * written.
 */
export function resolveBase(repo: Repo, base: string): string {
  const git = asGit(repo)
  if (NOT_A_BRANCH.test(base)) return base
  // Asked by full ref name, so a sha, or a branch named like one, is told
  // apart by what exists rather than by how the name looks.
  const remote = `origin/${base}`
  const localExists = git.objectExists(`refs/heads/${base}`)
  const remoteExists = git.objectExists(`refs/remotes/${remote}`)
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
  return forkPointOf(git, resolveBase(git, base))
}

/** {@link forkPoint} for a base {@link resolveBase} has already resolved. */
export function forkPointOf(git: Git, resolved: string): string {
  if (!git.hasHistory()) return git.objectExists(resolved) ? resolved : emptyTree(git)
  // The fork point of HEAD and itself is HEAD; no need to ask git.
  if (resolved === 'HEAD') return resolved
  return git.mergeBase(resolved, 'HEAD') ?? resolved
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
  return filesSince(git, forkPoint(git, base), opts)
}

/** {@link changedFiles} against a fork point already found. */
export function filesSince(git: Git, ref: string, opts: { existingOnly?: boolean } = {}): string[] {
  // `noRenames` lists a rename as its deleted old path plus its added new
  // path, so the rules that governed the old path still see the removal.
  const tracked = git
    .diffNameStatus({ range: ref, noRenames: true })
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
  return diffsSince(git, forkPoint(git, base), files)
}

/** {@link fileDiffs} against a fork point already found. */
export function diffsSince(git: Git, ref: string, files: readonly string[]): FileDiff[] {
  const out: FileDiff[] = []
  for (const file of files) {
    // `:(literal)` so a path such as `pages/[id].vue` is not read as a glob.
    const tracked = git.diffText(ref, { paths: [`:(literal)${file}`] }).trim()
    if (tracked !== '') {
      out.push({ file, diff: tracked })
      continue
    }
    // Untracked files, and tracked files with no change, produce no diff
    // above. An untracked file is rendered as all-added, so new and modified
    // files reach the judge in the same shape.
    const added = git.try.diffAddedFile(file)
    if (added.ok && added.value.trim() !== '') out.push({ file, diff: added.value.trim() })
  }
  return out
}
