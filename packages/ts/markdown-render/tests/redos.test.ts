/**
 * Catastrophic-backtracking regressions: the payload family that measured the
 * original blowup.
 *
 * Both scanners run synchronously inside a render — the remark visitors inside
 * the unified pipeline — so a matcher that goes superlinear does not degrade
 * the render, it hangs it. Every payload here is a *short* note (a few hundred
 * bytes) that used to cost seconds: before the hardening, the N=120 wikilink
 * payload (244 bytes) cost ~19s, quadrupling every +20 characters.
 *
 * ## These tests assert SHAPE, not milliseconds — do not "simplify" them back
 *
 * The property a ReDoS guard has to prove is that cost stays roughly *linear*
 * in input size. That is a property of the matcher: it reads the same on a
 * fast laptop and on a CI runner sharing a core with three other tasks. Wall
 * clock is a property of the machine, so a millisecond budget flakes for
 * reasons that have nothing to do with the regex: under a concurrent `check`
 * task, one payload's honest cost measured 235ms against a 250ms budget.
 *
 * So the timing tests below climb a ladder of payload sizes and assert the
 * cost multiplier per rung, via {@link assertLinearGrowth}. A linear scanner
 * holds that multiplier near 1; the pre-hardening matcher returns ~140× on the
 * *first* rung of the whitespace ladder and ~4× on the opener ladder. The gap
 * between those is a wide, quiet band that machine speed cannot cross.
 *
 * One absolute ceiling survives, on the whitespace family only; see
 * {@link SANITY_CEILING_MS} for why it is kept and why the opener ladder has
 * none.
 */

import { describe, expect, test } from 'vitest'
import {
  remarkWikilinks,
  remarkEmbeds,
  FIELD_MAX,
  MAX_SCAN_LENGTH,
  type MdNode,
} from '../src/index.ts'
import { html, vaultResolver } from './helpers.ts'

/** How much bigger each rung of a growth ladder is than the one below it. */
const GROWTH_STEP = 4

/**
 * Largest cost multiplier one rung may show over the rung below it.
 *
 * Every rung is timed over the SAME total volume of input — the
 * ×{@link GROWTH_STEP}-smaller payload is scanned {@link GROWTH_STEP} times as
 * often — so a linear scanner spends the same wall time on every rung and the
 * multiplier sits at ~1. A quadratic matcher spends {@link GROWTH_STEP}× more
 * per rung; an exponential one, hundreds.
 *
 * Equalising the windows is not cosmetic. A 25ms window finds an uncontended
 * slot far more often than a 110ms one, so timing one scan per rung quietly
 * flatters the small rung: measured under a 16-way CPU hog, that bias pushed a
 * healthy opener ladder from 4.5 to 6.9 against a ceiling of 8 — i.e. the
 * "machine-independent" assertion was still reading the machine. With the
 * windows equalised the same hogged run reads 1.0–1.6.
 *
 * 2.5 is the geometric midpoint of that 1.6 worst case and the 4.0 a quadratic
 * matcher returns: ~1.6× headroom over an honest scanner, ~1.6× under the
 * cheapest blowup worth catching.
 */
const GROWTH_CEILING = 2.5

/**
 * Windows timed per rung. Contention, GC and the scheduler can only make a
 * window *slower* than the matcher's true cost, never faster, so the minimum
 * is kept — three tries give each rung three chances at a quiet slot on a busy
 * runner. The ratios above are what must stay stable; this is what keeps them
 * stable.
 */
const TIMING_REPS = 3

/**
 * The file's one remaining absolute ceiling, applied per scan to the
 * whitespace ladder only (rungs measured at 0.8µs–20µs a scan, so the headroom
 * is four orders of magnitude — no runner is 12,000× slow).
 *
 * Kept for two reasons a growth ratio cannot cover:
 *
 * 1. A ratio is blind to a constant factor. A matcher that got 100× slower at
 *    *every* size still grows linearly and would sail through
 *    {@link GROWTH_CEILING}; this catches it.
 * 2. It bounds the damage. The whitespace payloads are the exponential family:
 *    under a real regression the ladder's own next rung does not merely run
 *    slow, it does not finish. Failing on the ceiling at the rung below caps
 *    what a broken build costs the suite.
 *
 * The opener ladder deliberately has no ceiling: an honest scan of `[[`×4000
 * legitimately costs ~110ms here, so no absolute number there could be both
 * generous and meaningful. Reason 1 above is already covered by this ceiling
 * on the other family.
 */
const SANITY_CEILING_MS = 250

/**
 * `[[` + N spaces + `|` + N spaces, UNTERMINATED (no closing `]]`). The
 * trailing `x` keeps the whitespace from being trimmed off the end, so the
 * matcher actually walks it.
 */
function ambiguousWhitespace(prefix: string, n: number): string {
  return `${prefix}${' '.repeat(n)}|${' '.repeat(n)}x`
}

/** `[base, base×STEP, base×STEP², …]` — the sizes a growth ladder walks. */
function ladder(base: number, rungs: number): number[] {
  return Array.from({ length: rungs }, (_, i) => base * GROWTH_STEP ** i)
}

/** A one-paragraph tree holding a single text node. */
function paragraphTree(body: string): MdNode {
  return {
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'text', value: body }] }],
  }
}

/** The paragraph's children after a plugin ran over `body`. */
function childrenAfter(run: (tree: MdNode) => unknown, body: string): MdNode[] {
  const tree = paragraphTree(body)
  run(tree)
  return (tree.children as MdNode[])[0]!.children as MdNode[]
}

/** Time one pass of a plugin's transformer over a single-paragraph document. */
function timePlugin(run: (tree: MdNode) => unknown, body: string): number {
  const tree = paragraphTree(body)
  const start = performance.now()
  run(tree)
  return performance.now() - start
}

/**
 * Time `passes` back-to-back scans of `body` as a single window. The trees are
 * built up front so only the scanning is on the clock.
 */
function timeWindow(run: (tree: MdNode) => unknown, body: string, passes: number): number {
  const trees = Array.from({ length: passes }, () => paragraphTree(body))
  const start = performance.now()
  for (const tree of trees) run(tree)
  return performance.now() - start
}

/**
 * Walk a payload family up a ×{@link GROWTH_STEP} ladder and assert that each
 * rung costs less than {@link GROWTH_CEILING} times the rung below it — i.e.
 * that the scanner is (near enough) linear in input size, whatever machine it
 * is measured on.
 *
 * Each rung is timed over the same total volume of input: rung `i` of an
 * `n`-rung ladder is scanned `GROWTH_STEP ** (n - 1 - i)` times, so the bottom
 * rung's window covers as many bytes as the top rung's single scan. See
 * {@link GROWTH_CEILING} for why that equalisation is what makes the ratio
 * survive a loaded runner.
 *
 * The ladder ASCENDS and asserts after every rung, deliberately. A matcher
 * that has gone superlinear fails on the first rung that blows up, so the
 * suite never measures the rung above — which for the whitespace family would
 * not be slow, it would not return. Measuring every rung first and asserting
 * afterwards would turn a regression from a red test into a hung one.
 */
function assertLinearGrowth(
  run: (tree: MdNode) => unknown,
  makeBody: (size: number) => string,
  rungs: readonly number[],
  ceilingMs?: number,
): void {
  // The first pass through a fresh transformer pays regex compilation and JIT
  // warm-up. Spend it on the smallest rung, where it is cheap under any
  // matcher, so it lands in nobody's measurement and skews no ratio.
  timeWindow(run, makeBody(rungs[0]!), 1)

  const top = rungs.length - 1
  let previous = Infinity
  for (const [i, size] of rungs.entries()) {
    const body = makeBody(size)
    const passes = GROWTH_STEP ** (top - i)

    let elapsed = timeWindow(run, body, passes)
    // The absolute ceiling is checked on this first window, ahead of the
    // repeats: it has four orders of magnitude of headroom (see
    // SANITY_CEILING_MS), so no amount of contention breaches it spuriously,
    // and failing here costs the suite one window of a blown-up rung rather
    // than TIMING_REPS of them.
    if (ceilingMs !== undefined) expect(elapsed / passes).toBeLessThan(ceilingMs)
    for (let rep = 1; rep < TIMING_REPS; rep++) {
      elapsed = Math.min(elapsed, timeWindow(run, body, passes))
    }

    expect(elapsed).toBeLessThan(previous * GROWTH_CEILING)
    previous = elapsed
  }
}

describe('redos hardening', () => {
  test('the historical adversarial batch (N=60/80/100/120) stays microseconds, not seconds', () => {
    // The eight scans that measured the original blowup: ~34s before the
    // hardening (wikilinks alone ~19s at N=120), ~0.06ms after. This is the
    // constant-factor half of the guard — reason 1 in SANITY_CEILING_MS — so
    // it is the one place an absolute number is asserted. The measured total
    // sits ~4000× under the ceiling, which is why runner speed cannot reach
    // it; the growth half of the guard is the test below.
    const wikilinks = remarkWikilinks()
    const embeds = remarkEmbeds()
    // Warm-up outside the sum: the first pass pays regex compilation.
    timePlugin(wikilinks, ambiguousWhitespace('[[', 60))
    timePlugin(embeds, ambiguousWhitespace('![[', 60))

    // The running total is asserted inside the loop, not after it. Every term
    // is positive, so that is the same assertion — it just stops at the first
    // scan that busts the ceiling instead of finishing the batch. Restoring
    // the blowup, that is the difference between a 0.6s red test and a 33s
    // one.
    let total = 0
    for (const n of [60, 80, 100, 120]) {
      total += timePlugin(wikilinks, ambiguousWhitespace('[[', n))
      expect(total).toBeLessThan(SANITY_CEILING_MS)
      total += timePlugin(embeds, ambiguousWhitespace('![[', n))
      expect(total).toBeLessThan(SANITY_CEILING_MS)
    }
  })

  // The 30_000 timeout below covers ~1ms of work when the matchers are
  // healthy. The generous budget is for the unhealthy case: a restored blowup
  // spends ~2.6s on the rung that catches it, and it should fail on the
  // assertion — which names the ratio — rather than on the clock, which names
  // nothing. The note sits above the call rather than beside the argument
  // because prettier does not format a comment in that position stably: each
  // run reorders its lines, so the file never converges under `--check`.
  test('ambiguous-whitespace cost grows linearly, not exponentially', () => {
    // The payload family that blew up, walked N=15 → 60 → 240. This is the
    // exponential case: the pre-hardening matcher quadrupled every +20
    // characters, so restoring it reads ~143× (wikilinks) / ~169× (embeds) on
    // the very first rung, against a hardened 0.5–0.9×. The ladder fails
    // there rather than climbing to N=240, where the old matcher would run
    // for hours.
    const rungs = ladder(15, 3)
    assertLinearGrowth(
      remarkWikilinks(),
      (n) => ambiguousWhitespace('[[', n),
      rungs,
      SANITY_CEILING_MS,
    )
    assertLinearGrowth(
      remarkEmbeds(),
      (n) => ambiguousWhitespace('![[', n),
      rungs,
      SANITY_CEILING_MS,
    )
  }, 30_000)

  // ~0.7s healthy; ~4.4s with a restored blowup, which has no ceiling to stop
  // it early (see SANITY_CEILING_MS). Same reasoning as the timeout above:
  // fail on the ratio, not on the clock.
  test('a long run of unterminated openers costs a flat amount per opener', () => {
    // `[[[[[[…` is the polynomial case, not the exponential one: the
    // unbounded lazy field the hardening replaced let every start offset walk
    // to end-of-string, which is quadratic — restoring it reads ~4.0×
    // (wikilinks) / ~4.5× (embeds) per rung, against a hardened ~1.1×.
    //
    // The ladder starts at 1000 openers, not lower, because FIELD_MAX bounds
    // each start offset to a 512-character window: below ~512 openers the
    // string runs out before the window does, so an honest scanner is itself
    // superlinear there and the rung ratio means nothing. From 1000 up, every
    // offset sees a full window and the cost per opener is flat.
    const rungs = ladder(1000, 2)
    assertLinearGrowth(remarkWikilinks(), (k) => '[['.repeat(k), rungs)
    assertLinearGrowth(remarkEmbeds(), (k) => '![['.repeat(k), rungs)
  }, 30_000)

  test('a text node beyond MAX_SCAN_LENGTH is not scanned at all', () => {
    const body = `[[Note]] ${'x'.repeat(MAX_SCAN_LENGTH)}`
    const children = childrenAfter(remarkWikilinks(), body)
    expect(children).toHaveLength(1)
    expect(children[0]!.type).toBe('text')
    expect(children[0]!.value).toBe(body)
  })

  test('a field at exactly FIELD_MAX still tokenizes', () => {
    const target = 'a'.repeat(FIELD_MAX)
    const children = childrenAfter(remarkWikilinks(), `[[${target}]]`)
    expect(children).toHaveLength(1)
    expect(children[0]!.type).toBe('wikilink')

    const alias = 'b'.repeat(FIELD_MAX)
    const aliased = childrenAfter(remarkWikilinks(), `[[Note|${alias}]]`)
    expect(aliased[0]!.type).toBe('wikilink')

    const heading = 'c'.repeat(FIELD_MAX)
    const fragmented = childrenAfter(remarkWikilinks(), `[[Note#${heading}]]`)
    expect(fragmented[0]!.type).toBe('wikilink')
  })

  test('a field longer than FIELD_MAX leaves the whole link as literal text', () => {
    for (const body of [
      `[[${'a'.repeat(FIELD_MAX + 1)}]]`,
      `[[Note|${'b'.repeat(FIELD_MAX + 1)}]]`,
      `[[Note#${'c'.repeat(FIELD_MAX + 1)}]]`,
    ]) {
      // No replacement happened at all: the single text node is untouched.
      const children = childrenAfter(remarkWikilinks(), body)
      expect(children).toHaveLength(1)
      expect(children[0]!.type).toBe('text')
      expect(children[0]!.value).toBe(body)
    }
  })

  test('an embed field longer than FIELD_MAX leaves the embed as literal text', () => {
    const body = `![[${'a'.repeat(FIELD_MAX + 1)}.png]]`
    const children = childrenAfter(remarkEmbeds(), body)
    expect(children).toHaveLength(1)
    expect(children[0]!.type).toBe('text')
  })

  test('padding inside a well-formed link is still trimmed off', async () => {
    // The pattern no longer strips whitespace, so the trimming happens at the
    // use sites. Same output either way.
    const out = await html('[[  Note  #  Section  |  Alias  ]]', {
      resolveLink: vaultResolver(['Note']),
    })
    expect(out).toContain('data-wikilink="Note"')
    expect(out).toContain('data-heading="Section"')
    expect(out).toContain('>Alias</a>')
  })

  test('padding inside a well-formed embed is still trimmed off', async () => {
    const out = await html('![[  a.png  |  Some Alt  ]]', {
      resolveLink: vaultResolver(['a.png']),
    })
    expect(out).toContain('data-embed-target="a.png"')
    expect(out).toContain('data-embed-display="Some Alt"')
  })
})
