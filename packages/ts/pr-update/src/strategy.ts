/**
 * How to bring one out-of-date PR up to date: rebase, merge, or leave alone.
 *
 * Rebase is the default. On a repository whose PRs have no review threads it
 * costs nothing, and it keeps each PR's diff to exactly its own commits. That
 * matters most in a stack, where a merge leaves every descendant with one
 * merge commit per ancestor update.
 *
 * The cost of a rebase is a force-push, and the guards are about that.
 * `--force-with-lease` compares against the remote, so it does not notice a
 * checkout holding commits nobody has pushed. Rebasing over that loses the
 * work with no warning. So the unpushed-work guard is checked before anything
 * else, and no override turns it off. The other two guards are preferences,
 * and an explicit override beats them.
 *
 * Guards only step down, from rebase to merge or to skip. No guard turns a
 * configured `merge` into a rebase.
 */

import type { PrUpdateConfig } from './config.ts'

/** What to do with a PR that is behind its base. */
export type Strategy = 'rebase' | 'merge' | 'skip'

/** Everything the decision reads. Gathered by the caller, never fetched here. */
export interface StrategySignals {
  /** The PR's base branch name, matched against an override's `base` glob. */
  base: string
  labels: readonly string[]
  /** Commits ahead of base, which is how many a rebase would replay. Null when unknown. */
  ahead: number | null
  /** Submitted reviews. Rebasing outdates the threads anchored to them. */
  reviews: number
  /** The head branch is checked out somewhere holding unpushed commits. */
  unpushedLocal: boolean
  /**
   * The head branch lives in a fork, so it is not on this repository's
   * `origin` and this run cannot push to it.
   */
  crossRepo: boolean
}

export interface StrategyDecision {
  strategy: Strategy
  /** Which rule decided, so the report shows why for every outcome. */
  rule:
    | 'guard:fork'
    | 'guard:unpushed-local'
    | 'override'
    | 'guard:reviewed'
    | 'guard:max-rebase-commits'
    | 'default'
  reason: string
}

const RX_SPECIAL = /[.+?^${}()|[\]\\]/g

/**
 * Glob match for a branch name: `*` spans a path segment, `**` spans any.
 *
 * So `release/*` matches `release/1.2` but not `release/1.2/hotfix`, which is
 * what a caller naming a release line expects.
 *
 * The name says "branch" so it is not confused with a filesystem glob matcher.
 */
export function branchMatchesGlob(pattern: string, value: string): boolean {
  let rx = ''
  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern[i] === '*') {
      if (pattern[i + 1] === '*') {
        rx += '.*'
        i += 1
      } else {
        rx += '[^/]*'
      }
      continue
    }
    rx += pattern[i]!.replace(RX_SPECIAL, (m) => `\\${m}`)
  }
  return new RegExp(`^${rx}$`).test(value)
}

type OverrideRule = PrUpdateConfig['overrides'][number]

/** The first override whose declared fields all match, or null. */
export function matchOverride(
  signals: StrategySignals,
  overrides: readonly OverrideRule[],
): OverrideRule | null {
  for (const rule of overrides) {
    // A rule with neither field would match every PR. Ignore it, rather than
    // treat it as a global default nobody wrote on purpose.
    if (rule.base === undefined && rule.label === undefined) continue
    if (rule.base !== undefined && !branchMatchesGlob(rule.base, signals.base)) continue
    if (rule.label !== undefined && !signals.labels.includes(rule.label)) continue
    return rule
  }
  return null
}

/** Decide what to do with one PR. Pure. */
export function chooseStrategy(signals: StrategySignals, cfg: PrUpdateConfig): StrategyDecision {
  // 0. What can be pushed at all, before safety and preference. A fork's head
  //    branch is on the contributor's remote, not this one, so neither a
  //    rebase nor a merge can be pushed there. Any other decision would be a
  //    plan that cannot run.
  if (signals.crossRepo) {
    return {
      strategy: 'skip',
      rule: 'guard:fork',
      reason: 'head branch is in a fork; it cannot be pushed from here',
    }
  }

  // 1. Data safety, before every preference. A force-push cannot be undone
  //    from here, and the work it would lose is not on any remote.
  if (signals.unpushedLocal) {
    return {
      strategy: cfg.guards.unpushed_local,
      rule: 'guard:unpushed-local',
      reason:
        cfg.guards.unpushed_local === 'skip'
          ? 'head branch is checked out elsewhere with unpushed commits'
          : 'merging rather than rewriting: unpushed commits exist in another checkout',
    }
  }

  // 2. Explicit intent beats the preference guards below.
  const override = matchOverride(signals, cfg.overrides)
  if (override !== null) {
    const on = override.base !== undefined ? `base ${override.base}` : `label ${override.label}`
    return { strategy: override.strategy, rule: 'override', reason: `override on ${on}` }
  }

  // 3. Preferences. They only step down from a rebase.
  if (cfg.strategy === 'rebase') {
    if (signals.reviews > 0) {
      const noun = signals.reviews === 1 ? 'review' : 'reviews'
      return {
        strategy: cfg.guards.reviewed,
        rule: 'guard:reviewed',
        reason: `${signals.reviews} submitted ${noun} would be outdated by a rewrite`,
      }
    }
    const cap = cfg.guards.max_rebase_commits
    if (cap > 0 && signals.ahead !== null && signals.ahead > cap) {
      return {
        strategy: 'merge',
        rule: 'guard:max-rebase-commits',
        reason: `${signals.ahead} commits to replay, over the ${cap} limit`,
      }
    }
  }

  return { strategy: cfg.strategy, rule: 'default', reason: `project default (${cfg.strategy})` }
}
