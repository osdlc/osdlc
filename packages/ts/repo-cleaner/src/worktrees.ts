/**
 * Worktrees: gather them, then decide what each one is.
 *
 * A worktree is a directory with work in it, so it is judged more cautiously
 * than a branch. Anything uncommitted or unpushed stops the verdict cold —
 * losing an hour of someone's work costs more than any amount of clutter.
 */

import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'

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
  inspectSubmodules,
  readIndexHazards,
  submoduleFacts,
  unpushedPhrase,
  unreadablePhrase,
  worktreeGitDirs,
  type SubmoduleReport,
} from './submodules.ts'
import {
  landedRef,
  makeRow,
  risksFor,
  type Blocker,
  type BranchUse,
  type PRInfo,
  type RepoInfo,
  type RowFields,
  type WorktreeEvidence,
  type WorktreeRow,
} from './types.ts'
import { isDir } from './util.ts'

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

/**
 * Whether removing this worktree takes `git worktree remove --force`: its
 * submodules make plain remove refuse, it has modified or untracked files
 * (which only `discard-changes` lets go), or its branch is gone. The force
 * skips git's own cleanliness check, so a run checks again itself first.
 */
export function removeIsForced(e: WorktreeEvidence): boolean {
  return (
    e.forcedForSubmodules === true ||
    (e.dirtyFiles ?? 0) > 0 ||
    (e.submoduleDirtyFiles ?? 0) > 0 ||
    (e.branch !== null && e.branchExists === false)
  )
}

/**
 * The commands that carry out `action` on the worktree whose evidence is `e`:
 * an unlock first for a stale lock. A prune of a worktree whose directory is
 * gone removes that worktree's record alone (`git worktree remove` takes a
 * missing directory); one whose directory is left without its `.git` needs
 * the repository-wide `git worktree prune`, which `git worktree remove`
 * refuses to stand in for.
 */
export function worktreeCommands(
  root: string,
  e: WorktreeEvidence,
  action: 'remove' | 'prune',
): string[] {
  // `git worktree remove` and `prune` both skip a locked worktree, so a stale
  // lock is cleared first.
  const unlock = e.staleLock === true ? [worktreeUnlockCommand(root, e.path)] : []
  return [
    ...unlock,
    action === 'remove'
      ? worktreeRemoveCommand(root, e.path, { force: removeIsForced(e) })
      : e.directoryLeft === true
        ? worktreePruneCommand(root)
        : worktreeRemoveCommand(root, e.path),
  ]
}

/** Cap on `evidence.hiddenIndexPaths`; `evidence.hiddenIndexFlags` is the full count. */
const HIDDEN_PATHS_SHOWN = 10

/**
 * The blockers on one worktree, each with the sentence telling a person what
 * to do about it. Writes the evidence for each into `evidence`.
 */
function readBlockers(opts: {
  path: string
  branch: string
  onDisk: boolean
  locked: boolean
  lockReason: string | null
  otherWorktrees: string[]
  evidence: WorktreeEvidence
  git: Git
  probe: ProcessProbe
  submodules: SubmoduleReport
}): [Blocker, string][] {
  const { path, branch, onDisk, locked, lockReason, otherWorktrees, evidence, git, probe } = opts
  const { submodules } = opts
  const out: [Blocker, string][] = []

  if (locked) {
    evidence.lockReason = lockReason
    // A lock whose owner is dead holds nothing. A lock that names no owner, or
    // one that cannot be ruled out, stays a blocker.
    const owner = parseLockOwner(lockReason)
    if (owner !== null && !probe.alive(owner.pid, owner.startedAt)) {
      evidence.staleLock = true
      evidence.lockOwner = { pid: owner.pid, startedAt: owner.startedAt ?? null }
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
      if (shells.length > 0) evidence.idleShells = shells
      if (busy.length > 0) {
        evidence.liveProcesses = busy
        out.push([
          'live-process',
          `Running in the worktree: ${busy.map((h) => `${h.command} (pid ${h.pid})`).join(', ')}; stop them or wait for them to finish.`,
        ])
      }
    } catch (err) {
      // No process table to read (a host without `lsof`, a timeout): nobody
      // can say the directory is idle, so the worktree is held back.
      const message = err instanceof Error ? err.message : String(err)
      evidence.processProbeError = message
      out.push([
        'process-probe-failed',
        `Could not tell whether a process is running in the worktree (${message}); check by hand, or fix the probe and sweep again.`,
      ])
    }

    // Status hides edits to flagged files, so "clean" cannot be trusted, and a
    // nested repository has its own history. A submodule's count too: `--force`
    // removes its files with the rest.
    const own = readIndexHazards(git.at(path), path)
    const inSubmodules = (pick: (s: SubmoduleReport['submodules'][number]) => string[]) =>
      submodules.submodules.flatMap((s) => pick(s).map((p) => `${s.path}/${p}`))
    const hidden = [...own.hiddenIndexPaths, ...inSubmodules((s) => s.hiddenIndexPaths)]
    if (hidden.length > 0) {
      evidence.hiddenIndexFlags = hidden.length
      evidence.hiddenIndexPaths = hidden.slice(0, HIDDEN_PATHS_SHOWN)
      out.push([
        'hidden-index-flags',
        `${hidden.length} file(s) are marked skip-worktree or assume-unchanged, so status may hide edits; clear the flags with \`git update-index --no-skip-worktree --no-assume-unchanged <path>\` and check again.`,
      ])
    }

    const nested = [...own.nestedRepositories, ...inSubmodules((s) => s.nestedRepositories)]
    if (nested.length > 0) {
      evidence.nestedRepositories = nested
      out.push([
        'nested-repository',
        `Nested repositories (${nested.join(', ')}) have their own history; move them out before removing the worktree.`,
      ])
    }
  }

  if (submodules.unreadable.length > 0) {
    out.push([
      'submodule-unreadable',
      `Could not read ${unreadablePhrase(submodules.unreadable)}; check them by hand, then sweep again.`,
    ])
  }

  if (otherWorktrees.length > 0) {
    evidence.otherWorktrees = otherWorktrees
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
  only: { branch?: string | undefined; path?: string | undefined },
  probe: ProcessProbe,
  tick?: (done: number, total: number) => void,
): [WorktreeRow[], Set<string>] {
  const all = git.at(repo.root).worktrees()
  const pathsByBranch = new Map<string, string[]>()
  for (const entry of all) {
    if (entry.branch) {
      pathsByBranch.set(entry.branch, [...(pathsByBranch.get(entry.branch) ?? []), entry.path])
    }
  }
  // A path matches however git spelled it: as listed, resolved, or through symlinks.
  const samePath = (listed: string, wanted: string): boolean =>
    listed === wanted ||
    resolve(listed) === wanted ||
    (existsSync(listed) && realpathSync(listed) === wanted)
  const entries = all.filter(
    (entry) =>
      (only.branch === undefined || entry.branch === only.branch) &&
      (only.path === undefined || samePath(entry.path, only.path)),
  )
  // Read once, and only when a worktree is gone: its git dir may still hold
  // submodule history that the prune would delete.
  let gitDirs: Map<string, string> | undefined
  const gitDirOf = (path: string): string | null => {
    if (gitDirs === undefined) {
      const common = git.at(repo.root).soft.gitCommonDir()
      gitDirs = common === null ? new Map() : worktreeGitDirs(common)
    }
    return gitDirs.get(resolve(path)) ?? null
  }

  const items: WorktreeRow[] = []
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
        gitDirOf,
      }),
    )
  }
  return [items, new Set(pathsByBranch.keys())]
}

function classifyWorktree(opts: {
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
  /** The private git dir of a linked worktree, by path. */
  gitDirOf: (path: string) => string | null
}): WorktreeRow {
  const { path, branch, head, isBare, isDetached, isPrimary, repo, prs, cwd, git } = opts
  const evidence: WorktreeEvidence = {
    path,
    branch: branch || null,
    head,
    bare: isBare,
    detached: isDetached,
    primary: isPrimary,
  }
  const row = (r: RowFields<WorktreeRow>): WorktreeRow =>
    makeRow<WorktreeRow>({ kind: 'worktree', name: path, evidence, ...r })
  const pinned = (why: string): WorktreeRow => row({ verdict: 'keep', action: null, why })

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
  evidence.onDisk = onDisk
  evidence.directoryLeft = dirPresent && !onDisk

  // The worktree's git dir from the map read once per repository; a gone
  // worktree has no checkout to ask, and its git dir may still hold
  // submodule history that removing it would delete.
  const submodules = inspectSubmodules(git, path, { gitDir: opts.gitDirOf(path) })
  const submoduleDirty = submodules.dirty.reduce((n, s) => n + s.dirtyFiles, 0)
  if (submodules.submodules.length > 0) {
    evidence.submodules = submoduleFacts(submodules)
    evidence.submoduleDirtyFiles = submoduleDirty
  }
  // Plain `worktree remove` refuses a worktree with submodules whatever their
  // state, so the remove is forced. The force also skips git's own check for
  // modified and untracked files, which the sweep makes below and `run`
  // makes again just before it removes.
  if (onDisk && submodules.forceRequired) evidence.forcedForSubmodules = true

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
    evidence.compareAgainst = compareAgainst
  }
  evidence.dirtyFiles = dirtyFiles.length
  evidence.unpushedCommits = unpushed.length

  const branchExists = !!branch && git.at(repo.root).resolveRef(branch) !== null
  evidence.branchExists = branchExists

  const pr = branch ? prs.get(branch) : undefined
  const { landed, gap } = recordPr(evidence, pr, head ?? '', repo)
  if (unpushed.length > 0) evidence.uniqueCommits = unpushed.length
  // A merged PR at HEAD lands every commit, even ones the fallback
  // `compareAgainst` (a squash merge, a deleted upstream) counts as ahead.
  // A rebase merge, cherry-pick or squash merge leaves HEAD off the default
  // branch; the patches say whether the work is there anyway. Judged from HEAD,
  // so a dirty tree is still caught by the dirty-file check below.
  const patch: Landing | null =
    landed || !onDisk || head === null ? null : judgeLanding(repo, head, pr, gap, git)
  if (patch !== null) recordLanding(evidence, patch)
  const patchLanded = patch !== null && patch.check !== null
  const unlanded = unpushed.length > 0 && !landed && !landingConfirmed(patch)
  if (onDisk && head !== null) {
    // `soft`: a missing default ref reads as not merged.
    evidence.merged = mergedFact({
      landed,
      patchLanded,
      ancestor: git.at(repo.root).soft.isAncestor(head, landedRef(repo)),
    })
  }
  const dirty = dirtyFiles.length > 0 || submoduleDirty > 0
  // A submodule's git dir lives in the worktree's own git dir, so removing
  // the worktree, or pruning it once its directory is gone, deletes the
  // submodule's commits and stashes with it. The same risk as the worktree's
  // own unpushed commits covers them.
  const submoduleWork = submodules.unpushed.length > 0
  const submoduleWorkText = submoduleWork ? unpushedPhrase(submodules.unpushed) : ''
  const risks = risksFor({
    'abandon-unmerged': unlanded || submoduleWork,
    'discard-changes': dirty,
    'confirm-open-pr': pr?.state === 'OPEN',
  })

  const blockers = readBlockers({ ...opts, onDisk, evidence, submodules })
  const removes = worktreeCommands(repo.root, evidence, 'remove')
  const pruneOnly = worktreeCommands(repo.root, evidence, 'prune')
  // Said in the reason of a row whose remove is forced for its submodules.
  const forced =
    evidence.forcedForSubmodules === true
      ? '; its submodules are clean and pushed, so the remove is forced'
      : ''
  if (blockers.length > 0) {
    const kinds = blockers.map(([kind]) => kind)
    return row({
      verdict: 'blocked',
      action: null,
      why: `blocked: ${kinds.join(', ')}`,
      blockers: kinds,
      notes: blockers.map(([, advice]) => advice),
    })
  }

  if (!onDisk && submoduleWork) {
    return row({
      verdict: 'review',
      action: 'prune',
      why: `directory gone, but its git dir keeps work no remote has in ${submoduleWorkText}`,
      commands: pruneOnly,
      risks,
      notes: [
        `Worktree ${path} is gone, but its git dir keeps ${submoduleWorkText}; pruning it deletes them.`,
        'Push the work from that git dir, or allow abandon-unmerged to prune it anyway.',
      ],
    })
  }

  if (!onDisk) {
    return row({
      verdict: 'delete',
      action: 'prune',
      why: dirPresent
        ? 'directory is no longer a checkout (no .git); prune the stale record, the directory stays'
        : 'worktree directory no longer on disk; prune the stale record',
      commands: pruneOnly,
    })
  }

  if (dirty || unlanded || submoduleWork) {
    const inSubmodules =
      submoduleDirty > 0
        ? `, ${submoduleDirty} in submodule(s) ${submodules.dirty.map((s) => s.path).join(', ')}`
        : ''
    const workInSubmodules = submoduleWork ? `; unpushed work in ${submoduleWorkText}` : ''
    return row({
      verdict: 'review',
      action: 'remove',
      why: `${dirtyFiles.length} dirty file(s)${inSubmodules}, ${unpushed.length} commit(s) ahead of ${evidence.compareAgainst}${workInSubmodules}`,
      commands: removes,
      risks,
      notes: [
        `Worktree ${path} has uncommitted work or unpushed commits.`,
        `Branch: ${branch || '(detached)'}.`,
        ...(submoduleWork
          ? [
              `Removing it also deletes the work in ${submoduleWorkText}, whose git dirs live in the worktree's own.`,
            ]
          : []),
        ...(patchLanded && unlanded
          ? [
              `Its commits are patch-equivalent to commits on ${landedRef(repo)} (${patch.check}), but ${confirmationNote(patch)}.`,
            ]
          : []),
        'Decide whether to preserve, push, or discard.',
      ],
    })
  }

  const deletes = (why: string): WorktreeRow =>
    row({ verdict: 'delete', action: 'remove', why, commands: removes, risks })

  if (pr && landed) return deletes(`clean; PR #${pr.number} merged${forced}`)
  if (patchLanded) {
    return deletes(
      `clean; patch-equivalent to commits on ${landedRef(repo)} (${patch.check}); ${confirmationNote(patch)}${forced}`,
    )
  }
  if (branch && !branchExists) {
    return deletes(`branch \`${branch}\` no longer exists${forced}`)
  }
  if (pr && pr.state === 'OPEN') {
    return row({
      verdict: 'keep',
      action: 'remove',
      why: `open PR #${pr.number}`,
      commands: removes,
      risks,
    })
  }

  // Merged by ancestry alone: a worktree just made from the default branch is
  // merged that way too, so ancestry needs a sign the branch was worked on.
  if (evidence.merged === true && branch && head !== null) {
    const used = branchUse(git.at(repo.root), branch, repo.mainBranch)
    evidence.branchUsed = used
    if (used !== null) {
      return deletes(`clean; merged into ${landedRef(repo)}, and ${USE_REASON[used]}${forced}`)
    }
  }

  const notes = [`Worktree \`${path}\` is clean.`]
  if (branch) notes.push(`Branch: \`${branch}\`.`)
  notes.push(pr ? `PR #${pr.number} is ${pr.state}.` : 'No associated PR.')
  if (pr && gap) notes.push(gapSentence(pr, gap, repo))
  const unmatched = patch === null ? null : unmatchedSentence(patch, repo)
  if (unmatched !== null) notes.push(unmatched)
  return row({
    verdict: 'review',
    action: 'remove',
    why: 'clean but no clear disposability signal',
    commands: removes,
    notes,
    risks,
  })
}

const USE_REASON: Record<BranchUse, string> = {
  commits: 'the branch has commits made on it',
  upstream: 'the branch was pushed to its own upstream',
}

/**
 * Reflog entries that put work on a branch: a commit, a cherry-pick, an `am`,
 * or a merge or pull that made a merge commit. A fast-forward merge or pull,
 * a rebase, a reset or a rename only moves a branch, which a fresh branch
 * tracking the default branch does on its first `git pull`.
 */
function isWorkEntry(entry: string): boolean {
  if (/^(commit|cherry-pick|am)\b/.test(entry)) return true
  return /^(merge|pull)\b/.test(entry) && !/Fast-forward/.test(entry)
}

/**
 * The sign that `branch` was worked on, or null for a branch that looks
 * freshly made. `commits`: its reflog records work (see {@link isWorkEntry}). `upstream`: it tracks a branch on a remote, and not
 * the default branch (`mainBranch`) of any remote, so someone pushed it as
 * its own branch. A branch with neither, such as one `git worktree add -b`
 * just made from the default branch, with or without `--track`, reads as
 * null: removing its worktree could lose ignored files from work about to
 * start.
 */
function branchUse(git: Git, branch: string, mainBranch: string): BranchUse | null {
  // `raw`: a branch with no reflog (core.logAllRefUpdates off) exits non-zero.
  const reflog = git.raw(['reflog', 'show', '--format=%gs', `refs/heads/${branch}`, '--'])
  if (reflog.exitCode === 0 && reflog.stdout.split('\n').some(isWorkEntry)) {
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
