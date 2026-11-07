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
  landedRef,
  makeRow,
  risksFor,
  type BranchEvidence,
  type BranchRow,
  type LandingEvidence,
  type PRInfo,
  type PrEvidence,
  type PrEvidenceGap,
  type RemoteEvidence,
  type RemoteRow,
  type RepoInfo,
  type Risk,
  type RowFields,
} from './types.ts'
import { errorText } from './util.ts'

/**
 * Five fields in one pass, so a repository costs one `for-each-ref`. The full
 * sha, so it compares with a PR's `headRefOid`.
 */
const LOCAL_FORMAT =
  '%(refname:short)%09%(upstream:short)%09%(upstream:track)%09%(committerdate:iso8601-strict)%09%(objectname)'

/**
 * True when merged `pr` proves `tip` landed: it targeted the default branch
 * and its head commit is `tip`. Fork PRs never reach here; the provider drops
 * them. A PR with no reported head counts as `head-moved`.
 */
function prCapturesTip(pr: PRInfo, tip: string, repo: RepoInfo): true | PrEvidenceGap {
  if (pr.baseRef !== repo.mainBranch) return 'other-base'
  if (pr.headOid === null || pr.headOid !== tip) return 'head-moved'
  return true
}

/**
 * `evidence.pr`, plus `proof` for a merged PR: `exact-head` when it proves
 * `tip` landed, otherwise the gap. Returns whether it counts as landing proof.
 */
export function recordPr(
  evidence: LandingEvidence,
  pr: PRInfo | undefined,
  tip: string,
  repo: RepoInfo,
): { landed: boolean; gap: PrEvidenceGap | null } {
  if (pr === undefined) return { landed: false, gap: null }
  const { headRef: _, ...rest } = pr
  const out: PrEvidence = rest
  evidence.pr = out
  if (pr.state !== 'MERGED') return { landed: false, gap: null }
  const verdict = prCapturesTip(pr, tip, repo)
  out.proof = verdict === true ? 'exact-head' : verdict
  return verdict === true ? { landed: true, gap: null } : { landed: false, gap: verdict }
}

/** Why a branch has no PR, naming where the sweep looked, or why it could not. */
function noPrSentence(repo: RepoInfo): string {
  const provider = repo.provider
  if (provider === null) return 'No PR lookup (no provider).'
  if (!provider.available) return `No ${provider.noun} lookup (\`${provider.tool}\` not installed).`
  if (!provider.authenticated) {
    return `No ${provider.noun} lookup (\`${provider.tool}\` not signed in).`
  }
  if (provider.listError !== undefined) {
    return `No ${provider.noun} lookup: \`${provider.listing}\` failed (${provider.listError}).`
  }
  return `No ${provider.noun} found via \`${provider.listing}\`.`
}

/** One sentence on why a merged PR did not count, for a row's notes. */
export function gapSentence(pr: PRInfo, gap: PrEvidenceGap, repo: RepoInfo): string {
  return gap === 'other-base'
    ? `PR #${pr.number} merged into \`${pr.baseRef}\`, not \`${repo.mainBranch}\`, so it is not landing proof (other-base).`
    : `PR #${pr.number} merged at head ${pr.headOid ?? '(unknown)'}, which is not this tip, so it is not landing proof (head-moved).`
}

/**
 * `evidence.merged`: the work is on the default branch, by an exact-head
 * merged PR, by ancestry or by a patch match. Every kind records it this way,
 * so the counts use one definition.
 */
export function mergedFact(e: {
  landed: boolean
  ancestor: boolean
  patchLanded: boolean
}): boolean {
  return e.landed || e.ancestor || e.patchLanded
}

/**
 * What deleting a branch needs: its unlanded commits, and its open PR. With
 * `prUnknown`, a listing that failed, a remote branch is treated as having an
 * open PR: deleting a PR's head branch closes the PR, and nothing here can say
 * there is none.
 */
function branchRisks(unmerged: boolean, pr: PRInfo | undefined, prUnknown = false): Risk[] {
  return risksFor({
    'abandon-unmerged': unmerged,
    'confirm-open-pr': pr?.state === 'OPEN' || (pr === undefined && prUnknown),
  })
}

/** `HEAD` as the branch checked out at `git`'s directory; any other name as given. */
export function resolveBranch(value: string, git: Git): string {
  if (value !== 'HEAD') return value
  const current = git.currentBranch()
  if (current === null) throw new Error(`--branch HEAD: no branch is checked out at ${git.cwd}`)
  return current
}

/** Why a branch checked out in a worktree is kept. */
export const HELD_BY_WORKTREE = 'checked out in a worktree (handle via that worktree)'

/**
 * Delete local branch `name` only while it still points at `sha` (the full
 * sha). Same caveats as `deleteRef` in `@osdlc/typed-git`. A sweep proposes a
 * branch checked out in a worktree only alongside that worktree's removal,
 * which must run first.
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
  tick?: (done: number, total: number) => void,
): BranchRow[] {
  const rows = git.at(repo.root).forEachRef('refs/heads/', { format: LOCAL_FORMAT })
  const items: BranchRow[] = []
  for (const [i, line] of rows.entries()) {
    tick?.(i, rows.length)
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

function classifyLocalBranch(opts: {
  name: string
  upstream: string
  track: string
  lastCommit: string
  sha: string
  repo: RepoInfo
  prs: Map<string, PRInfo>
  worktreeBranches: ReadonlySet<string>
  git: Git
}): BranchRow {
  const { name, upstream, track, lastCommit, sha, repo, prs, worktreeBranches, git } = opts
  const evidence: BranchEvidence = {
    branch: name,
    upstream: upstream || null,
    track: track || null,
    lastCommit,
    sha,
  }
  const row = (r: RowFields<BranchRow>): BranchRow =>
    makeRow<BranchRow>({ kind: 'branch', name, evidence, ...r })
  const pinned = (why: string): BranchRow => row({ verdict: 'keep', action: null, why })

  if (name === repo.mainBranch) return pinned('default branch')
  const held =
    name === repo.currentBranch
      ? 'current HEAD'
      : worktreeBranches.has(name)
        ? HELD_BY_WORKTREE
        : null
  if (held !== null) {
    // Never deletable here, but still counted as merged or not: by ancestry or
    // an exact-head merged PR, without the patch checks a deletable row gets.
    // `soft`: a missing default ref reads as not merged.
    const pr = prs.get(name)
    const { landed } = recordPr(evidence, pr, sha, repo)
    evidence.merged = mergedFact({
      landed,
      ancestor: git.at(repo.root).soft.isAncestor(sha, landedRef(repo)),
      patchLanded: false,
    })
    return pinned(held)
  }

  // Work merged only into an unpushed local default has not landed. A missing
  // remote-tracking ref exits 128: ancestry unknown (null).
  const compareRef = landedRef(repo)
  evidence.compareAgainst = compareRef
  const ancestry = git.at(repo.root).try.isAncestor(name, compareRef)
  const ancestor = ancestry.ok ? ancestry.value : null
  evidence.ancestorOfRemoteMain = ancestor
  const isAncestor = ancestor === true

  const pr = prs.get(name)
  const { landed, gap } = recordPr(evidence, pr, sha, repo)
  // Rebase merges, cherry-picks and squash merges leave the tip off the default
  // branch; the patches say whether the work is there anyway.
  const patch: Landing | null = landed || isAncestor ? null : judgeLanding(repo, sha, pr, gap, git)
  if (patch !== null) recordLanding(evidence, patch)
  const patchLanded = patch !== null && patch.check !== null
  const unmerged = !landed && !isAncestor && !landingConfirmed(patch)
  evidence.merged = mergedFact({ landed, ancestor: isAncestor, patchLanded })
  if (!landed && !isAncestor) {
    evidence.uniqueCommits = git.at(repo.root).aheadBehind(repo.mainBranch, sha).ahead
  }
  const risks = branchRisks(unmerged, pr)
  const commands = [localDeleteCommand(name, sha)]
  const deletes = (why: string): BranchRow =>
    row({ verdict: 'delete', action: 'delete', why, commands, risks })

  if (pr && landed) return deletes(`PR #${pr.number} merged`)
  if (isAncestor) return deletes(`fully merged into ${compareRef}`)
  if (patchLanded) {
    return deletes(
      `patch-equivalent to commits on ${compareRef} (${patch.check}); ${confirmationNote(patch)}`,
    )
  }
  if (pr && pr.state === 'OPEN') {
    return row({ verdict: 'keep', action: 'delete', why: `open PR #${pr.number}`, commands, risks })
  }

  const lead =
    ancestor === null
      ? `Remote default branch \`${compareRef}\` was not found, so ancestry is unknown.`
      : `Branch \`${name}\` is not an ancestor of \`${compareRef}\`.`
  const notes = [lead]
  notes.push(upstream ? `Tracks \`${upstream}\` (${track || 'in sync'}).` : 'Has no upstream.')
  notes.push(pr ? `Associated PR #${pr.number} is ${pr.state} (${pr.url}).` : noPrSentence(repo))
  if (pr && gap) notes.push(gapSentence(pr, gap, repo))
  const unmatched = patch === null ? null : unmatchedSentence(patch, repo)
  if (unmatched !== null) notes.push(unmatched)
  notes.push(`Last commit: ${lastCommit} (${sha}).`)
  return row({
    verdict: 'review',
    action: 'delete',
    why: 'mixed or absent signals',
    commands,
    notes,
    risks,
  })
}

// ── remote branches ────────────────────────────────────────────────────────

/** Remote branch rows, and the repository note when their tips had to come from disk. */
export interface RemoteBranches {
  rows: RemoteRow[]
  /**
   * Why the tips are the remote-tracking refs on disk though the remote's own
   * were asked for; null otherwise.
   */
  note: string | null
}

/**
 * Remote branches, judged. With `live`, after a fetch, the tips are the
 * remote's own, read with `ls-remote`, which also sees branches a narrowed
 * fetch refspec leaves out. Without it, as `--offline` asks, they are the
 * remote-tracking refs on disk (`refs/remotes/<remote>/`), and the remote is
 * not contacted.
 *
 * A live listing that fails is not "the remote has no branches" and not a
 * reason to lose the repository's other rows: the tips come from disk
 * instead, and each row and the returned note say so.
 */
export function gatherRemoteBranches(
  repo: RepoInfo,
  prs: Map<string, PRInfo>,
  localBranchNames: ReadonlySet<string>,
  git: Git,
  opts: {
    live: boolean
    only?: string | undefined
    tick?: ((done: number, total: number) => void) | undefined
  },
): RemoteBranches {
  const remote = repo.remote
  if (remote === null) return { rows: [], note: null }
  const { only, tick } = opts
  let tips: Array<{ name: string; sha: string }> | null = null
  let note: string | null = null
  if (opts.live) {
    const pattern = only === undefined ? undefined : `refs/heads/${only}`
    const listed = git.at(repo.root).try.lsRemote(remote, pattern, { heads: true })
    if (listed.ok) {
      tips = listed.value.flatMap(({ sha, ref }) =>
        ref.startsWith('refs/heads/') ? [{ name: ref.slice('refs/heads/'.length), sha }] : [],
      )
    } else {
      note = `\`git ls-remote ${remote}\` failed (${errorText(listed.error)}); remote branches are read from the remote-tracking refs on disk.`
    }
  }
  if (tips === null) tips = trackingTips(repo.root, remote, git, only)

  const items: RemoteRow[] = []
  for (const [i, { name, sha }] of tips.entries()) {
    tick?.(i, tips.length)
    if (only !== undefined && name !== only) continue
    const row = classifyRemoteBranch({ name, sha, repo, prs, localBranchNames, git })
    if (note !== null) {
      row.notes.push(
        `Tip read from \`refs/remotes/${remote}/${name}\` on disk: \`git ls-remote\` failed.`,
      )
    }
    items.push(row)
  }
  return { rows: items, note }
}

/**
 * `remote`'s branches as its remote-tracking refs on disk record them, under
 * the default `refs/remotes/<remote>/` layout. The symbolic `HEAD` is not a
 * branch.
 */
function trackingTips(
  root: string,
  remote: string,
  git: Git,
  only: string | undefined,
): Array<{ name: string; sha: string }> {
  const prefix = `refs/remotes/${remote}/`
  return git
    .at(root)
    .refs(only === undefined ? prefix : `${prefix}${only}`)
    .flatMap(({ sha, ref }) => {
      if (!ref.startsWith(prefix)) return []
      const name = ref.slice(prefix.length)
      return name === 'HEAD' ? [] : [{ name, sha }]
    })
}

function classifyRemoteBranch(opts: {
  name: string
  sha: string
  repo: RepoInfo
  prs: Map<string, PRInfo>
  localBranchNames: ReadonlySet<string>
  git: Git
}): RemoteRow {
  const { name: branch, sha, repo, prs, localBranchNames, git } = opts
  const remote = repo.remote ?? ''
  const name = `${remote}/${branch}`
  const evidence: RemoteEvidence = {
    branch,
    remote,
    sha,
    hasLocal: localBranchNames.has(branch),
  }
  const row = (r: RowFields<RemoteRow>): RemoteRow =>
    makeRow<RemoteRow>({ kind: 'remote', name, evidence, ...r })

  if (branch === repo.mainBranch)
    return row({ verdict: 'keep', action: null, why: 'default branch' })

  const remoteMain = landedRef(repo)
  // `soft`: `sha` may come from `ls-remote`, so the clone may never have
  // fetched it, and `remoteMain` may not exist either. Both exit 128; this row
  // renders "cannot tell" as false.
  const isAncestor = git.at(repo.root).soft.isAncestor(sha, remoteMain)
  evidence.ancestorOfRemoteMain = isAncestor

  const pr = prs.get(branch)
  const { landed, gap } = recordPr(evidence, pr, sha, repo)
  // A `sha` from `ls-remote` may not be in this clone; the check then finds
  // nothing and the branch stays unlanded.
  const patch: Landing | null = landed || isAncestor ? null : judgeLanding(repo, sha, pr, gap, git)
  if (patch !== null) recordLanding(evidence, patch)
  const patchLanded = patch !== null && patch.check !== null
  const unmerged = !landed && !isAncestor && !landingConfirmed(patch)
  evidence.merged = mergedFact({ landed, ancestor: isAncestor, patchLanded })
  if (!landed && !isAncestor) {
    // Unknown (null) when the clone lacks `sha` or `remoteMain`, as above.
    const counted = git.at(repo.root).try.aheadBehind(remoteMain, sha)
    evidence.uniqueCommits = counted.ok ? counted.value.ahead : null
  }
  const listError = repo.provider?.listError
  const risks = branchRisks(unmerged, pr, listError !== undefined)
  const commands = repo.remote === null ? [] : [remoteDeleteCommand(repo.remote, branch, sha)]
  // Without the listing, an open PR cannot be ruled out; the risk says so.
  const unknownPr =
    listError !== undefined && pr === undefined
      ? [
          `Whether it has an open PR is unknown (\`${repo.provider!.listing}\` failed), so deleting it needs confirm-open-pr.`,
        ]
      : []
  const deletes = (why: string): RemoteRow =>
    row({ verdict: 'delete', action: 'delete', why, commands, risks, notes: unknownPr })

  if (pr && landed) return deletes(`PR #${pr.number} merged (auto-delete didn't fire)`)
  if (isAncestor) return deletes(`fully merged into ${remoteMain}`)
  if (patchLanded) {
    return deletes(
      `patch-equivalent to commits on ${remoteMain} (${patch.check}); ${confirmationNote(patch)}`,
    )
  }
  if (pr && pr.state === 'OPEN') {
    return row({ verdict: 'keep', action: 'delete', why: `open PR #${pr.number}`, commands, risks })
  }

  const notes = [`Remote branch \`${name}\` is not an ancestor of \`${remoteMain}\`.`]
  notes.push(pr ? `Associated PR #${pr.number} is ${pr.state}.` : (unknownPr[0] ?? 'No PR found.'))
  if (pr && gap) notes.push(gapSentence(pr, gap, repo))
  const unmatched = patch === null ? null : unmatchedSentence(patch, repo)
  if (unmatched !== null) notes.push(unmatched)
  notes.push('Decide whether to push more work, delete, or leave it as long-lived.')
  return row({
    verdict: 'review',
    action: 'delete',
    why: 'mixed or absent signals',
    commands,
    notes,
    risks,
  })
}
