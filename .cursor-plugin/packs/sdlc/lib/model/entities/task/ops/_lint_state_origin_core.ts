/**
 * Core of the task-state-on-main convention lint. The op that owns it
 * (`lint-state-origin.ts`) imports `lint` / `LintError` from here.
 *
 * Per
 * [[T-SIHV-task-state-frontmatter-commits-on-main-not-worktree-branch]],
 * changes to a task file's *task-state* frontmatter fields
 * (`state:`, `readiness_verified_at:`, `last_reviewed:`,
 * `definition_gap:`, `completion_note:`, `prs:`) must commit on
 * `main` — never on a `task/<basename>` branch. The worktree branch
 * carries implementation diff only (code, tests, docs, post-mortem
 * prose).
 *
 * This linter walks every commit reachable from local `task/*`
 * branches, but NOT reachable from `main` / `origin/main`, and
 * flags any commit whose ONLY diff is a task-state frontmatter
 * mutation — state-tracking work that has bled onto the implementation branch.
 *
 * The check is deterministic and read-only.
 */

import { parse as parseYaml } from '@lib/util/yaml'
import { splitFrontmatter as utilSplitFrontmatter } from '@lib/util/frontmatter'
import { sourceAtRev } from '@lib/model/read'
import { Git } from '@sksizer/easy-git'
import { mapFailed, type CommandRunner } from '@lib/util/command'
import { repr } from '@lib/util/diagnostics'

// The exact set of frontmatter fields that count as "task-state".
const TASK_STATE_FIELDS: ReadonlySet<string> = new Set([
  'state',
  'readiness_verified_at',
  'last_reviewed',
  'definition_gap',
  'completion_note',
  'prs',
])

// The prefix every implementation branch carries.
const TASK_BRANCH_PREFIX = 'task/'

export class LintError extends Error {}

/**
 * Run a git read, re-raising a failure as a {@link LintError} so the op's
 * handler renders it as a lint failure rather than a bare command error.
 *
 * The typed verbs throw on any exit git does not declare absent for them, so
 * "git broke" can no longer degrade into "no task branches" / "no commits" and
 * hand the pre-commit gate a green exit 0. This wrapper only chooses the error
 * type; the loudness comes from the client's contract.
 */
function lintRead<T>(label: string, read: () => T): T {
  return mapFailed(
    read,
    (exc) => new LintError(`${label} failed (exit ${exc.result.exitCode}): ${exc.detail}`),
  )
}

/**
 * Resolve the set of trunk refs to exclude task-branch commits against.
 *
 * The trunk is addressable as local `main` and remote `origin/main`. Under
 * parallel WIP these diverge: task-state commits land on local `main`
 * ([[T-SIHV-task-state-frontmatter-commits-on-main-not-worktree-branch]])
 * but `origin/main` lags until they're pushed. A commit reachable from
 * EITHER ref is on the trunk, not exclusive to the task branch — so the lint
 * must exclude both. Excluding only the single candidate `origin/main` misread
 * a not-yet-pushed state commit on local `main` as a branch violation whenever
 * origin lagged, blocking commits repo-wide under parallel sessions
 * ([[T-6R73-pre-commit-drift-hooks-gate-unconditionally-forcing-no]]).
 *
 * Returns every ref among {candidate, `origin/main`, `main`} that resolves,
 * de-duplicated and order-preserving. Throws LintError if none resolve.
 */
function resolveBaseRefs(g: Git, candidate: string): string[] {
  const wanted = [candidate, 'origin/main', 'main']
  const resolved: string[] = []
  const seen = new Set<string>()
  for (const ref of wanted) {
    if (seen.has(ref)) {
      continue
    }
    seen.add(ref)
    const sha = lintRead(`git rev-parse --verify ${ref}`, () => g.resolveRef(ref))
    if (sha !== null) {
      resolved.push(ref)
    }
  }
  if (resolved.length === 0) {
    throw new LintError(
      `none of the base-ref candidates ${repr(wanted)} resolve in ${g.cwd}; ` +
        `is the repo bootstrapped?`,
    )
  }
  return resolved
}

// The integration branch a task branch builds against counts as trunk for that
// branch. An integration branch such as `sdlc-1.0` collects reviewed task PRs
// and the state commits that ready them; a task branch cut from it inherits
// those commits, which are not exclusive to the task branch. The branch is the
// `orchestrator.target_branch` in the task branch's own `sdlc.yaml`, so only a
// branch the project names counts: a wip push to some other remote branch
// still leaves a state-only commit flagged. Returns `origin/<target>` (else the
// local `<target>`) when it resolves, otherwise nothing.
function integrationBase(g: Git, runner: CommandRunner, branch: string): string[] {
  const raw = fileAtRev(runner, g.cwd, branch, 'sdlc.yaml')
  if (raw === null) {
    return []
  }
  let target: unknown
  try {
    target = (parseYaml(raw) as { orchestrator?: { target_branch?: unknown } } | null)?.orchestrator
      ?.target_branch
  } catch {
    return []
  }
  if (typeof target !== 'string' || target.length === 0) {
    return []
  }
  for (const ref of [`origin/${target}`, target]) {
    if (lintRead(`git rev-parse --verify ${ref}`, () => g.resolveRef(ref)) !== null) {
      return [ref]
    }
  }
  return []
}

function listTaskBranches(g: Git): string[] {
  const refs = lintRead('git for-each-ref refs/heads', () =>
    g.forEachRef('refs/heads', { format: '%(refname:short)' }),
  )
  return refs.map((line) => line.trim()).filter((line) => line.startsWith(TASK_BRANCH_PREFIX))
}

function commitsOnBranch(g: Git, branch: string, bases: string[]): string[] {
  // `git log <branch> --not <base...>` yields commits reachable from the
  // branch but from NONE of the trunk refs. Excluding every trunk ref (local
  // `main` AND `origin/main`) is what stops a not-yet-pushed state commit on
  // local main from reading as branch-exclusive when origin lags ([[T-6R73]]).
  return lintRead(`git log ${branch} --not ${bases.join(' ')}`, () =>
    g.logLines({ rev: branch, notRefs: bases, format: '%H', noMerges: true }),
  )
}

// No `root: true`: a root commit has no `<sha>~1` to read a "before" from, so
// `isStateOnlyCommit` bails on it either way. `diff-tree` without `--root`
// reports it as no changes, which lands in the same place.
function changedFiles(g: Git, sha: string): string[] {
  return lintRead(`git diff-tree ${sha}`, () => g.diffTree(sha)).map((e) => e.path)
}

// Rev reads go through the read layer's shared fetch seam ([[T-N9PM]]), which
// takes the injected runner and drives the typed client's `showAtRev` over it.
function fileAtRev(runner: CommandRunner, repo: string, sha: string, path: string): string | null {
  return sourceAtRev(runner, repo, sha, path)
}

type Frontmatter = Record<string, unknown>

function splitFrontmatter(text: string): [Frontmatter, string] {
  const [fmRaw, body] = utilSplitFrontmatter(text)
  if (fmRaw === null) {
    return [{}, text]
  }
  let fm: unknown
  try {
    fm = parseYaml(fmRaw) ?? {}
  } catch {
    fm = {}
  }
  if (fm === null || typeof fm !== 'object' || Array.isArray(fm)) {
    fm = {}
  }
  return [fm as Frontmatter, body]
}

function isTaskFile(path: string): boolean {
  const prefix = 'docs/planning/tasks/'
  return path.startsWith(prefix) && path.endsWith('.md') && !path.slice(prefix.length).includes('/')
}

/**
 * Deep structural equality mirroring Python's `!=` on YAML-loaded values
 * (dicts, lists, scalars). Used to decide whether a frontmatter key's
 * value actually changed between two revisions.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true
  }
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false
    }
    return a.every((x, i) => deepEqual(x, b[i]))
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return false
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a as object)
    const bk = Object.keys(b as object)
    if (ak.length !== bk.length) {
      return false
    }
    return ak.every(
      (k) =>
        Object.prototype.hasOwnProperty.call(b, k) &&
        deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    )
  }
  return false
}

function isStateOnlyCommit(g: Git, runner: CommandRunner, sha: string): [boolean, string | null] {
  const files = changedFiles(g, sha)
  if (files.length !== 1) {
    return [false, null]
  }
  const path = files[0] as string
  if (!isTaskFile(path)) {
    return [false, null]
  }

  const beforeText = fileAtRev(runner, g.cwd, `${sha}~1`, path)
  const afterText = fileAtRev(runner, g.cwd, sha, path)
  if (beforeText === null || afterText === null) {
    return [false, null]
  }

  const [beforeFm, beforeBody] = splitFrontmatter(beforeText)
  const [afterFm, afterBody] = splitFrontmatter(afterText)

  if (beforeBody !== afterBody) {
    return [false, null]
  }

  const changedKeys = new Set<string>()
  const allKeys = new Set<string>([...Object.keys(beforeFm), ...Object.keys(afterFm)])
  for (const key of allKeys) {
    if (!deepEqual(beforeFm[key], afterFm[key])) {
      changedKeys.add(key)
    }
  }
  if (changedKeys.size === 0) {
    return [false, null]
  }

  const nonState = [...changedKeys].filter((k) => !TASK_STATE_FIELDS.has(k))
  if (nonState.length > 0) {
    return [false, null]
  }

  const violatingFields = [...changedKeys].filter((k) => TASK_STATE_FIELDS.has(k)).sort()
  return [true, violatingFields.join(', ')]
}

export function lint(
  runner: CommandRunner,
  repo: string,
  baseRef: string,
): [number, string[], string[]] {
  const g = new Git(repo, { runner })
  const bases = resolveBaseRefs(g, baseRef)
  const branches = listTaskBranches(g)
  const okBranches: string[] = []
  const violationLines: string[] = []
  let totalViolations = 0

  for (const branch of [...branches].sort()) {
    const commits = commitsOnBranch(g, branch, [...bases, ...integrationBase(g, runner, branch)])
    const branchViolations: string[] = []
    for (const sha of commits) {
      const [isViolation, reason] = isStateOnlyCommit(g, runner, sha)
      if (isViolation) {
        // `logSubject` returns null where the previous `show --no-patch
        // --format=%s` produced a trimmed (possibly empty) string.
        const subj = g.logSubject(sha) ?? ''
        branchViolations.push(
          `  ${sha.slice(0, 12)} ${branch}: state-only fields=[${reason}] -- ${subj}`,
        )
      }
    }
    if (branchViolations.length > 0) {
      violationLines.push(...branchViolations)
      totalViolations += branchViolations.length
    } else {
      okBranches.push(branch)
    }
  }

  return [totalViolations, okBranches, violationLines]
}
