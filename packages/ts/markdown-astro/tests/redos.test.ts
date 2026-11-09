/**
 * Catastrophic-backtracking regressions.
 *
 * Both scanners run synchronously inside a build — the remark visitor inside
 * Astro's markdown pipeline, `rewriteFile` inside the vault export — so a
 * superlinear matcher hangs the build. The budget below guards against
 * performance regressions on short notes and is generous enough not to flake
 * on a loaded CI box.
 */

import { test } from 'vitest'
import assert from 'node:assert/strict'
import { remarkWikilinks } from '../src/remark-wikilinks.ts'
import { rewriteFile } from '../src/rewrite.ts'
import type { AssetIndex } from '../src/assets.ts'

/** Wall-clock ceiling for one scan of a pathological note. */
const BUDGET_MS = 500

/**
 * `[[` + N spaces + `|` + N spaces, UNTERMINATED (no closing `]]`). The
 * trailing `x` keeps the whitespace from being trimmed off the end, so the
 * matcher actually walks it. At N=100 this is a 201-byte note that cost ~7.9s
 * through `remarkWikilinks` and ~1.1s through `rewriteFile` before the fix.
 */
function ambiguousWhitespace(prefix: string, n: number): string {
  return `${prefix}${' '.repeat(n)}|${' '.repeat(n)}x`
}

/** A stub index that mimics flat `_attachments` (every asset by basename). */
const flatIndex: AssetIndex = {
  resolve(target) {
    const file = target.split('#')[0]!.split('/').pop() ?? target
    return { vaultPath: `_attachments/${file}`, outSub: file, resolved: true }
  },
}

/** Time one pass of the remark visitor over a single-paragraph document. */
function timeWikilinks(body: string): number {
  const run = remarkWikilinks({
    collections: [],
    warnOnCollision: false,
    danglingRefPolicy: 'warn',
  })
  const tree = {
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'text', value: body }] }],
  }
  const start = performance.now()
  run(tree)
  return performance.now() - start
}

/** Time one vault -> Astro rewrite of a note body (drives the embed scan). */
function timeEmbeds(body: string): number {
  const start = performance.now()
  rewriteFile(body, {
    direction: 'toAstro',
    publicBase: '/_media',
    frontmatterAssets: [],
    assetIndex: flatIndex,
  })
  return performance.now() - start
}

/** Time one rewrite of a frontmatter asset value (drives the fm `[[..]]` RE). */
function timeFrontmatter(value: string): number {
  const text = `---\ncover: "${value}"\n---\nbody\n`
  const start = performance.now()
  rewriteFile(text, {
    direction: 'toAstro',
    publicBase: '/_media',
    frontmatterAssets: ['cover'],
    assetIndex: flatIndex,
  })
  return performance.now() - start
}

test('redos: an unterminated [[ padded with whitespace scans inside the budget', () => {
  const payload = ambiguousWhitespace('[[', 120)
  assert.ok(payload.length < 300, 'payload is a short note, not a big one')
  const ms = timeWikilinks(payload)
  assert.ok(ms < BUDGET_MS, `wikilink scan took ${ms.toFixed(1)}ms (budget ${BUDGET_MS}ms)`)
})

test('redos: wikilink runtime stays flat as the payload grows', () => {
  // The blowup showed up as a doubling every +10 characters; a linear scan
  // barely moves. Comparing 60 against 200 tells those apart without
  // asserting an absolute number.
  const small = timeWikilinks(ambiguousWhitespace('[[', 60))
  const large = timeWikilinks(ambiguousWhitespace('[[', 200))
  assert.ok(large < BUDGET_MS, `large payload took ${large.toFixed(1)}ms`)
  assert.ok(large < small + BUDGET_MS, 'runtime grew superlinearly with payload size')
})

test('redos: a long run of unterminated openers stays cheap', () => {
  const ms = timeWikilinks('[['.repeat(5000))
  assert.ok(ms < BUDGET_MS, `5000 unterminated openers took ${ms.toFixed(1)}ms`)
})

test('redos: an unterminated ![[ padded with whitespace rewrites inside the budget', () => {
  const ms = timeEmbeds(ambiguousWhitespace('![[', 120))
  assert.ok(ms < BUDGET_MS, `embed rewrite took ${ms.toFixed(1)}ms (budget ${BUDGET_MS}ms)`)
})

test('redos: embed runtime stays flat as the payload grows', () => {
  const small = timeEmbeds(ambiguousWhitespace('![[', 60))
  const large = timeEmbeds(ambiguousWhitespace('![[', 200))
  assert.ok(large < BUDGET_MS, `large payload took ${large.toFixed(1)}ms`)
  assert.ok(large < small + BUDGET_MS, 'runtime grew superlinearly with payload size')
})

test('redos: an unterminated [[ frontmatter asset value stays inside the budget', () => {
  // This one is anchored, so it went cubic rather than worse — it needed a
  // longer value to bite (~3.5s at 1600 spaces).
  const ms = timeFrontmatter(ambiguousWhitespace('[[', 1600))
  assert.ok(ms < BUDGET_MS, `frontmatter rewrite took ${ms.toFixed(1)}ms (budget ${BUDGET_MS}ms)`)
})

test('redos: padding inside a well-formed link is still trimmed off', () => {
  // The pattern does not strip whitespace from the fields; the use site trims
  // them, so the output is still trimmed.
  const run = remarkWikilinks({
    collections: [],
    warnOnCollision: false,
    danglingRefPolicy: 'warn',
  })
  const tree: any = {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [{ type: 'text', value: '[[  Note  #  Section  |  Alias  ]]' }],
      },
    ],
  }
  run(tree)
  const node = tree.children[0].children[0]
  assert.equal(node.type, 'html')
  assert.match(node.value, /data-wikilink="note"/)
  assert.match(node.value, />Alias</)
})

test('redos: padding inside a well-formed embed is still trimmed off', () => {
  const out = rewriteFile('![[  a.jpg  |  Some Alt  ]]', {
    direction: 'toAstro',
    publicBase: '/_media',
    frontmatterAssets: [],
    assetIndex: flatIndex,
  })
  assert.equal(out.text, '![Some Alt](/_media/a.jpg)')
})

test('redos: a very long field is scanned within the budget', () => {
  const run = remarkWikilinks({
    collections: [],
    warnOnCollision: false,
    danglingRefPolicy: 'warn',
  })
  const tree: any = {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [{ type: 'text', value: `[[${'a'.repeat(100_000)}]]` }],
      },
    ],
  }
  // Whether the scanner reads the field or leaves it as text is its own bound to set. The
  // build must not hang on it, and must not throw.
  const warn = console.warn
  console.warn = () => {}
  const start = performance.now()
  try {
    run(tree)
  } finally {
    console.warn = warn
  }
  assert.ok(performance.now() - start < BUDGET_MS)
})
