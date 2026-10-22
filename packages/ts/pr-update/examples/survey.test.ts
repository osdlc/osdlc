/**
 * The README's library example, through the package name only: survey a
 * stack of two PRs with a fake `git` and a fake code host, so nothing touches
 * the network or a real repository.
 */

import type { CommandResult, CommandRunner } from '@osdlc/command-seam'
import type { CodeHost, CodeHostPrDetail } from '@osdlc/code-host'
import { expect, test } from 'vitest'

import { chooseStrategy, prUpdateConfigSchema, runSurvey, standalonePorts } from '@osdlc/pr-update'

const ok = (stdout: string): CommandResult => ({ exitCode: 0, stdout, stderr: '' })

function pr(number: number, head: string, base: string): CodeHostPrDetail {
  return {
    number,
    title: `PR ${number}`,
    url: `https://github.com/acme/widgets/pull/${number}`,
    baseRef: base,
    headRef: head,
    headSha: null,
    isDraft: false,
    labels: [],
    reviewCount: 0,
    isCrossRepository: false,
  }
}

/** A `git` where every branch is 2 behind and 1 ahead of its base, and merges are clean. */
const git: CommandRunner = {
  run(argv) {
    if (argv.join(' ') === 'remote get-url origin') return ok('git@github.com:acme/widgets.git\n')
    if (argv[0] === 'rev-list') return ok('2\t1\n')
    if (argv[0] === 'merge-tree') return ok('abc123\x00')
    if (argv[0] === 'rev-parse') return ok(`${'b'.repeat(40)}\n`)
    return ok('')
  },
}

const codeHost = {
  listPrDetails: () => ({
    ok: true,
    value: [pr(2, 'task/b', 'task/a'), pr(1, 'task/a', 'main')],
  }),
} as unknown as CodeHost

test('survey a stack: the parent is updated first, the child waits on it', () => {
  const report = runSurvey(
    { repo: [], pr: [], noFetch: false, noDrafts: false, limit: 100, remote: 'origin' },
    {
      projectRoot: '/repo',
      dryRun: false,
      git,
      gh: git,
      codeHost: () => codeHost,
      cfg: prUpdateConfigSchema.parse({}),
      ports: { ...standalonePorts(), locate: () => '/repo' },
    },
  )

  expect(report.prs.map((row) => row.number)).toEqual([1, 2])
  const [parent, child] = report.prs
  expect(parent).toMatchObject({ behind: 2, ahead: 1, parent: null, blockedBy: null })
  expect(child).toMatchObject({ parent: 1, blockedBy: 1, status: 'blocked' })
})

test('the strategy for a PR is chosen from signals, not hard-coded', () => {
  const cfg = prUpdateConfigSchema.parse({})
  const decision = chooseStrategy(
    { base: 'main', labels: [], ahead: 1, reviews: 0, unpushedLocal: false, crossRepo: false },
    cfg,
  )
  expect(decision.strategy).toBe('rebase')

  // A branch holding unpushed local commits is never rebased over: the guard
  // outranks every preference.
  const guarded = chooseStrategy(
    { base: 'main', labels: [], ahead: 1, reviews: 0, unpushedLocal: true, crossRepo: false },
    cfg,
  )
  expect(guarded.strategy).not.toBe('rebase')
})
