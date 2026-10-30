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
 * A patch id is a heuristic, not proof. It reads only the changed lines, so an
 * indentation-only change, a one-line edit that the landed ref also made
 * independently, or a commit that landed and was later reverted can all look
 * the same as work that landed. A patch-equivalent verdict therefore stands
 * on its own only when a second, independent check agrees: merging the branch
 * into the landed ref (`git merge-tree`) must change nothing, which shows the
 * branch's content is already there. Without that, the verdict still names the
 * check that passed, but `confirmed` is false and callers keep requiring the
 * `abandon-unmerged` authorization.
 *
 * This code decides what gets deleted, so every doubt answers "not landed" or
 * "not confirmed". A git call that fails, output that cannot be read, a
 * shallow clone, a missing merge base, a commit that is not on the landed ref
 * and a patch that is empty all end the same way: no evidence.
 */

import type { Git, GitSyncCallOptions } from '@osdlc/typed-git'

import { landedRef, type PRInfo, type PrEvidenceGap, type RepoInfo } from './types.ts'

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
  | {
      check: LandingCheck
      /**
       * True when `git merge-tree` of the landed ref and the tip gives exactly
       * the landed ref's tree: the branch's content is already there. False
       * when the merge changes something, conflicts, cannot run (git older
       * than 2.38) or fails. Only a confirmed verdict drops `abandon-unmerged`.
       */
      confirmed: boolean
    }
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
 * `git replace` refs make git read one object as another, so a replaced commit
 * could fake a merge base, a commit list or a patch. Every call of the check
 * ignores them.
 */
const NO_REPLACE: Record<string, string> = { GIT_NO_REPLACE_OBJECTS: '1' }

/** Call options of every git call the check makes. */
const CALL: GitSyncCallOptions = { env: NO_REPLACE }

/**
 * The identity of the throwaway commit the squashed check builds. Fixed, so
 * the check needs no git identity to be configured, and the commit holds
 * nothing that depends on who runs it.
 */
const PROBE_ENV: Record<string, string> = {
  ...NO_REPLACE,
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
 * `git cherry` leaves merge commits out, and `git log --name-status` shows no
 * diff for them, so every merge commit in the range counts as unmatched, a
 * plain merge of the default branch included. The range is listed separately
 * and must be the same set of commits that `cherry` reported. A branch with a
 * merge commit therefore never passes `per-commit`; the `squashed` check, which
 * looks at the combined change, is the one that can still pass. An empty range
 * is not a match: there is nothing to compare, and ancestry already covers it.
 */
function compareRange(at: Git, landed: string, tip: string, base: string | null): RangeVerdict {
  const range = base === null ? `${landed}..${tip}` : `${base}..${tip}`
  const listed = at.logLines({ range, format: '%H', ...CALL })
  const changing = commitsWithChanges(at, range)
  const wanted = new Set(listed)
  const seen = new Map<string, boolean>()
  for (const entry of at.cherry(landed, tip, CALL)) {
    if (wanted.has(entry.sha)) seen.set(entry.sha, entry.equivalent)
  }
  // `git cherry` calls two empty commits equivalent, so an empty commit proves
  // nothing and never counts.
  const unmatched = listed.filter((sha) => seen.get(sha) !== true || !changing.has(sha))
  const matched = listed.filter((sha) => seen.get(sha) === true && changing.has(sha)).length
  return { all: listed.length > 0 && unmatched.length === 0, matched, unmatched }
}

/** The commits in `range` whose own change touches at least one path. Merge commits show no diff and are never listed. */
function commitsWithChanges(at: Git, range: string): Set<string> {
  const marker = '\x1e'
  const out = at.log({ range, format: 'format:%x1e%H', nameStatus: true, ...CALL })
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
 *
 * Any one landed commit with the same net patch is enough, not necessarily a
 * commit that came from this branch. That is why a `squashed` verdict is
 * only a hint until {@link contentConfirmed} agrees.
 */
function squashedMatches(at: Git, landed: string, commitish: string): boolean {
  const base = at.mergeBase(landed, commitish, CALL)
  if (base === null) return false
  const tree = at.resolveRef(`${commitish}^{tree}`, CALL)
  const baseTree = at.resolveRef(`${base}^{tree}`, CALL)
  if (tree === null || baseTree === null || tree === baseTree) return false
  const probe = at.commitTree(
    tree,
    { parents: [base], message: 'repo-cleaner: patch equivalence probe' },
    { env: PROBE_ENV },
  )
  const entries = at.cherry(landed, probe, CALL)
  return entries.length === 1 && entries[0]!.sha === probe && entries[0]!.equivalent
}

/** `<short sha> <subject>` for each of `shas` found in `base..tip`, capped. */
function describeCommits(at: Git, range: string, shas: string[]): string[] {
  const wanted = new Set(shas)
  return at
    .logLines({ range, format: '%H %h %s', ...CALL })
    .map((line) => line.split(' '))
    .filter(([sha]) => sha !== undefined && wanted.has(sha))
    .map((parts) => parts.slice(1).join(' ').trim())
    .slice(0, UNMATCHED_SHOWN)
}

/** The check that passed, with `confirmed` not yet decided. */
type Verdict = { check: LandingCheck } | Extract<Landing, { check: null }>

function assess(repo: RepoInfo, tip: string, git: Git, prHead: string | null): Verdict {
  const at = git.at(repo.root)
  const none: Verdict = { check: null, unmatched: [] }

  // A shallow clone cuts history short, so the merge base and the commit list
  // are not the real ones. Anything but a plain "false" is read as shallow.
  if (at.revParse('--is-shallow-repository', CALL) !== 'false') return none

  const landed = at.resolveRef(landedRef(repo), CALL)
  const tipSha = at.resolveRef(`${tip}^{commit}`, CALL)
  if (landed === null || tipSha === null) return none

  const whole = compareRange(at, landed, tipSha, null)
  if (whole.all) return { check: 'per-commit' }
  if (squashedMatches(at, landed, tipSha)) return { check: 'squashed' }

  if (prHead !== null && prHead !== tipSha) {
    const headSha = at.resolveRef(`${prHead}^{commit}`, CALL)
    if (
      headSha !== null &&
      at.isAncestor(headSha, tipSha, CALL) &&
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
 * The second, independent check: merging `tip` into the landed ref changes
 * nothing.
 *
 * `git merge-tree --write-tree <landed> <tip>` computes the merge in the object
 * store. It must be clean and its tree must equal the landed ref's tree, which
 * shows the branch's content is already there and not just a similar patch.
 * Needs git 2.38 or later; an older git, a failure, a conflict or a tree that
 * is not a sha all mean "not confirmed". A tip whose work was landed and later
 * reverted on the default branch is not confirmed either: the merge brings the
 * work back.
 */
function contentConfirmed(at: Git, landed: string, tipSha: string): boolean {
  const merged = at.mergeTree(landed, tipSha, CALL)
  if (merged.status !== 'clean' || !/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(merged.tree)) return false
  const landedTree = at.resolveRef(`${landed}^{tree}`, CALL)
  return landedTree !== null && landedTree === merged.tree
}

/** {@link contentConfirmed} for `tip` against the landed ref; any error is false. */
function confirm(repo: RepoInfo, tip: string, git: Git): boolean {
  try {
    const at = git.at(repo.root)
    const landed = at.resolveRef(landedRef(repo), CALL)
    const tipSha = at.resolveRef(`${tip}^{commit}`, CALL)
    return landed !== null && tipSha !== null && contentConfirmed(at, landed, tipSha)
  } catch {
    return false
  }
}

/**
 * Whether the work on `tip` is already on the landed ref, judged by patch.
 *
 * Checked in order: every commit one by one (`per-commit`), the branch as one
 * squashed change (`squashed`), and, with `prHead` set to the head of a merged
 * pull request that is not `tip`, that head squashed plus each later commit
 * one by one (`head-moved`). A branch with a commit that is not on the landed
 * ref is never landed. A passing check also carries `confirmed`, the outcome
 * of the content check ({@link contentConfirmed}).
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
  let verdict: Verdict
  try {
    verdict = assess(repo, tip, git, prHead)
  } catch {
    return { check: null, unmatched: [] }
  }
  if (verdict.check === null) return verdict
  return { check: verdict.check, confirmed: confirm(repo, tip, git) }
}

/**
 * The patch-equivalence verdict for a branch the first two signals did not
 * settle. A merged PR at an earlier head lets the check trust that head's
 * squash merge and look at the commits after it.
 */
export function judgeLanding(
  repo: RepoInfo,
  tip: string,
  pr: PRInfo | undefined,
  gap: PrEvidenceGap | null,
  git: Git,
): Landing {
  const prHead = pr !== undefined && gap === 'head-moved' ? pr.headOid : null
  return assessLanding(repo, tip, git, prHead)
}

/** True when the verdict is a patch match that the content check agreed with, so no grant is needed. */
export function landingConfirmed(landing: Landing | null): boolean {
  return landing !== null && landing.check !== null && landing.confirmed
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
    facts['landing_content_confirmed'] = landing.confirmed
  } else if (landing.unmatched.length > 0) {
    facts['unmatched_commits'] = landing.unmatched
  }
}

/**
 * The part of a row's reason that says whether the content check agreed, for a
 * patch-equivalent verdict.
 */
export function confirmationNote(landing: Extract<Landing, { check: LandingCheck }>): string {
  return landing.confirmed
    ? 'content confirmed by merge-tree'
    : 'content not confirmed by merge-tree, so abandon-unmerged is required'
}

/** One sentence naming the commits that kept a partly landed branch from counting, or null. */
export function unmatchedSentence(landing: Landing, repo: RepoInfo): string | null {
  if (landing.check !== null || landing.unmatched.length === 0) return null
  return `Part of the work is on \`${landedRef(repo)}\`, but these commits are not (no patch-equivalent commit): ${landing.unmatched.join('; ')}.`
}
