/**
 * Patch equivalence: a third way to tell that a branch landed.
 *
 * A merge commit makes the branch tip reachable from the default branch, and a
 * merged pull request at the tip says so too. A rebase merge, a cherry-pick
 * and a squash merge do neither: the work is on the default branch under other
 * commit ids. `git cherry` compares commits by patch id, which ignores the id,
 * the message and the dates, so it can say "this commit's change is already
 * there".
 *
 * This code decides what gets deleted, so every doubt answers "not landed".
 * A git call that fails, output that cannot be read, a shallow clone, a
 * missing merge base, a commit that is not on the landed ref and a patch that
 * is empty all end the same way: no evidence.
 */

import type { Git } from '@osdlc/typed-git'

import { landedRef, type RepoInfo } from './types.ts'

/** Which check showed that the work is on the landed ref. */
export type LandingCheck =
  /** Every commit on the branch has a patch-equivalent commit on the landed ref (rebase merge, cherry-pick). */
  | 'per-commit'
  /** The branch's combined change equals one commit on the landed ref (squash merge). */
  | 'squashed'
  /** A merged PR's head passes `squashed`, and every commit after it passes `per-commit`. */
  | 'head-moved'

/** The outcome of {@link assessLanding}. */
export type Landing =
  | { check: LandingCheck }
  | {
      check: null
      /**
       * Commits that have no patch-equivalent on the landed ref, as `<short sha> <subject>`.
       * Filled only when the branch is partly on the landed ref, so a plain
       * diverged branch does not list every commit it has.
       */
      unmatched: string[]
    }

/** Cap on {@link Landing} `unmatched`. */
const UNMATCHED_SHOWN = 10

/**
 * The identity of the throwaway commit the squashed check builds. Fixed, so
 * the check needs no git identity to be configured, and the commit holds
 * nothing that depends on who runs it.
 */
const PROBE_ENV: Record<string, string> = {
  GIT_AUTHOR_NAME: 'repo-cleaner',
  GIT_AUTHOR_EMAIL: 'repo-cleaner@localhost',
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00+0000',
  GIT_COMMITTER_NAME: 'repo-cleaner',
  GIT_COMMITTER_EMAIL: 'repo-cleaner@localhost',
  GIT_COMMITTER_DATE: '2000-01-01T00:00:00+0000',
}

/** Result of one pass over a range: whether all of it matched, and the rest. */
interface RangeVerdict {
  all: boolean
  matched: number
  unmatched: string[]
}

/**
 * Compare every commit in `base..tip` with `landed` by patch id.
 *
 * `git cherry` leaves merge commits out, so a merge with changes of its own
 * would pass unseen. The range is listed separately and must be the same set
 * of commits that `cherry` reported. An empty range is not a match: there is
 * nothing to compare, and ancestry already covers it.
 */
function compareRange(at: Git, landed: string, tip: string, base: string | null): RangeVerdict {
  const range = base === null ? `${landed}..${tip}` : `${base}..${tip}`
  const listed = at.logLines({ range, format: '%H' })
  const changing = commitsWithChanges(at, range)
  const wanted = new Set(listed)
  const seen = new Map<string, boolean>()
  for (const entry of at.cherry(landed, tip)) {
    if (wanted.has(entry.sha)) seen.set(entry.sha, entry.equivalent)
  }
  // `git cherry` calls two empty commits equivalent, so an empty commit proves
  // nothing and never counts.
  const unmatched = listed.filter((sha) => seen.get(sha) !== true || !changing.has(sha))
  const matched = listed.filter((sha) => seen.get(sha) === true && changing.has(sha)).length
  return { all: listed.length > 0 && unmatched.length === 0, matched, unmatched }
}

/** The commits in `range` whose own change touches at least one path. Merge commits are not listed. */
function commitsWithChanges(at: Git, range: string): Set<string> {
  const marker = '\x1e'
  const out = at.log({ range, format: 'format:%x1e%H', nameStatus: true })
  const changing = new Set<string>()
  for (const record of out.split(marker)) {
    const [sha, ...rest] = record.split('\n')
    if (sha !== undefined && /^[0-9a-f]{40,64}$/.test(sha) && rest.some((l) => l.trim() !== '')) {
      changing.add(sha)
    }
  }
  return changing
}

/**
 * True when the combined change from the merge base to `commitish` equals the
 * patch of one commit on `landed`.
 *
 * A commit with `commitish`'s tree on the merge base is built without moving
 * any ref, and `git cherry` compares it with the landed commits. The patch
 * must not be empty: an empty change has no patch id, and a tree equal to the
 * merge base's is refused before the question is asked.
 */
function squashedMatches(at: Git, landed: string, commitish: string): boolean {
  const base = at.mergeBase(landed, commitish)
  if (base === null) return false
  const tree = at.resolveRef(`${commitish}^{tree}`)
  const baseTree = at.resolveRef(`${base}^{tree}`)
  if (tree === null || baseTree === null || tree === baseTree) return false
  const probe = at.commitTree(
    tree,
    { parents: [base], message: 'repo-cleaner: patch equivalence probe' },
    { env: PROBE_ENV },
  )
  const entries = at.cherry(landed, probe)
  return entries.length === 1 && entries[0]!.sha === probe && entries[0]!.equivalent
}

/** `<short sha> <subject>` for each of `shas` found in `base..tip`, capped. */
function describeCommits(at: Git, range: string, shas: string[]): string[] {
  const wanted = new Set(shas)
  return at
    .logLines({ range, format: '%H %h %s' })
    .map((line) => line.split(' '))
    .filter(([sha]) => sha !== undefined && wanted.has(sha))
    .map((parts) => parts.slice(1).join(' '))
    .slice(0, UNMATCHED_SHOWN)
}

function assess(repo: RepoInfo, tip: string, git: Git, prHead: string | null): Landing {
  const at = git.at(repo.root)
  const none: Landing = { check: null, unmatched: [] }

  // A shallow clone cuts history short, so the merge base and the commit list
  // are not the real ones. Anything but a plain "false" is read as shallow.
  if (at.revParse('--is-shallow-repository') !== 'false') return none

  const landed = at.resolveRef(landedRef(repo))
  const tipSha = at.resolveRef(`${tip}^{commit}`)
  if (landed === null || tipSha === null) return none

  const whole = compareRange(at, landed, tipSha, null)
  if (whole.all) return { check: 'per-commit' }
  if (squashedMatches(at, landed, tipSha)) return { check: 'squashed' }

  if (prHead !== null && prHead !== tipSha) {
    const headSha = at.resolveRef(`${prHead}^{commit}`)
    if (
      headSha !== null &&
      at.isAncestor(headSha, tipSha) &&
      squashedMatches(at, landed, headSha)
    ) {
      const after = compareRange(at, landed, tipSha, headSha)
      if (after.all) return { check: 'head-moved' }
      // The squash merge is real, so the commits after it are what is left.
      return {
        check: null,
        unmatched: describeCommits(at, `${headSha}..${tipSha}`, after.unmatched),
      }
    }
  }

  // Some commits are on the landed ref and some are not: name the rest.
  if (whole.matched > 0 && whole.unmatched.length > 0) {
    return {
      check: null,
      unmatched: describeCommits(at, `${landed}..${tipSha}`, whole.unmatched),
    }
  }
  return none
}

/**
 * Whether the work on `tip` is already on the landed ref, judged by patch.
 *
 * Checked in order: every commit one by one (`per-commit`), the branch as one
 * squashed change (`squashed`), and, with `prHead` set to the head of a merged
 * pull request that is not `tip`, that head squashed plus each later commit
 * one by one (`head-moved`). A branch with a commit that is not on the landed
 * ref is never landed.
 *
 * Reads only; it writes one unreferenced commit object and no ref. Any error
 * returns `{ check: null, unmatched: [] }`: a check that cannot finish is not
 * evidence.
 */
export function assessLanding(
  repo: RepoInfo,
  tip: string,
  git: Git,
  prHead: string | null = null,
): Landing {
  try {
    return assess(repo, tip, git, prHead)
  } catch {
    return { check: null, unmatched: [] }
  }
}

/** {@link assessLanding}, reduced to the check that passed, or null. */
export function patchEquivalent(
  repo: RepoInfo,
  tip: string,
  git: Git,
  prHead: string | null = null,
): LandingCheck | null {
  return assessLanding(repo, tip, git, prHead).check
}

/** Write the landing evidence into a row's `facts`. */
export function recordLanding(facts: Record<string, unknown>, landing: Landing): void {
  if (landing.check !== null) {
    facts['landing'] = 'patch-equivalent'
    facts['landing_check'] = landing.check
  } else if (landing.unmatched.length > 0) {
    facts['unmatched_commits'] = landing.unmatched
  }
}

/** One sentence naming the commits that kept a partly landed branch from counting, or null. */
export function unmatchedSentence(landing: Landing, repo: RepoInfo): string | null {
  if (landing.check !== null || landing.unmatched.length === 0) return null
  return `Part of the work is on \`${landedRef(repo)}\`, but these commits are not (no patch-equivalent commit): ${landing.unmatched.join('; ')}.`
}
