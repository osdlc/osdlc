/**
 * Local and remote branches: gather them, then decide what each one is.
 *
 * Three signals settle most branches. A merged pull request whose head commit is
 * the branch tip says the work landed. Ancestry says the same thing without
 * GitHub's help — if the branch tip is reachable from the default branch,
 * every commit on it is already there. Patch equivalence covers rebase merges,
 * cherry-picks and squash merges, where the work is on the default branch
 * under other commit ids. Any one is enough to call a branch spent; none
 * leaves the branch for a person to look at.
 */

import { shellJoin } from '@osdlc/command-seam'
import { forceWithLeaseArg, type Git } from '@osdlc/typed-git'

import {
  confirmationNote,
  judgeLanding,
  landingConfirmed,
  recordLanding,
  unmatchedSentence,
  type Landing,
} from './landing.ts'
import {
  authorizationsFor,
  landedRef,
  makeItem,
  type Authorization,
  type PRInfo,
  type PrEvidenceGap,
  type RepoInfo,
  type SweepItem,
} from './types.ts'

/**
 * Five fields in one pass, so a repository costs one `for-each-ref`. The full
 * sha, so it compares with a PR's `headRefOid`.
 */
const LOCAL_FORMAT =
  '%(refname:short)%09%(upstream:short)%09%(upstream:track)%09%(committerdate:iso8601-strict)%09%(objectname)'

/**
 * True when merged `pr` proves `tip` landed: it targeted the default branch
 * and its head commit is `tip`. Fork PRs never reach here; `fetchPrs` drops
 * them. A PR with no reported head counts as `head-moved`.
 */
export function prCapturesTip(pr: PRInfo, tip: string, repo: RepoInfo): true | PrEvidenceGap {
  if (pr.baseRef !== repo.mainBranch) return 'other-base'
  if (pr.headOid === null || pr.headOid !== tip) return 'head-moved'
  return true
}

/**
 * `facts.pr`, plus `evidence` for a merged PR: `exact-head` when it proves
 * `tip` landed, otherwise the gap. Returns whether it counts as landing proof.
 */
export function recordPr(
  facts: Record<string, unknown>,
  pr: PRInfo | undefined,
  tip: string,
  repo: RepoInfo,
): { landed: boolean; gap: PrEvidenceGap | null } {
  if (pr === undefined) return { landed: false, gap: null }
  const out: Record<string, unknown> = {
    number: pr.number,
    state: pr.state,
    merged_at: pr.mergedAt,
    url: pr.url,
    title: pr.title,
    head_oid: pr.headOid,
    base_ref: pr.baseRef,
  }
  facts['pr'] = out
  if (pr.state !== 'MERGED') return { landed: false, gap: null }
  const verdict = prCapturesTip(pr, tip, repo)
  out['evidence'] = verdict === true ? 'exact-head' : verdict
  return verdict === true ? { landed: true, gap: null } : { landed: false, gap: verdict }
}

/** One sentence on why a merged PR did not count, for `investigationParts`. */
export function gapSentence(pr: PRInfo, gap: PrEvidenceGap, repo: RepoInfo): string {
  return gap === 'other-base'
    ? `PR #${pr.number} merged into \`${pr.baseRef}\`, not \`${repo.mainBranch}\`, so it is not landing proof (other-base).`
    : `PR #${pr.number} merged at head ${pr.headOid ?? '(unknown)'}, which is not this tip, so it is not landing proof (head-moved).`
}

/** What deleting a branch needs: its unlanded commits, and its open PR. */
function branchRequires(unmerged: boolean, pr: PRInfo | undefined): Authorization[] {
  return authorizationsFor({
    'abandon-unmerged': unmerged,
    'confirm-open-pr': pr?.state === 'OPEN',
  })
}

/** `HEAD` as the branch checked out at `git`'s directory; any other name as given. */
export function resolveBranch(value: string, git: Git): string {
  if (value !== 'HEAD') return value
  const current = git.currentBranch()
  if (current === null) throw new Error(`--branch HEAD: no branch is checked out at ${git.cwd}`)
  return current
}

/**
 * Delete local branch `name` only while it still points at `sha` (the full
 * sha). Same caveats as `deleteRef` in `@osdlc/typed-git`. Only a `branch`
 * sweep proposes a branch checked out in a worktree, and only alongside that
 * worktree's removal, which must run first.
 */
export function localDeleteCommand(name: string, sha: string): string {
  return shellJoin(['git', 'update-ref', '-d', `refs/heads/${name}`, sha])
}

/** Delete `remote`'s branch `name` only while it still points at `sha`. */
export function remoteDeleteCommand(remote: string, name: string, sha: string): string {
  return shellJoin([
    'git',
    'push',
    forceWithLeaseArg({ ref: `refs/heads/${name}`, expect: sha }),
    remote,
    `:refs/heads/${name}`,
  ])
}

// ── local branches ─────────────────────────────────────────────────────────

export function gatherLocalBranches(
  repo: RepoInfo,
  prs: Map<string, PRInfo>,
  worktreeBranches: ReadonlySet<string>,
  git: Git,
  only?: string,
): SweepItem[] {
  const rows = git.at(repo.root).forEachRef('refs/heads/', { format: LOCAL_FORMAT })
  const items: SweepItem[] = []
  for (const line of rows) {
    const parts = line.split('\t')
    if (parts.length !== 5) continue
    const [name, upstream, track, lastCommit, sha] = parts as [
      string,
      string,
      string,
      string,
      string,
    ]
    if (only !== undefined && name !== only) continue
    items.push(
      classifyLocalBranch({
        name,
        upstream,
        track,
        lastCommit,
        sha,
        repo,
        prs,
        worktreeBranches,
        git,
      }),
    )
  }
  return items
}

export function classifyLocalBranch(opts: {
  name: string
  upstream: string
  track: string
  lastCommit: string
  sha: string
  repo: RepoInfo
  prs: Map<string, PRInfo>
  worktreeBranches: ReadonlySet<string>
  git: Git
}): SweepItem {
  const { name, upstream, track, lastCommit, sha, repo, prs, worktreeBranches, git } = opts
  const facts: Record<string, unknown> = {
    branch: name,
    upstream: upstream || null,
    track: track || null,
    last_commit: lastCommit,
    sha,
  }
  const keep = (reason: string, extra: Partial<SweepItem> = {}): SweepItem =>
    makeItem({
      category: 'local_branch',
      id: name,
      classification: 'safe-to-keep',
      action: 'keep',
      reason,
      facts,
      ...extra,
    })
  const pinned = (reason: string): SweepItem => keep(reason, { deletable: false })

  if (name === repo.mainBranch) return pinned('default branch')
  const held =
    name === repo.currentBranch
      ? 'current HEAD'
      : worktreeBranches.has(name)
        ? 'checked out in a worktree (handle via that worktree)'
        : null
  if (held !== null) {
    // Never deletable here, but still counted as merged or not: by ancestry or
    // an exact-head merged PR, without the patch checks a deletable row gets.
    // `soft`: a missing default ref reads as not merged.
    const pr = prs.get(name)
    const { landed } = recordPr(facts, pr, sha, repo)
    facts['merged'] = landed || git.at(repo.root).soft.isAncestor(sha, landedRef(repo))
    return pinned(held)
  }

  // Work merged only into an unpushed local default has not landed. A missing
  // remote-tracking ref exits 128: ancestry unknown (null).
  const compareRef = landedRef(repo)
  facts['compare_against'] = compareRef
  const ancestry = git.at(repo.root).try.isAncestor(name, compareRef)
  const ancestor = ancestry.ok ? ancestry.value : null
  facts['ancestor_of_remote_main'] = ancestor
  const isAncestor = ancestor === true

  const pr = prs.get(name)
  const { landed, gap } = recordPr(facts, pr, sha, repo)
  // Rebase merges, cherry-picks and squash merges leave the tip off the default
  // branch; the patches say whether the work is there anyway.
  const patch: Landing | null = landed || isAncestor ? null : judgeLanding(repo, sha, pr, gap, git)
  if (patch !== null) recordLanding(facts, patch)
  const patchLanded = patch !== null && patch.check !== null
  const unmerged = !landed && !isAncestor && !landingConfirmed(patch)
  // Merged: the work is on the default branch, by ancestry, an exact-head merged PR or a patch match.
  facts['merged'] = landed || isAncestor || patchLanded
  if (!landed && !isAncestor) {
    facts['unique_commits'] = git.at(repo.root).aheadBehind(repo.mainBranch, sha).ahead
  }
  const requires = branchRequires(unmerged, pr)

  const deleteCmd = [localDeleteCommand(name, sha)]

  if (pr && landed) {
    return makeItem({
      category: 'local_branch',
      id: name,
      classification: 'safe-to-delete',
      action: 'delete',
      reason: `PR #${pr.number} merged`,
      facts,
      commands: deleteCmd,
      requires,
    })
  }
  if (isAncestor) {
    return makeItem({
      category: 'local_branch',
      id: name,
      classification: 'safe-to-delete',
      action: 'delete',
      reason: `fully merged into ${compareRef}`,
      facts,
      commands: deleteCmd,
      requires,
    })
  }
  if (patchLanded) {
    return makeItem({
      category: 'local_branch',
      id: name,
      classification: 'safe-to-delete',
      action: 'delete',
      reason: `patch-equivalent to commits on ${compareRef} (${patch.check}); ${confirmationNote(patch)}`,
      facts,
      commands: deleteCmd,
      requires,
    })
  }
  if (pr && pr.state === 'OPEN') return keep(`open PR #${pr.number}`, { requires })

  const lead =
    ancestor === null
      ? `Remote default branch \`${compareRef}\` was not found, so ancestry is unknown.`
      : `Branch \`${name}\` is not an ancestor of \`${compareRef}\`.`
  const parts = [lead]
  parts.push(upstream ? `Tracks \`${upstream}\` (${track || 'in sync'}).` : 'Has no upstream.')
  parts.push(
    pr
      ? `Associated PR #${pr.number} is ${pr.state} (${pr.url}).`
      : 'No PR found via `gh pr list`.',
  )
  if (pr && gap) parts.push(gapSentence(pr, gap, repo))
  const unmatched = patch === null ? null : unmatchedSentence(patch, repo)
  if (unmatched !== null) parts.push(unmatched)
  parts.push(`Last commit: ${lastCommit} (${sha}).`)
  return makeItem({
    category: 'local_branch',
    id: name,
    classification: 'needs-investigation',
    action: 'review',
    reason: 'mixed or absent signals',
    facts,
    investigationParts: parts,
    requires,
  })
}

// ── remote branches ────────────────────────────────────────────────────────

export function gatherRemoteBranches(
  repo: RepoInfo,
  prs: Map<string, PRInfo>,
  localBranchNames: ReadonlySet<string>,
  git: Git,
  only?: string,
): SweepItem[] {
  if (repo.remote === null) return []
  // Default door: an unreachable remote throws rather than rendering as "the
  // remote has no branches". `[]` here means the remote really has none.
  const pattern = only === undefined ? undefined : `refs/heads/${only}`
  const rows = git.at(repo.root).lsRemote(repo.remote, pattern, { heads: true })
  const items: SweepItem[] = []
  for (const { sha, ref } of rows) {
    if (!ref.startsWith('refs/heads/')) continue
    const name = ref.slice('refs/heads/'.length)
    if (only !== undefined && name !== only) continue
    items.push(classifyRemoteBranch({ name, sha, repo, prs, localBranchNames, git }))
  }
  return items
}

export function classifyRemoteBranch(opts: {
  name: string
  sha: string
  repo: RepoInfo
  prs: Map<string, PRInfo>
  localBranchNames: ReadonlySet<string>
  git: Git
}): SweepItem {
  const { name, sha, repo, prs, localBranchNames, git } = opts
  const id = `${repo.remote}/${name}`
  const facts: Record<string, unknown> = {
    branch: name,
    remote: repo.remote,
    sha,
    has_local: localBranchNames.has(name),
  }
  const keep = (reason: string, extra: Partial<SweepItem> = {}): SweepItem =>
    makeItem({
      category: 'remote_branch',
      id,
      classification: 'safe-to-keep',
      action: 'keep',
      reason,
      facts,
      ...extra,
    })

  if (name === repo.mainBranch) return keep('default branch', { deletable: false })

  const remoteMain = landedRef(repo)
  // `soft`: `sha` comes from `ls-remote`, so the clone may never have fetched
  // it, and `remoteMain` may not exist either. Both exit 128; this row renders
  // "cannot tell" as false.
  const isAncestor = git.at(repo.root).soft.isAncestor(sha, remoteMain)
  facts['ancestor_of_remote_main'] = isAncestor

  const pr = prs.get(name)
  const { landed, gap } = recordPr(facts, pr, sha, repo)
  // `sha` came from `ls-remote` and may not be in this clone; the check then
  // finds nothing and the branch stays unlanded.
  const patch: Landing | null = landed || isAncestor ? null : judgeLanding(repo, sha, pr, gap, git)
  if (patch !== null) recordLanding(facts, patch)
  const patchLanded = patch !== null && patch.check !== null
  const unmerged = !landed && !isAncestor && !landingConfirmed(patch)
  // Merged: the work is on the default branch, by ancestry, an exact-head merged PR or a patch match.
  facts['merged'] = landed || isAncestor || patchLanded
  if (!landed && !isAncestor) {
    // Unknown (null) when the clone lacks `sha` or `remoteMain`, as above.
    const counted = git.at(repo.root).try.aheadBehind(remoteMain, sha)
    facts['unique_commits'] = counted.ok ? counted.value.ahead : null
  }
  const requires = branchRequires(unmerged, pr)

  const deleteCmd = repo.remote === null ? [] : [remoteDeleteCommand(repo.remote, name, sha)]

  if (pr && landed) {
    return makeItem({
      category: 'remote_branch',
      id,
      classification: 'safe-to-delete',
      action: 'delete',
      reason: `PR #${pr.number} merged (auto-delete didn't fire)`,
      facts,
      commands: deleteCmd,
      requires,
    })
  }
  if (isAncestor) {
    return makeItem({
      category: 'remote_branch',
      id,
      classification: 'safe-to-delete',
      action: 'delete',
      reason: `fully merged into ${remoteMain}`,
      facts,
      commands: deleteCmd,
      requires,
    })
  }
  if (patchLanded) {
    return makeItem({
      category: 'remote_branch',
      id,
      classification: 'safe-to-delete',
      action: 'delete',
      reason: `patch-equivalent to commits on ${remoteMain} (${patch.check}); ${confirmationNote(patch)}`,
      facts,
      commands: deleteCmd,
      requires,
    })
  }
  if (pr && pr.state === 'OPEN') return keep(`open PR #${pr.number}`, { requires })

  const parts = [`Remote branch \`${id}\` is not an ancestor of \`${remoteMain}\`.`]
  parts.push(pr ? `Associated PR #${pr.number} is ${pr.state}.` : 'No PR found.')
  if (pr && gap) parts.push(gapSentence(pr, gap, repo))
  const unmatched = patch === null ? null : unmatchedSentence(patch, repo)
  if (unmatched !== null) parts.push(unmatched)
  parts.push('Decide whether to push more work, delete, or leave it as long-lived.')
  return makeItem({
    category: 'remote_branch',
    id,
    classification: 'needs-investigation',
    action: 'review',
    reason: 'mixed or absent signals',
    facts,
    investigationParts: parts,
    requires,
  })
}
