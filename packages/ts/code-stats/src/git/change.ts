import { runFailed } from '@osdlc/command-seam'

import { CodeStatsError, commandError, guardCommand } from '../error.ts'
import type { Change, ChangeSpec } from '../types.ts'
import type { Repo } from './repo.ts'

/**
 * Reads `123` or `#123` as a PR (a safe integer above 0, else a bad-input
 * error), `a...b` and `a..b` as revision pairs, and any other text as a ref
 * meaning `ref...HEAD`. Write `ref...HEAD` to name a ref that is all digits.
 */
export function parseChangeSpec(text: string): ChangeSpec {
  const trimmed = text.trim()
  if (/^#?\d+$/.test(trimmed)) {
    const number = Number(trimmed.replace('#', ''))
    if (!Number.isSafeInteger(number) || number <= 0) {
      throw new CodeStatsError(`not a PR number: '${text}'`, { kind: 'bad-input' })
    }
    return { kind: 'pr', number }
  }
  const three = trimmed.indexOf('...')
  if (three >= 0) {
    return pair('merge-base', trimmed.slice(0, three), trimmed.slice(three + 3), text)
  }
  const two = trimmed.indexOf('..')
  if (two >= 0) return pair('range', trimmed.slice(0, two), trimmed.slice(two + 2), text)
  if (trimmed === '') throw new CodeStatsError('an empty change', { kind: 'bad-input' })
  return { kind: 'merge-base', base: trimmed, head: 'HEAD' }
}

/** A change named by separate selectors, as command-line flags give them. */
export interface ChangeSelectors {
  pr?: number | null
  base?: string | null
  head?: string | null
  worktree?: boolean
}

/**
 * The change the selectors name: a PR; `base` alone for `<base>...HEAD`, with
 * `head` for exactly `<base>..<head>`; `worktree` for HEAD against the working
 * tree, or with `base` for the merge base of `base` and HEAD against it; none
 * of them for null, the branch against the remote's default. A PR with any other
 * selector, `head` without `base`, or `head` with `worktree` is bad input.
 */
export function changeSpecFrom(selectors: ChangeSelectors): ChangeSpec | null {
  const pr = selectors.pr ?? null
  const base = selectors.base ?? null
  const head = selectors.head ?? null
  const worktree = selectors.worktree === true
  const bad = (message: string) => new CodeStatsError(message, { kind: 'bad-input' })
  if (pr !== null && (base !== null || head !== null || worktree)) {
    throw bad('a PR and --base/--head/--worktree are mutually exclusive')
  }
  if (worktree && head !== null) throw bad('--head and --worktree are mutually exclusive')
  if (head !== null && base === null) throw bad('--head needs --base')
  if (pr !== null) return { kind: 'pr', number: pr }
  if (worktree) return base === null ? { kind: 'worktree' } : { kind: 'worktree', base }
  if (base === null) return null
  return head === null ? { kind: 'merge-base', base, head: 'HEAD' } : { kind: 'range', base, head }
}

/** `a..b`, or `a..` and `a...` meaning HEAD, as git reads them. */
function pair(kind: 'range' | 'merge-base', base: string, head: string, text: string): ChangeSpec {
  if (base === '' || head.includes('..')) {
    throw new CodeStatsError(`not a revision pair: '${text}'`, { kind: 'bad-input' })
  }
  return { kind, base, head: head === '' ? 'HEAD' : head }
}

/**
 * The branch `origin/HEAD` names, the remote's default branch; else
 * `origin/main`, for a fetch that never set `origin/HEAD`, as CI's does.
 */
function defaultBase(repo: Repo): string {
  return guardCommand('could not find the default branch', () => {
    const target = repo.git.symbolicRef('refs/remotes/origin/HEAD')
    const branch = target?.replace(/^refs\/remotes\//, '')
    for (const ref of [branch, 'origin/main']) {
      if (ref !== undefined && repo.git.resolveRef(ref) !== null) return ref
    }
    throw new CodeStatsError('no origin/HEAD or origin/main to compare with; name a base ref')
  })
}

/** The commit `rev` names, or a bad-input error naming the revision. */
export function resolveCommit(repo: Repo, rev: string): string {
  const sha = guardCommand(`could not resolve '${rev}'`, () =>
    repo.git.resolveRef(`${rev}^{commit}`),
  )
  if (sha === null) throw new CodeStatsError(`unknown revision '${rev}'`, { kind: 'bad-input' })
  return sha
}

function mergeBase(repo: Repo, a: string, b: string): string {
  const [shaA, shaB] = [resolveCommit(repo, a), resolveCommit(repo, b)]
  const sha = guardCommand('could not find a merge base', () => repo.git.mergeBase(shaA, shaB))
  if (sha === null) throw new CodeStatsError(`no merge base between ${a} and ${b}`)
  return sha
}

function parseOids(stdout: string): { base: string; head: string } | null {
  try {
    const { baseRefOid, headRefOid } = JSON.parse(stdout) as Record<string, unknown>
    if (typeof baseRefOid !== 'string' || typeof headRefOid !== 'string') return null
    if (baseRefOid === '' || headRefOid === '') return null
    return { base: baseRefOid, head: headRefOid }
  } catch {
    return null
  }
}

/**
 * A PR's commits, when its base and head commits and their merge-base are in
 * this checkout; otherwise (not fetched, or a shallow clone) a change with no
 * commits, measured from GitHub's diff alone. The oids are read with a raw
 * `gh pr view` for `baseRefOid,headRefOid`, which `@osdlc/typed-gh`'s
 * `PullRequest` also holds (see docs/planning/tasks/T-01).
 */
function resolvePr(repo: Repo, number: number): Change {
  const view = guardCommand(
    `could not read PR #${number}`,
    () =>
      parseOids(
        repo.gh.rawChecked(['pr', 'view', String(number), '--json', 'baseRefOid,headRefOid'])
          .stdout,
      ),
    'gh',
  )
  if (view === null) throw new CodeStatsError(`could not read PR #${number}`)
  const change = { kind: 'pr' as const, label: `PR #${number}`, pr: number }
  const local = repo.git.objectExists(view.head) && repo.git.objectExists(view.base)
  const base = local ? repo.git.soft.mergeBase(view.base, view.head) : null
  return base === null
    ? { ...change, base: null, head: null }
    : { ...change, base, head: view.head }
}

/** Resolves `spec`; with none, the current branch against {@link defaultBase}. */
export function resolveChange(repo: Repo, spec: ChangeSpec | null): Change {
  const s = spec ?? { kind: 'merge-base', base: defaultBase(repo), head: 'HEAD' }
  switch (s.kind) {
    case 'pr':
      return resolvePr(repo, s.number)
    case 'range':
      return {
        kind: 'range',
        label: `${s.base}..${s.head}`,
        pr: null,
        base: resolveCommit(repo, s.base),
        head: resolveCommit(repo, s.head),
      }
    case 'merge-base':
      return {
        kind: 'merge-base',
        label: `${s.base}...${s.head}`,
        pr: null,
        base: mergeBase(repo, s.base, s.head),
        head: resolveCommit(repo, s.head),
      }
    case 'worktree':
      return {
        kind: 'worktree',
        label: s.base === undefined ? 'HEAD...worktree' : `${s.base}...worktree`,
        pr: null,
        base: s.base === undefined ? resolveCommit(repo, 'HEAD') : mergeBase(repo, s.base, 'HEAD'),
        head: null,
      }
  }
}

/**
 * Pinned against the user's git config: renames found (`-M`, so
 * `diff.renames=copies` cannot make a new file a copy, which the parser does
 * not read), a submodule as one line (`--submodule=short`, so
 * `diff.submodule` cannot list its own files as ours), fixed prefixes
 * (`diff.noprefix`, `diff.mnemonicPrefix`), no colour, no external diff or
 * textconv. For any `git diff` that `parseDiff` reads, in this package or out.
 * typed-git's diff verbs pin similar settings; see docs/planning/tasks/T-01.
 */
export const DIFF_FLAGS: readonly string[] = [
  '-M',
  '--submodule=short',
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--src-prefix=a/',
  '--dst-prefix=b/',
]

/**
 * An untracked file as an added-file diff. `--no-index` exits 1 when the files
 * differ, which is the success here.
 */
function untrackedDiff(repo: Repo, path: string): string {
  const r = repo.git.raw(['diff', '--no-index', ...DIFF_FLAGS, '--', '/dev/null', path])
  if (runFailed(r, (run) => run.exitCode === 1 && run.stderr.trim() === '')) {
    throw commandError(`could not read the diff of untracked ${path}`, r)
  }
  return r.stdout
}

/**
 * The unified diff of a change: `git diff -U0` between its commits, plus
 * untracked files for the working tree, or GitHub's diff for a PR whose
 * commits are not here.
 */
export function readDiff(repo: Repo, change: Change): string {
  if (change.base === null) {
    const pr = change.pr
    if (pr === null) throw new CodeStatsError(`${change.label} has no commits to diff`)
    return guardCommand(`could not read the diff of PR #${pr}`, () => repo.gh.prDiff(pr), 'gh')
  }
  const argv = ['diff', '-U0', ...DIFF_FLAGS, change.base]
  if (change.head !== null) argv.push(change.head)
  return guardCommand('could not read the diff', () => {
    let text = repo.git.rawChecked(argv).stdout
    if (change.kind === 'worktree') {
      // A nested repository is listed as `dir/` and has no diff of its own.
      for (const path of repo.git.lsFiles({ others: true, excludeStandard: true })) {
        if (!path.endsWith('/')) text += untrackedDiff(repo, path)
      }
    }
    return text
  })
}
