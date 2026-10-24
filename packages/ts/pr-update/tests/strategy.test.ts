/**
 * The rebase/merge decision.
 *
 * The config comes from `prUpdateConfigSchema.parse({})`, not a literal, so
 * these tests check the real shipped defaults. If a default changes, the test
 * that depends on it fails, instead of testing an old copy.
 */

import { describe, expect, test } from 'vitest'

import { prUpdateConfigSchema, type PrUpdateConfig } from '../src/config.ts'
import {
  chooseStrategy,
  branchMatchesGlob,
  matchOverride,
  type StrategySignals,
} from '../src/strategy.ts'

function defaults(): PrUpdateConfig {
  return prUpdateConfigSchema.parse({})
}

/** Defaults with a few keys replaced. */
function cfg(patch: Record<string, unknown> = {}): PrUpdateConfig {
  return { ...defaults(), ...patch } as PrUpdateConfig
}

function signals(patch: Partial<StrategySignals> = {}): StrategySignals {
  return {
    base: 'main',
    labels: [],
    ahead: 3,
    reviews: 0,
    unpushedLocal: false,
    crossRepo: false,
    ...patch,
  }
}

describe('the shipped defaults', () => {
  test('rebase, with the unpushed-work guard set to skip', () => {
    const d = defaults()
    expect(d.strategy).toBe('rebase')
    expect(d.guards.unpushed_local).toBe('skip')
    expect(d.guards.reviewed).toBe('merge')
  })

  test('an ordinary behind PR rebases', () => {
    const out = chooseStrategy(signals(), defaults())
    expect(out.strategy).toBe('rebase')
    expect(out.rule).toBe('default')
  })
})

describe('a fork PR is never planned', () => {
  test('it outranks every other rule, including an override', () => {
    // The run cannot push to the contributor's branch, so any plan but skip
    // is one that cannot run.
    const out = chooseStrategy(
      signals({ crossRepo: true }),
      cfg({ overrides: [{ base: 'main', strategy: 'rebase' }] }),
    )
    expect(out.strategy).toBe('skip')
    expect(out.rule).toBe('guard:fork')
  })

  test('it outranks the unpushed-work guard too', () => {
    const d = defaults()
    const out = chooseStrategy(
      signals({ crossRepo: true, unpushedLocal: true }),
      cfg({ guards: { ...d.guards, unpushed_local: 'merge' } }),
    )
    expect(out.rule).toBe('guard:fork')
  })
})

describe('the unpushed-work guard is not negotiable', () => {
  test('it beats an override that asks for a rebase', () => {
    // --force-with-lease compares against the remote, which is unchanged, so
    // nothing else in the system would catch this.
    const out = chooseStrategy(
      signals({ unpushedLocal: true }),
      cfg({ overrides: [{ base: 'main', strategy: 'rebase' }] }),
    )
    expect(out.strategy).toBe('skip')
    expect(out.rule).toBe('guard:unpushed-local')
  })

  test('configured to merge, it updates without rewriting', () => {
    const d = defaults()
    const out = chooseStrategy(
      signals({ unpushedLocal: true }),
      cfg({ guards: { ...d.guards, unpushed_local: 'merge' } }),
    )
    expect(out.strategy).toBe('merge')
    expect(out.rule).toBe('guard:unpushed-local')
  })
})

describe('overrides', () => {
  test('beat the preference guards', () => {
    const out = chooseStrategy(
      signals({ reviews: 4 }),
      cfg({ overrides: [{ base: 'main', strategy: 'rebase' }] }),
    )
    expect(out.strategy).toBe('rebase')
    expect(out.rule).toBe('override')
  })

  test('first match wins', () => {
    const out = chooseStrategy(
      signals({ labels: ['keep-history'] }),
      cfg({
        overrides: [
          { label: 'keep-history', strategy: 'merge' },
          { base: 'main', strategy: 'skip' },
        ],
      }),
    )
    expect(out.strategy).toBe('merge')
  })

  test('a rule declaring nothing is inert, not a global default', () => {
    expect(matchOverride(signals(), [{ strategy: 'skip' }])).toBeNull()
  })

  test('every declared field must match', () => {
    const rules = [{ base: 'main', label: 'urgent', strategy: 'merge' as const }]
    expect(matchOverride(signals({ labels: [] }), rules)).toBeNull()
    expect(matchOverride(signals({ labels: ['urgent'] }), rules)).not.toBeNull()
  })
})

describe('preference guards step down from rebase', () => {
  test('a reviewed PR merges, so its threads stay anchored', () => {
    const out = chooseStrategy(signals({ reviews: 8 }), defaults())
    expect(out.strategy).toBe('merge')
    expect(out.rule).toBe('guard:reviewed')
    expect(out.reason).toContain('8 submitted reviews')
  })

  test('one review reads as singular', () => {
    expect(chooseStrategy(signals({ reviews: 1 }), defaults()).reason).toContain(
      '1 submitted review would',
    )
  })

  test('a long branch merges rather than replaying every commit', () => {
    const out = chooseStrategy(signals({ ahead: 21 }), defaults())
    expect(out.strategy).toBe('merge')
    expect(out.rule).toBe('guard:max-rebase-commits')
  })

  test('exactly at the limit still rebases', () => {
    expect(chooseStrategy(signals({ ahead: 20 }), defaults()).strategy).toBe('rebase')
  })

  test('an unmeasurable ahead count does not trip the limit', () => {
    expect(chooseStrategy(signals({ ahead: null }), defaults()).strategy).toBe('rebase')
  })

  test('a zero limit disables the guard', () => {
    const d = defaults()
    const out = chooseStrategy(
      signals({ ahead: 500 }),
      cfg({ guards: { ...d.guards, max_rebase_commits: 0 } }),
    )
    expect(out.strategy).toBe('rebase')
  })

  test('they never turn a configured merge into a rebase', () => {
    // The guards exist to avoid rewriting history, never to start.
    for (const s of [signals(), signals({ reviews: 5 }), signals({ ahead: 99 })]) {
      expect(chooseStrategy(s, cfg({ strategy: 'merge' })).strategy).toBe('merge')
    }
  })
})

describe('branchMatchesGlob', () => {
  test('a single star spans one path segment', () => {
    expect(branchMatchesGlob('release/*', 'release/1.2')).toBe(true)
    expect(branchMatchesGlob('release/*', 'release/1.2/hotfix')).toBe(false)
  })

  test('a double star spans separators', () => {
    expect(branchMatchesGlob('release/**', 'release/1.2/hotfix')).toBe(true)
  })

  test('regex metacharacters in a branch name are literal', () => {
    expect(branchMatchesGlob('feat/a.b', 'feat/a.b')).toBe(true)
    expect(branchMatchesGlob('feat/a.b', 'feat/axb')).toBe(false)
  })

  test('anchored at both ends', () => {
    expect(branchMatchesGlob('main', 'main')).toBe(true)
    expect(branchMatchesGlob('main', 'not-main')).toBe(false)
    expect(branchMatchesGlob('main', 'main-2')).toBe(false)
  })
})
