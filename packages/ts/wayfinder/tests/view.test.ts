/**
 * The status bar's two "something is not what it looks like" spans.
 *
 * `view.ts` is browser code, so almost nothing in it is reachable without a
 * DOM. These two are, because they are pure string builders over `state` —
 * and they are the two that MUST keep working, because each exists to stop
 * the page misleading someone about what it is showing them.
 *
 * The withheld case is covered because the page must say AT REST that a runner
 * was held back. A tab badge, its tooltip, the per-runner modal and the picker
 * are all behind a hover or a click; with only those, the page shows a shorter
 * catalog and claims nothing is wrong.
 */
import { beforeEach, describe, expect, test } from 'vitest'
import type { RunnerReport } from '@osdlc/system-model/detect'

import { state } from '../src/web/state.ts'
import { withheldLabel } from '../src/vocabulary.ts'
import { cacheSpan, renderSortHead, withheldBar } from '../src/web/view.ts'

function report(runner: string, skippedForExec: boolean): RunnerReport {
  return {
    runner,
    chain: [{ label: 'runner', hint: 'the runner' }],
    skippedForExec,
    status: skippedForExec ? 'absent' : 'ok',
    tasks: [],
    diagnostics: [],
  }
}

describe('withheldBar', () => {
  beforeEach(() => {
    state.trustable = false
  })

  test('says nothing when nothing was held back', () => {
    expect(withheldBar([report('just', false)])).toBe('')
  })

  test('names the runners, not just how many', () => {
    // "3 runners" invites exactly the question the sentence should answer.
    const html = withheldBar([report('moon', true), report('just', false), report('sbt', true)])
    expect(html).toContain('2 runners withheld')
    expect(html).toContain('moon, sbt')
    expect(html).not.toContain('just')
  })

  test('agrees with itself about one runner', () => {
    expect(withheldBar([report('moon', true)])).toContain('1 runner withheld')
  })

  test('offers the grant only when trust is what is missing', () => {
    // Execution off for the session: trusting the repository would change
    // nothing, so offering it would be a wrong instruction.
    expect(withheldBar([report('moon', true)])).not.toContain('data-trust-repo')
    expect(withheldBar([report('moon', true)])).toContain(withheldLabel('exec-off'))

    state.trustable = true
    const html = withheldBar([report('moon', true)])
    expect(html).toContain('data-trust-repo')
    expect(html).toContain(withheldLabel('untrusted'))
  })

  test('marks the runners as the subject of the sentence', () => {
    state.trustable = true
    expect(withheldBar([report('moon', true)])).toContain('class="who"')
  })
})

describe('cacheSpan', () => {
  test('says nothing when every runner is fresh', () => {
    // A span that is always present is a span nobody reads.
    expect(cacheSpan([{ runner: 'moon', state: 'fresh', estimateMs: null, slow: false }])).toBe('')
  })

  test('separates a slow runner, which is the case the cache exists for', () => {
    const slow = cacheSpan([
      { runner: 'moon', state: 'stale', ageMs: 7_200_000, estimateMs: 6200, slow: true },
    ])
    expect(slow).toContain('slow to probe here')
    expect(slow).toContain('~6.2s')

    const ordinary = cacheSpan([
      { runner: 'just', state: 'stale', ageMs: 7_200_000, estimateMs: 5, slow: false },
    ])
    expect(ordinary).toContain('re-probing')
    expect(ordinary).not.toContain('slow to probe here')
  })

  test('admits when it has never timed a runner rather than inventing a number', () => {
    const html = cacheSpan([
      { runner: 'moon', state: 'stale', ageMs: 1000, estimateMs: null, slow: true },
    ])
    expect(html).toContain('never timed here')
  })
})

describe('renderSortHead', () => {
  test('puts each column over the thing it orders by', () => {
    // A header column's job beyond being clickable is naming what is underneath
    // it, so the order here must be the order the row itself uses: checkbox,
    // name, count.
    const html = renderSortHead()
    const at = (key: string) => html.indexOf(`data-sort-runners="${key}"`)

    expect(at('shown')).toBeGreaterThan(-1)
    expect(at('shown')).toBeLessThan(at('name'))
    expect(at('name')).toBeLessThan(at('count'))
  })

  test("repeats the row's drag handle so the columns start where the row does", () => {
    // The same element and character as the row's grip, hidden by CSS, rather
    // than a width guessed to match it.
    const html = renderSortHead()
    expect(html.indexOf('class="grip"')).toBeLessThan(html.indexOf('data-sort-runners'))
    expect(html).toContain('\u283F')
  })
})
