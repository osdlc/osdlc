/**
 * `push` against output recorded from real git, one file per git version.
 *
 * The files under `tests/fixtures/push/` are written by `record-push.mjs`.
 * Every file must read the same way: that is the point of a typed rejection.
 * git 2.51 reworded the remote's reasons, so the fixtures must include a git
 * from before and from that release. A new git version that words a reason
 * differently fails here until `pushRejection` in `src/verbs.ts` maps it.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

import { FailureError } from '@osdlc/result'

import {
  Git,
  PUSH_REJECTIONS,
  type PushFlag,
  type PushRejection,
  type PushReport,
} from '../src/index.ts'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'push')

interface Fixture {
  git: string
  cases: Array<{ name: string; argv: string[]; exitCode: number; stdout: string; stderr: string }>
}

const fixtures: Fixture[] = readdirSync(FIXTURES)
  .filter((f) => /^git-.*\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(join(FIXTURES, f), 'utf8')) as Fixture)

/** Per ref: the destination, the flag, and the rejection when refused. */
type Expected = 'throws' | Array<[dst: string, flag: PushFlag, rejection?: PushRejection]>

const EXPECTED: Record<string, Expected> = {
  'up-to-date': [['refs/heads/main', '=']],
  'fast-forward': [['refs/heads/main', ' ']],
  'non-fast-forward': [['refs/heads/main', '!', 'non-fast-forward']],
  'stale-lease': [['refs/heads/main', '!', 'stale']],
  'forced-with-lease': [['refs/heads/main', '+']],
  'new-branch': [['refs/heads/created', '*']],
  deleted: [['refs/heads/created', '-']],
  'tag-already-exists': [['refs/tags/v1', '!', 'tag-exists']],
  'ref-conflict': [['refs/heads/x', '!', 'ref-conflict']],
  'lease-race-moved': [['refs/heads/race', '!', 'lock-failed']],
  'lease-race-created': [['refs/heads/fresh', '!', 'already-exists']],
  'pre-receive-declined': [['refs/heads/hooked', '!', 'hook-declined']],
  'update-hook-declined': [['refs/heads/hooked', '!', 'hook-declined']],
  mixed: [
    ['refs/heads/mixed', '*'],
    ['refs/heads/holder', '!', 'non-fast-forward'],
  ],
  atomic: [
    ['refs/heads/atomic', '!', 'atomic-failed'],
    ['refs/heads/x', '!', 'atomic-failed'],
  ],
  'src-refspec-matches-nothing': 'throws',
  'no-such-remote': 'throws',
}

/** A client whose every git call answers with one recorded case. */
function replaying(c: Fixture['cases'][number]): Git {
  return new Git('/repo', {
    runner: { run: () => ({ exitCode: c.exitCode, stdout: c.stdout, stderr: c.stderr }) },
  })
}

function summarise(report: PushReport): Expected {
  return report.refs.map((r) =>
    r.flag === '!' ? [r.dst, r.flag, r.rejection] : ([r.dst, r.flag] as [string, PushFlag]),
  )
}

describe('push — recorded git output', () => {
  test('covers git before and from 2.51, where the remote reasons changed', () => {
    const minors = fixtures.map((f) => f.git.split('.').map(Number))
    const before = minors.some(([major, minor]) => major === 2 && minor! < 51)
    const from = minors.some(([major, minor]) => major! > 2 || minor! >= 51)
    expect({ before, from }).toEqual({ before: true, from: true })
  })

  test('every recorded case has an expectation, and every expectation a case', () => {
    for (const fixture of fixtures) {
      expect(fixture.cases.map((c) => c.name).sort()).toEqual(Object.keys(EXPECTED).sort())
    }
  })

  for (const fixture of fixtures) {
    describe(`git ${fixture.git}`, () => {
      test.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (name, c) => {
        const git = replaying(c)
        if (EXPECTED[name] === 'throws') {
          expect(() => git.push('origin', 'HEAD:x')).toThrow(FailureError)
          return
        }
        expect(summarise(git.push('origin', 'HEAD:x'))).toEqual(EXPECTED[name])
      })
    })
  }

  test("a ref-name clash keeps the remote's lock error as the detail", () => {
    for (const fixture of fixtures) {
      const c = fixture.cases.find((x) => x.name === 'ref-conflict')!
      expect(replaying(c).push('origin', 'HEAD:x').refs[0]!.detail).toBe(
        "cannot lock ref 'refs/heads/x': 'refs/heads/x/child' exists; cannot create 'refs/heads/x'",
      )
    }
  })
})

describe('PUSH_REJECTIONS', () => {
  // A Record, so a new rejection kind is a compile error here until listed.
  const KINDS: Record<PushRejection, true> = {
    stale: true,
    'non-fast-forward': true,
    'tag-exists': true,
    'already-exists': true,
    'ref-conflict': true,
    'lock-failed': true,
    'hook-declined': true,
    'atomic-failed': true,
    other: true,
  }

  test('has an entry for every rejection, each linking git documentation', () => {
    expect(Object.keys(PUSH_REJECTIONS).sort()).toEqual(Object.keys(KINDS).sort())
    for (const info of Object.values(PUSH_REJECTIONS)) {
      expect(info.message).toMatch(/\.$/)
      expect(info.explanation).not.toBe('')
      expect(info.hint).toMatch(/\.$/)
      expect(info.docs).toMatch(/^https:\/\/git-scm\.com\/docs\/[a-z-]+#\S+$/)
    }
  })

  test('is frozen', () => {
    expect(Object.isFrozen(PUSH_REJECTIONS)).toBe(true)
  })

  test("the README's rejection reference has one entry per rejection, with its docs link", () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
    const from = readme.indexOf('### Rejection reference')
    const section = readme.slice(from, readme.indexOf('\n## ', from))
    const entries = section.split('\n\n').filter((b) => b.startsWith('**`'))
    const links = Object.fromEntries(
      entries.map((b) => [/^\*\*`([a-z-]+)`\*\*/.exec(b)![1], /\]\((\S+)\)\s*$/.exec(b)![1]]),
    )
    expect(links).toEqual(
      Object.fromEntries(Object.entries(PUSH_REJECTIONS).map(([kind, info]) => [kind, info.docs])),
    )
  })
})
