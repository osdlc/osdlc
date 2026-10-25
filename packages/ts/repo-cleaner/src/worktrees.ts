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

import { gapSentence, recordPr } from './branches.ts'
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
  'locked-worktree' | 'hidden-index-flags' | 'nested-repository' | 'branch-in-other-worktree'

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
}): [WorktreeBlocker, string][] {
  const { path, branch, onDisk, locked, lockReason, otherWorktrees, facts, git } = opts
  const out: [WorktreeBlocker, string][] = []

  if (locked) {
    facts['lock_reason'] = lockReason
    out.push([
      'locked-worktree',
      `Locked${lockReason ? ` (${lockReason})` : ''}; run \`git worktree unlock ${path}\` once it is no longer needed.`,
    ])
  }

  if (onDisk) {
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
  only?: string,
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
  for (const entry of entries) {
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

  const onDisk = isDir(path)
  facts['on_disk'] = onDisk

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
  const unlanded = unpushed.length > 0 && !landed
  const requires = authorizationsFor({
    'abandon-unmerged': unlanded,
    'discard-changes': dirtyFiles.length > 0,
    'confirm-open-pr': pr?.state === 'OPEN',
  })

  const safeRemove = [worktreeRemoveCommand(repo.root, path)]
  const forceRemove = [worktreeRemoveCommand(repo.root, path, { force: true })]
  const pruneOnly = [worktreePruneCommand(repo.root)]

  const blockers = readBlockers({ ...opts, onDisk, facts })
  const kinds = blockers.map(([kind]) => kind)
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
      action: 'remove',
      reason: 'worktree directory no longer on disk; prune the stale link',
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

  const parts = [`Worktree \`${path}\` is clean.`]
  if (branch) parts.push(`Branch: \`${branch}\`.`)
  parts.push(pr ? `PR #${pr.number} is ${pr.state}.` : 'No associated PR.')
  if (pr && gap) parts.push(gapSentence(pr, gap, repo))
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
