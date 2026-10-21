/**
 * How to bring one out-of-date PR up to date: rebase, merge, or leave alone.
 *
 * Rebase is the default because on a repository whose PRs carry no review
 * threads it costs nothing and keeps each PR's diff exactly its own commits —
 * which matters most in a stack, where a merge leaves every descendant
 * carrying one merge commit per ancestor update.
 *
 * What rebase does cost is a force-push, and that is what the guards are
 * about. `--force-with-lease` compares against the *remote*, so it does not
 * notice a checkout holding commits nobody has pushed; rebasing over that
 * orphans the work with no warning. So the unpushed-work guard is checked
 * before anything else and no override defeats it. The other two guards are
 * preferences, and an explicit override beats them.
 *
 * Guards only ever step down from rebase. Nothing here turns a configured
 * `merge` into a rebase.
 */

import type { PrUpdateConfig } from './config.ts'

/** What to do with a PR that is behind its base. */
export type Strategy = 'rebase' | 'merge' | 'skip'

/** Everything the decision reads. Gathered by the caller, never fetched here. */
export interface StrategySignals {
  /** The PR's base branch name, matched against an override's `base` glob. */
  base: string
  labels: readonly string[]
  /** Commits ahead of base — how many a rebase would replay. Null when unknown. */
  ahead: number | null
  /** Submitted reviews. Rebasing outdates the threads anchored to them. */
  reviews: number
  /** The head branch is checked out somewhere holding unpushed commits. */
  unpushedLocal: boolean
  /**
   * The head branch lives in a fork, so it is not on this repository's
   * `origin` and we have no write access to it.
   */
  crossRepo: boolean
}

export interface StrategyDecision {
  strategy: Strategy
  /** Which rule decided, so every outcome in the report is auditable. */
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
 * what a caller pinning a release line expects.
 *
 * Named for branches rather than the shorter `globMatches` because a same-
 * named filesystem-glob matcher next to it would be a trap.
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
    // A rule declaring neither field would match every PR. Treat it as inert
    // rather than as a silent global default nobody wrote on purpose.
    if (rule.base === undefined && rule.label === undefined) continue
    if (rule.base !== undefined && !branchMatchesGlob(rule.base, signals.base)) continue
    if (rule.label !== undefined && !signals.labels.includes(rule.label)) continue
    return rule
  }
  return null
}

/** Decide what to do with one PR. Pure. */
export function chooseStrategy(signals: StrategySignals, cfg: PrUpdateConfig): StrategyDecision {
  // 0. Capability, before safety and preference alike. A fork's head branch
  //    is on the contributor's remote, not ours; neither a rebase nor a merge
  //    can be pushed there. Deciding anything else would be a plan that
  //    cannot run.
  if (signals.crossRepo) {
    return {
      strategy: 'skip',
      rule: 'guard:fork',
      reason: 'head branch is in a fork; it cannot be pushed from here',
    }
  }

  // 1. Data safety, ahead of every preference. A force-push cannot be undone
  //    from here, and the work it would orphan is not in any remote.
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

  // 3. Preferences. They only ever step down from a rebase.
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
