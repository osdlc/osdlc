/**
 * Worktrees: gather them, then decide what each one is.
 *
 * A worktree is a directory with work in it, so it is judged more cautiously
 * than a branch. Anything uncommitted or unpushed stops the verdict cold —
 * losing an hour of someone's work costs more than any amount of clutter.
 */

import { existsSync, statSync } from 'node:fs'
import { isAbsolute, join, sep } from 'node:path'

import { shellJoin } from '@osdlc/command-seam'
import { nodeGuard } from '@osdlc/path-guard/node'
import type { Git } from '@osdlc/typed-git'

import { gapSentence, mergedFact, recordPr } from './branches.ts'
import {
  confirmationNote,
  judgeLanding,
  landingConfirmed,
  recordLanding,
  unmatchedSentence,
  type Landing,
} from './landing.ts'
import { busyHolders, isIdleHolder, parseLockOwner, type ProcessProbe } from './processes.ts'
import {
  authorizationsFor,
  landedRef,
  makeItem,
  type PRInfo,
  type RepoInfo,
  type SweepItem,
} from './types.ts'

/** The command line, not run, that removes the worktree at `path`. */
export function worktreeRemoveCommand(
  root: string,
  path: string,
  opts: { force?: boolean } = {},
): string {
  return shellJoin([
    'git',
    '-C',
    root,
    'worktree',
    'remove',
    ...(opts.force === true ? ['--force'] : []),
    path,
  ])
}

/** The command line, not run, that unlocks the worktree at `path`. */
export function worktreeUnlockCommand(root: string, path: string): string {
  return shellJoin(['git', '-C', root, 'worktree', 'unlock', path])
}

/** The command line, not run, that drops registrations of worktrees whose directories are gone. */
export function worktreePruneCommand(root: string): string {
  return shellJoin(['git', '-C', root, 'worktree', 'prune'])
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** A condition that rules out removing a worktree, whatever its branch says. */
export type WorktreeBlocker =
  | 'locked-worktree'
  | 'live-process'
  | 'process-probe-failed'
  | 'hidden-index-flags'
  | 'nested-repository'
  | 'branch-in-other-worktree'

/** True for a worktree row held back by `facts.blockers`. */
export function hasBlockers(item: Pick<SweepItem, 'facts'>): boolean {
  const blockers = item.facts['blockers']
  return Array.isArray(blockers) && blockers.length > 0
}

/** Cap on `facts.hidden_index_paths`; `facts.hidden_index_flags` is the full count. */
const HIDDEN_PATHS_SHOWN = 10

/**
 * The blockers on one worktree, each with the sentence telling a person what
 * to do about it. Writes the evidence for each into `facts`.
 */
function readBlockers(opts: {
  path: string
  branch: string
  onDisk: boolean
  locked: boolean
  lockReason: string | null
  otherWorktrees: string[]
  facts: Record<string, unknown>
  git: Git
  probe: ProcessProbe
}): [WorktreeBlocker, string][] {
  const { path, branch, onDisk, locked, lockReason, otherWorktrees, facts, git, probe } = opts
  const out: [WorktreeBlocker, string][] = []

  if (locked) {
    facts['lock_reason'] = lockReason
    // A lock whose owner is dead holds nothing. A lock that names no owner, or
    // one that cannot be ruled out, stays a blocker.
    const owner = parseLockOwner(lockReason)
    if (owner !== null && !probe.alive(owner.pid, owner.startedAt)) {
      facts['stale_lock'] = true
      facts['lock_owner'] = { pid: owner.pid, started_at: owner.startedAt ?? null }
    } else {
      out.push([
        'locked-worktree',
        `Locked${lockReason ? ` (${lockReason})` : ''}; run \`git worktree unlock ${path}\` once it is no longer needed.`,
      ])
    }
  }

  if (onDisk) {
    // A process working in the directory blocks removal, lock or not. Shells
    // with nothing running under them only sit there, so they are listed and
    // let the removal through.
    try {
      const live = probe.holders(path).sort((a, b) => a.pid - b.pid)
      const shells = live.filter(isIdleHolder)
      const busy = busyHolders(live)
      if (shells.length > 0) facts['idle_shells'] = shells
      if (busy.length > 0) {
        facts['live_processes'] = busy
        out.push([
          'live-process',
          `Running in the worktree: ${busy.map((h) => `${h.command} (pid ${h.pid})`).join(', ')}; stop them or wait for them to finish.`,
        ])
      }
    } catch (err) {
      // No process table to read (a host without `lsof`, a timeout): nobody
      // can say the directory is idle, so the worktree is held back.
      const message = err instanceof Error ? err.message : String(err)
      facts['process_probe_error'] = message
      out.push([
        'process-probe-failed',
        `Could not tell whether a process is running in the worktree (${message}); check by hand, or fix the probe and sweep again.`,
      ])
    }

    const at = git.at(path)
    // Status hides edits to these files, so "clean" cannot be trusted.
    const hidden = at
      .lsFilesTagged()
      .filter((row) => row.tag === 'S' || row.tag !== row.tag.toUpperCase())
      .map((row) => row.path)
    if (hidden.length > 0) {
      facts['hidden_index_flags'] = hidden.length
      facts['hidden_index_paths'] = hidden.slice(0, HIDDEN_PATHS_SHOWN)
      out.push([
        'hidden-index-flags',
        `${hidden.length} file(s) are marked skip-worktree or assume-unchanged, so status may hide edits; clear the flags with \`git update-index --no-skip-worktree --no-assume-unchanged <path>\` and check again.`,
      ])
    }

    // No `excludeStandard`: an ignored directory can hold a repository too.
    // Only the top of each listed directory is checked.
    const nested = at
      .lsFiles({ others: true, directory: true })
      .filter((entry) => entry.endsWith('/') && existsSync(join(path, entry, '.git')))
    if (nested.length > 0) {
      facts['nested_repositories'] = nested
      out.push([
        'nested-repository',
        `Nested repositories (${nested.join(', ')}) have their own history; move them out before removing the worktree.`,
      ])
    }
  }

  if (otherWorktrees.length > 0) {
    facts['other_worktrees'] = otherWorktrees
    out.push([
      'branch-in-other-worktree',
      `Branch \`${branch}\` is also checked out at ${otherWorktrees.join(', ')}; deleting the branch along with this worktree would pull it from under the other.`,
    ])
  }
  return out
}

/**
 * Every worktree of `repo`, and the set of branches they hold.
 *
 * The branch set is returned because a local branch checked out in a worktree
 * must not be judged on its own: the worktree is what a person would act on.
 */
export function gatherWorktrees(
  repo: RepoInfo,
  prs: Map<string, PRInfo>,
  cwd: string,
  git: Git,
  only: string | undefined,
  probe: ProcessProbe,
  tick?: (done: number, total: number) => void,
): [SweepItem[], Set<string>] {
  const all = git.at(repo.root).worktrees()
  const pathsByBranch = new Map<string, string[]>()
  for (const entry of all) {
    if (entry.branch) {
      pathsByBranch.set(entry.branch, [...(pathsByBranch.get(entry.branch) ?? []), entry.path])
    }
  }
  const entries = only === undefined ? all : all.filter((entry) => entry.branch === only)

  const items: SweepItem[] = []
  for (const [i, entry] of entries.entries()) {
    tick?.(i, entries.length)
    const branch = entry.branch ?? ''
    items.push(
      classifyWorktree({
        path: entry.path,
        branch,
        head: entry.head,
        isBare: entry.bare,
        isDetached: entry.detached,
        isPrimary: entry.path === repo.root,
        locked: entry.locked,
        lockReason: entry.lockReason,
        otherWorktrees: (pathsByBranch.get(branch) ?? []).filter((p) => p !== entry.path),
        repo,
        prs,
        cwd,
        git,
        probe,
      }),
    )
  }
  return [items, new Set(pathsByBranch.keys())]
}

export function classifyWorktree(opts: {
  path: string
  branch: string
  /** The worktree's HEAD commit; null when git reported none. */
  head: string | null
  isBare: boolean
  isDetached: boolean
  isPrimary: boolean
  locked: boolean
  lockReason: string | null
  /** Other worktrees with the same branch checked out. */
  otherWorktrees: string[]
  repo: RepoInfo
  prs: Map<string, PRInfo>
  cwd: string
  git: Git
  /** Answers lock-owner and working-directory questions. One per sweep: it caches the process table. */
  probe: ProcessProbe
}): SweepItem {
  const { path, branch, head, isBare, isDetached, isPrimary, repo, prs, cwd, git } = opts
  const facts: Record<string, unknown> = {
    path,
    branch: branch || null,
    head,
    bare: isBare,
    detached: isDetached,
    primary: isPrimary,
  }
  const keep = (reason: string, extra: Partial<SweepItem> = {}): SweepItem =>
    makeItem({
      category: 'worktree',
      id: path,
      classification: 'safe-to-keep',
      action: 'keep',
      reason,
      facts,
      ...extra,
    })
  const pinned = (reason: string): SweepItem => keep(reason, { deletable: false })

  if (isPrimary) return pinned('primary worktree (repo root)')

  // The caller is standing in this worktree. Proposing its removal would
  // propose removing the ground the caller is on.
  // A relative or empty `cwd` is anchored at the process cwd without folding
  // `..`, so a `..` that follows a symlink is still judged by where it really is.
  const absCwd = isAbsolute(cwd) ? cwd : `${process.cwd()}${sep}${cwd}`
  if (nodeGuard.contains(path, absCwd)) {
    return pinned("current session's worktree")
  }

  // A directory whose `.git` is gone is no longer a checkout: git lists it as
  // prunable and `git status` inside it fails. Treat it as gone; the prune
  // that drops its registration leaves the directory alone.
  const dirPresent = isDir(path)
  const onDisk = dirPresent && existsSync(join(path, '.git'))
  facts['on_disk'] = onDisk
  facts['directory_left'] = dirPresent && !onDisk

  let dirtyFiles: string[] = []
  let unpushed: string[] = []
  if (onDisk) {
    dirtyFiles = git.at(path).statusPorcelain()

    let compareAgainst = ''
    if (branch) {
      // `try`: a branch with no upstream exits 128, which is an ordinary state
      // here, not a failure.
      const upstream = git.at(path).try.revParse('--abbrev-ref', `${branch}@{upstream}`)
      if (upstream.ok && upstream.value) compareAgainst = upstream.value
    }
    if (!compareAgainst) {
      compareAgainst = landedRef(repo)
    }
    // `try`: `compareAgainst` is a guess — the fallback `origin/main` need not
    // exist locally, and an unresolvable range renders as zero unpushed commits.
    const range = git.at(path).try.logLines({ range: `${compareAgainst}..HEAD`, format: '%h %s' })
    if (range.ok) unpushed = range.value
    facts['compare_against'] = compareAgainst
  }
  facts['dirty_files'] = dirtyFiles.length
  facts['unpushed_commits'] = unpushed.length

  const branchExists = !!branch && git.at(repo.root).resolveRef(branch) !== null
  facts['branch_exists'] = branchExists

  const pr = branch ? prs.get(branch) : undefined
  const { landed, gap } = recordPr(facts, pr, head ?? '', repo)
  if (unpushed.length > 0) facts['unique_commits'] = unpushed.length
  // A merged PR at HEAD lands every commit, even ones the fallback
  // `compare_against` (a squash merge, a deleted upstream) counts as ahead.
  // A rebase merge, cherry-pick or squash merge leaves HEAD off the default
  // branch; the patches say whether the work is there anyway. Judged from HEAD,
  // so a dirty tree is still caught by the dirty-file check below.
  const patch: Landing | null =
    landed || !onDisk || head === null ? null : judgeLanding(repo, head, pr, gap, git)
  if (patch !== null) recordLanding(facts, patch)
  const patchLanded = patch !== null && patch.check !== null
  const unlanded = unpushed.length > 0 && !landed && !landingConfirmed(patch)
  if (onDisk && head !== null) {
    // `soft`: a missing default ref reads as not merged.
    facts['merged'] = mergedFact({
      landed,
      patchLanded,
      ancestor: git.at(repo.root).soft.isAncestor(head, landedRef(repo)),
    })
  }
  const requires = authorizationsFor({
    'abandon-unmerged': unlanded,
    'discard-changes': dirtyFiles.length > 0,
    'confirm-open-pr': pr?.state === 'OPEN',
  })

  const blockers = readBlockers({
    ...opts,
    onDisk,
    facts,
  })
  const kinds = blockers.map(([kind]) => kind)
  // `git worktree remove` and `prune` both skip a locked worktree, so a stale
  // lock is cleared first.
  const unlock = facts['stale_lock'] === true ? [worktreeUnlockCommand(repo.root, path)] : []
  const safeRemove = [...unlock, worktreeRemoveCommand(repo.root, path)]
  const forceRemove = [...unlock, worktreeRemoveCommand(repo.root, path, { force: true })]
  const pruneOnly = [...unlock, worktreePruneCommand(repo.root)]
  facts['blockers'] = kinds
  if (kinds.length > 0) {
    return makeItem({
      category: 'worktree',
      id: path,
      classification: 'needs-investigation',
      action: 'review',
      reason: `blocked: ${kinds.join(', ')}`,
      facts,
      investigationParts: blockers.map(([, advice]) => advice),
      deletable: false,
    })
  }

  if (!onDisk) {
    return makeItem({
      category: 'worktree',
      id: path,
      classification: 'safe-to-delete',
      action: 'prune',
      reason: dirPresent
        ? 'directory is no longer a checkout (no .git); prune the stale link, the directory stays'
        : 'worktree directory no longer on disk; prune the stale link',
      facts,
      commands: pruneOnly,
    })
  }

  if (dirtyFiles.length > 0 || unlanded) {
    return makeItem({
      category: 'worktree',
      id: path,
      classification: 'needs-investigation',
      action: 'review',
      reason: `${dirtyFiles.length} dirty file(s), ${unpushed.length} commit(s) ahead of ${facts['compare_against']}`,
      facts,
      requires,
      investigationParts: [
        `Worktree ${path} has uncommitted work or unpushed commits.`,
        `Branch: ${branch || '(detached)'}.`,
        ...(patchLanded && unlanded
          ? [
              `Its commits are patch-equivalent to commits on ${landedRef(repo)} (${patch.check}), but ${confirmationNote(patch)}.`,
            ]
          : []),
        'Decide whether to preserve, push, or discard.',
      ],
    })
  }

  if (pr && landed) {
    return makeItem({
      category: 'worktree',
      id: path,
      classification: 'safe-to-delete',
      action: 'remove',
      reason: `clean; PR #${pr.number} merged`,
      facts,
      commands: safeRemove,
      requires,
    })
  }

  if (patchLanded) {
    return makeItem({
      category: 'worktree',
      id: path,
      classification: 'safe-to-delete',
      action: 'remove',
      reason: `clean; patch-equivalent to commits on ${landedRef(repo)} (${patch.check}); ${confirmationNote(patch)}`,
      facts,
      commands: safeRemove,
      requires,
    })
  }

  if (branch && !branchExists) {
    return makeItem({
      category: 'worktree',
      id: path,
      classification: 'safe-to-delete',
      action: 'remove',
      reason: `branch \`${branch}\` no longer exists`,
      facts,
      commands: forceRemove,
      requires,
    })
  }

  if (pr && pr.state === 'OPEN') return keep(`open PR #${pr.number}`, { requires })

  // Merged by ancestry alone: a worktree just made from the default branch is
  // merged that way too, so ancestry needs a sign the branch was worked on.
  if (facts['merged'] === true && branch && head !== null) {
    const used = branchUse(git.at(repo.root), branch, repo.mainBranch)
    facts['branch_used'] = used
    if (used !== null) {
      return makeItem({
        category: 'worktree',
        id: path,
        classification: 'safe-to-delete',
        action: 'remove',
        reason: `clean; merged into ${landedRef(repo)}, and ${USE_REASON[used]}`,
        facts,
        commands: safeRemove,
        requires,
      })
    }
  }

  const parts = [`Worktree \`${path}\` is clean.`]
  if (branch) parts.push(`Branch: \`${branch}\`.`)
  parts.push(pr ? `PR #${pr.number} is ${pr.state}.` : 'No associated PR.')
  if (pr && gap) parts.push(gapSentence(pr, gap, repo))
  const unmatched = patch === null ? null : unmatchedSentence(patch, repo)
  if (unmatched !== null) parts.push(unmatched)
  return makeItem({
    category: 'worktree',
    id: path,
    classification: 'needs-investigation',
    action: 'review',
    reason: 'clean but no clear disposability signal',
    facts,
    investigationParts: parts,
    requires,
  })
}

/** How a branch shows it was worked on, for a worktree merged by ancestry alone. */
export type BranchUse = 'commits' | 'upstream'

const USE_REASON: Record<BranchUse, string> = {
  commits: 'the branch has commits made on it',
  upstream: 'the branch was pushed to its own upstream',
}

/** Reflog entries that put work on a branch, as against creating or renaming it. */
const WORK_ENTRY = /^(commit|merge|pull|rebase|cherry-pick|am)\b/

/**
 * The sign that `branch` was worked on, or null for a branch that looks
 * freshly made. `commits`: its reflog records a commit, merge, pull, rebase,
 * cherry-pick or am. `upstream`: it tracks a branch on a remote, and not
 * the default branch (`mainBranch`) of any remote, so someone pushed it as
 * its own branch. A branch with neither, such as one `git worktree add -b`
 * just made from the default branch, with or without `--track`, reads as
 * null: removing its worktree could lose ignored files from work about to
 * start.
 */
export function branchUse(git: Git, branch: string, mainBranch: string): BranchUse | null {
  // `raw`: a branch with no reflog (core.logAllRefUpdates off) exits non-zero.
  const reflog = git.raw(['reflog', 'show', '--format=%gs', `refs/heads/${branch}`, '--'])
  if (reflog.exitCode === 0 && reflog.stdout.split('\n').some((l) => WORK_ENTRY.test(l))) {
    return 'commits'
  }
  // From the branch's own config, not the resolved name: a branch tracking a
  // local branch has remote `.`, and one tracking `upstream/main` merges the
  // default branch however its remote is spelled.
  const remote = git.configGet(`branch.${branch}.remote`)
  const merge = git.configGet(`branch.${branch}.merge`)
  if (remote && remote !== '.' && merge && merge !== `refs/heads/${mainBranch}`) return 'upstream'
  return null
}
