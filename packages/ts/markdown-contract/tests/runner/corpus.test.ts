/**
 * Peer test for the corpus runner's glob matching (`compileMatcher`).
 *
 * The contract this pins, as input → exact output: a single `**\/`-prefixed include glob matches
 * a file at ANY depth — the run root AND nested directories alike — so a config needs only one
 * entry per rule (no separate bare `X-*.md` for root-level files). It drives the runner's own
 * matcher, so it fails loudly if `**\/` ever stops spanning the root (an opts change or a
 * picomatch upgrade), rather than silently un-routing root-level files.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'
import { extractVaultRefs } from '../support/wikilinks.js'
import {
  type Contract,
  contract,
  type DocTree,
  docRule,
  type Finding,
  optional,
  section,
  sections,
} from '../../src/core/index.js'
import { type CorpusConfig, compileMatcher, runCorpus } from '../../src/runner/corpus.js'

const made: string[] = []

afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

/** Lay down a tiny corpus in a fresh temp dir, removed after the suite, and return its root. */
function vault(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'mc-corpus-'))
  made.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
  return root
}

describe('compileMatcher — a single `**/`-glob spans root and nested', () => {
  it('matches a prefixed file at the run root AND nested under it', () => {
    const match = compileMatcher(['**/T-*.md'])
    expect(match('T-0001.md')).toBe(true) // root-level — the case the bare `T-*.md` used to cover
    expect(match('tasks/T-0001.md')).toBe(true) // one level down
    expect(match('a/b/T-0001.md')).toBe(true) // arbitrarily deep
  })

  it('does not match a path without the prefix', () => {
    const match = compileMatcher(['**/T-*.md'])
    expect(match('notes.md')).toBe(false)
    expect(match('C-0001.md')).toBe(false) // a different doc kind's prefix
    expect(match('tasks/C-0001.md')).toBe(false)
  })

  it('matches inside a dotfile directory (PICOMATCH_OPTS has `dot: true`)', () => {
    const match = compileMatcher(['**/T-*.md'])
    expect(match('.obsidian/T-0001.md')).toBe(true)
  })
})

/**
 * `runCorpus`'s run stats — the per-run counts the CLI renders as a summary. The contract,
 * as input → exact counts: every walked file is `filesScanned`; a file routed to a rule is
 * `filesMatched` (and increments that rule's `matchedByRule[i]`, parallel to `config.rules`);
 * everything else (matching no rule, or removed by the global pre-filter) is `filesUnmatched`.
 */
describe('runCorpus — run stats', () => {
  /** A contract that accepts everything (no findings) — stats counting is independent of finding content. */
  const acceptAll: Contract = {
    validate: () => ({ findings: [] as Finding[], tree: {} as DocTree }),
    read: () => {
      throw new Error('read is not exercised by the runner')
    },
  } as Contract

  it('counts scanned / matched / unmatched and per-rule matches, parallel to config.rules', () => {
    // 5 files: 2 tasks, 1 capability, and 2 that no rule routes (a README and a note).
    const root = vault({
      'T-0001.md': '# task one',
      'T-0002.md': '# task two',
      'C-0001.md': '# capability',
      'README.md': '# readme',
      'notes.txt': 'loose',
    })
    const config: CorpusConfig = {
      rules: [
        { include: ['**/T-*.md'], contract: acceptAll, name: 'task' },
        { include: ['**/C-*.md'], contract: acceptAll, name: 'capability' },
      ],
    }

    const { stats } = runCorpus(config, { cwd: root })

    expect(stats.filesScanned).toBe(5)
    expect(stats.filesMatched).toBe(3)
    expect(stats.filesUnmatched).toBe(2) // README.md + notes.txt match no rule
    expect(stats.matchedByRule).toEqual([2, 1]) // [task, capability], parallel to config.rules

    // The invariants the summary leans on.
    expect(stats.matchedByRule.length).toBe(config.rules.length)
    expect(stats.matchedByRule.reduce((a, b) => a + b, 0)).toBe(stats.filesMatched)
    expect(stats.filesScanned - stats.filesMatched).toBe(stats.filesUnmatched)
  })

  it('does not walk .git or node_modules folders', () => {
    const root = vault({
      'T-0001.md': '# task',
      'node_modules/pkg/T-0002.md': '# vendored',
      '.git/T-0003.md': '# git',
      'sub/node_modules/T-0004.md': '# nested vendored',
    })
    const config: CorpusConfig = {
      rules: [{ include: ['**/T-*.md'], contract: acceptAll, name: 'task' }],
    }

    const { stats } = runCorpus(config, { cwd: root })

    expect(stats.filesScanned).toBe(1)
    expect(stats.matchedByRule).toEqual([1])
  })

  it('a file matching no rule is counted as unmatched', () => {
    const root = vault({ 'stray.md': '# stray' })
    const config: CorpusConfig = {
      rules: [{ include: ['**/T-*.md'], contract: acceptAll, name: 'task' }],
    }

    const { stats } = runCorpus(config, { cwd: root })

    expect(stats.filesScanned).toBe(1)
    expect(stats.filesMatched).toBe(0)
    expect(stats.filesUnmatched).toBe(1)
    expect(stats.matchedByRule).toEqual([0]) // the named rule routed nothing
  })

  it('a file removed by the global --exclude pre-filter counts as unmatched, not scanned-away', () => {
    const root = vault({
      'T-0001.md': '# kept',
      'T-0002.md': '# excluded',
    })
    const config: CorpusConfig = {
      rules: [{ include: ['**/T-*.md'], contract: acceptAll, name: 'task' }],
    }

    const { stats } = runCorpus(config, { cwd: root, exclude: ['**/T-0002.md'] })

    expect(stats.filesScanned).toBe(2) // both files were walked
    expect(stats.filesMatched).toBe(1) // only the non-excluded one routed
    expect(stats.filesUnmatched).toBe(1) // the pre-filtered file is unmatched
    expect(stats.matchedByRule).toEqual([1])
  })
})

/**
 * `runCorpus` collects the findings each document's contract emits into ONE flat run-level
 * `findings` array, then derives the run `exitCode` from those findings' levels. The contract,
 * as input → exact output: route a `docRule`-bearing contract — a rule that sees the whole typed
 * doc — across a multi-document corpus, and every doc's docRule findings land in the same run
 * `findings`, each stamped with the document it came from (`ctx.path`, the POSIX-relative file
 * path). That cross-document stamping is how aggregation is observable. The exit code follows
 * finding level: any `error` ⇒ `1`; a `warn`-only run stays `0` (a warn never bumps the code).
 */
describe('runCorpus — docRule findings aggregate across documents into findings / exitCode', () => {
  /**
   * A tiny "doc" contract with TWO whole-document docRules over a body of two optional sections.
   * `doc/needs-summary` (error — the default level) fires when there is no `## Summary`;
   * `doc/has-owner` (warn — explicit level) fires when there is no `## Owner`. No `frontmatter`
   * key, so the ONLY findings a document can produce are these two docRules — which keeps the
   * aggregation assertions exact (every finding below is one of these two, from one of the docs).
   */
  function docContract() {
    return contract({
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        optional(section('Summary')),
        optional(section('Owner')),
      ]),
      rules: [
        docRule('doc/needs-summary', (doc, ctx) => {
          // Mirror fixture 16's cast: the typed body exposes `section(name)` (truthy when the
          // section is present, `undefined` when absent). No `pos` ⇒ a whole-document finding,
          // which the engine stamps with `ctx.path`.
          const body = doc.body as { section(name: string): unknown }
          return body.section('Summary')
            ? []
            : [
                ctx.finding({
                  id: 'doc/needs-summary',
                  message: 'a doc needs a ## Summary section',
                }),
              ]
        }),
        docRule('doc/has-owner', (doc, ctx) => {
          const body = doc.body as { section(name: string): unknown }
          return body.section('Owner')
            ? []
            : [
                ctx.finding({
                  id: 'doc/has-owner',
                  message: 'a doc should name an ## Owner',
                  level: 'warn', // explicit warn — the only thing keeping the exit code off 1 in case 2
                }),
              ]
        }),
      ],
    })
  }

  /** One rule routing every `.md` in the tree through the doc contract. */
  const config: CorpusConfig = {
    rules: [{ include: ['**/*.md'], contract: docContract(), name: 'doc' }],
  }

  it('aggregates BOTH docRules across BOTH documents; the error-level rule sets exitCode 1', () => {
    // Two docs, each with only a `## Notes` body (all-H2, so the heading-depth scan stays quiet) —
    // neither has a Summary or an Owner, so on each doc BOTH rules fire. The walk is deterministic
    // (entries sorted ascending), so doc-a is validated before doc-b; within a doc the two findings
    // are whole-document (line 0) and break the tie by emission order, i.e. rule-array order.
    const root = vault({
      'doc-a.md': '## Notes\n\nnotes for a\n',
      'doc-b.md': '## Notes\n\nnotes for b\n',
    })

    const { findings, exitCode } = runCorpus(config, { cwd: root })

    // Exact, ordered shape: 4 findings = 2 rules × 2 docs, each stamped with its source path.
    // needs-summary precedes has-owner within a doc; doc-a precedes doc-b across docs.
    expect(findings.map((f) => ({ id: f.id, level: f.level, path: f.path }))).toEqual([
      { id: 'doc/needs-summary', level: 'error', path: 'doc-a.md' },
      { id: 'doc/has-owner', level: 'warn', path: 'doc-a.md' },
      { id: 'doc/needs-summary', level: 'error', path: 'doc-b.md' },
      { id: 'doc/has-owner', level: 'warn', path: 'doc-b.md' },
    ])

    // Cross-document: the run's findings carry BOTH documents' paths (aggregation across files).
    expect(new Set(findings.map((f) => f.path))).toEqual(new Set(['doc-a.md', 'doc-b.md']))
    // Multiple docRules: BOTH rule ids contributed findings to the run.
    expect(new Set(findings.map((f) => f.id))).toEqual(
      new Set(['doc/needs-summary', 'doc/has-owner']),
    )
    // An error-level finding exists somewhere in the corpus ⇒ the run exits 1.
    expect(exitCode).toBe(1)
  })

  it('a warn-only run leaves exitCode 0 — a warn-level docRule does NOT bump the exit code', () => {
    // Each doc now HAS a `## Summary` (the error rule is satisfied) but still lacks `## Owner`
    // (the warn rule fires). So the run's only findings are warn-level — and yet aggregation
    // still spans both documents.
    const root = vault({
      'doc-a.md': '## Summary\n\nsummary for a\n',
      'doc-b.md': '## Summary\n\nsummary for b\n',
    })

    const { findings, exitCode } = runCorpus(config, { cwd: root })

    expect(findings.map((f) => ({ id: f.id, level: f.level, path: f.path }))).toEqual([
      { id: 'doc/has-owner', level: 'warn', path: 'doc-a.md' },
      { id: 'doc/has-owner', level: 'warn', path: 'doc-b.md' },
    ])
    // No error-level finding anywhere ⇒ the exit code stays 0 despite the warns.
    expect(findings.every((f) => f.level === 'warn')).toBe(true)
    expect(exitCode).toBe(0)
  })
})

/**
 * Cross-document referential integrity over a vault: a `docRule` that pairs
 * `extractVaultRefs` (the dialect's wikilink recognizer) with a known-page set to emit a `warn`-level
 * finding for a wikilink whose TARGET PAGE does not exist anywhere in the vault — a dangling link.
 *
 * `runCorpus` validates each document independently, so there is no built-in vault-wide view; the
 * docRule closes over the set of page stems the test itself lays down (it constructs the vault, so it
 * knows them). This is the *documented composition* over the existing primitives — NOT first-class
 * vault-wide validation, which leaves out of scope. The contract, as input → output: route a
 * vault through this rule and a link to a missing page surfaces as one `warn` finding stamped with the
 * linking document's path, while a link to a real page surfaces nothing — and a warn never bumps the
 * exit code off 0.
 */
describe('runCorpus — a cross-document docRule warns on a wikilink whose target page is missing', () => {
  /**
   * The vault's existing pages, by `.md` stem. The docRule closes over this set — the test builds the
   * vault, so it knows the page names. A wikilink whose `target` is not in here is a dangling link.
   */
  const knownPages = new Set(['index', 'exists'])

  function vaultLinkContract(): Contract {
    return contract({
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        optional(section('Links')),
      ]),
      rules: [
        docRule('vault/wikilink-target-exists', (doc, ctx) => {
          const body = doc.body as {
            section(name: string): { text(scope: 'all'): string } | undefined
            unknown: { text(scope: 'all'): string }[]
          }
          // The whole doc's flattened section text — the `[[target]]` tokens survive flattening.
          const text = [
            body.section('Links')?.text('all') ?? '',
            ...body.unknown.map((s) => s.text('all')),
          ].join('\n')

          return extractVaultRefs(text)
            .filter((ref) => ref.kind === 'wikilink' && ref.target !== '') // ignore pure `#`/`#^` in-doc fragments
            .filter((ref) => !knownPages.has(ref.target)) // the target page is not in the vault
            .map((ref) =>
              ctx.finding({
                id: 'vault/wikilink-target-exists',
                message: `wikilink target [[${ref.target}]] matches no page in the vault`,
                level: 'warn', // a dangling cross-doc link warns; it does not block
              }),
            )
        }),
      ],
    })
  }

  /** One rule routing every `.md` in the vault through the wikilink-existence contract. */
  const config: CorpusConfig = {
    rules: [{ include: ['**/*.md'], contract: vaultLinkContract(), name: 'vault' }],
  }

  it('emits exactly one warn finding for the dangling target; the existing target produces none; exitCode stays 0', () => {
    // `index.md` links to one REAL page (`exists`) and one MISSING page (`ghost`); `exists.md` is
    // present, there is NO `ghost.md`. All-H2 so the heading-depth scan stays quiet.
    const root = vault({
      'index.md': '## Links\n\nSee [[exists]] and also [[ghost]] for more.\n',
      'exists.md': '## Links\n\nNothing dangling on this page.\n',
    })

    const { findings, exitCode } = runCorpus(config, { cwd: root })

    // Exact shape: the ONLY finding is the dangling `ghost` link, stamped with the linking doc's path.
    expect(findings.map((f) => ({ id: f.id, level: f.level, path: f.path }))).toEqual([
      { id: 'vault/wikilink-target-exists', level: 'warn', path: 'index.md' },
    ])
    // The existing-target link (`[[exists]]`) produced NO finding — it resolves to a real page.
    expect(findings.filter((f) => f.message.includes('[[exists]]'))).toEqual([])
    expect(findings[0]?.message).toContain('[[ghost]]')
    // A warn-only run never bumps the exit code off 0.
    expect(exitCode).toBe(0)
  })
})

/**
 * Routing precedence — the runner's core promise. `runCorpus` is a FIRST-match
 * router: for each file it picks the FIRST rule whose `include` matches and whose per-rule
 * `exclude` does not, validates the file against THAT rule's contract only, and moves on.
 *
 * The three describes below pin that promise as input → exact output. Each uses a
 * `tagContract(tag)` whose single `docRule` UNCONDITIONALLY emits exactly one finding with
 * the contract-unique id `rule/<tag>` — so *which contract validated a file* is observable
 * from the finding's id, and *how many times* it was validated is observable from the finding
 * count. (No `pos` ⇒ a whole-document finding, which the engine stamps with `ctx.path`, the
 * POSIX-relative file path — so each finding also names the file it came from.) The bodies are
 * all-H2 and `allowUnknown`, so the only finding any document can produce is its rule's tag —
 * which keeps every `toEqual` below exact.
 */

/**
 * A trivially-distinguishable contract: its lone `docRule` always fires, emitting one
 * `rule/<tag>` finding for every document routed to it. The `tag` is the only signal — route a
 * file here and you get exactly one finding whose id names this contract.
 */
function tagContract(tag: string): Contract {
  return contract({
    body: sections({ order: 'recognized-relative', allowUnknown: true }, [
      optional(section('Body')),
    ]),
    rules: [
      docRule(`rule/${tag}`, (_doc, ctx) => [
        ctx.finding({ id: `rule/${tag}`, message: `validated by contract ${tag}` }),
      ]),
    ],
  })
}

describe('runCorpus — first-match precedence: among overlapping rules the earliest wins', () => {
  it("routes a file matching BOTH rules to the FIRST rule's contract — exactly once", () => {
    // Two rules whose `include` globs OVERLAP on `A-0001.md`: rule 0 matches `A-*.md`, rule 1
    // is a `**/*.md` catch-all that ALSO matches it. The file is validated by rule 0's contract
    // only — given these two overlapping rules and this one file, you get exactly this one finding.
    const root = vault({ 'A-0001.md': '## Body\n\nrouted content\n' })
    const config: CorpusConfig = {
      rules: [
        { include: ['**/A-*.md'], contract: tagContract('A'), name: 'specific' },
        { include: ['**/*.md'], contract: tagContract('B'), name: 'catch-all' },
      ],
    }

    const { findings } = runCorpus(config, { cwd: root })

    // The ONLY finding is from rule 0's contract (`rule/A`) — rule 1's `rule/B` never ran.
    expect(findings.map((f) => ({ id: f.id, path: f.path }))).toEqual([
      { id: 'rule/A', path: 'A-0001.md' },
    ])
  })

  it('attributes the match to rule index 0 (not 1) and reports the file exactly once', () => {
    // Same overlap, asserted through the stats: the earlier rule claims the file, so the file is
    // counted under index 0; the later overlapping rule sees nothing, and there is no double-report.
    const root = vault({ 'A-0001.md': '## Body\n\nrouted content\n' })
    const config: CorpusConfig = {
      rules: [
        { include: ['**/A-*.md'], contract: tagContract('A'), name: 'specific' },
        { include: ['**/*.md'], contract: tagContract('B'), name: 'catch-all' },
      ],
    }

    const { findings, stats } = runCorpus(config, { cwd: root })

    expect(stats.matchedByRule).toEqual([1, 0]) // index 0 claimed it; index 1 got nothing
    expect(stats.filesMatched).toBe(1)
    expect(findings.length).toBe(1) // validated once, not once per matching rule
  })
})

describe('runCorpus — a trailing catch-all rule fires only for files no earlier rule matched', () => {
  it('routes `A-*.md` to the specific rule and everything else to the trailing catch-all', () => {
    // Rule 0 is specific (`A-*.md`); rule 1 is a trailing `**/*.md` catch-all. `A-0001.md` matches
    // both but is claimed by rule 0; `notes.md` matches ONLY the catch-all. The walk is sorted
    // ascending, so `A-0001.md` (0x41) precedes `notes.md` (0x6e).
    const root = vault({
      'A-0001.md': '## Body\n\na task\n',
      'notes.md': '## Body\n\nloose notes\n',
    })
    const config: CorpusConfig = {
      rules: [
        { include: ['**/A-*.md'], contract: tagContract('A'), name: 'specific' },
        { include: ['**/*.md'], contract: tagContract('catchall'), name: 'catch-all' },
      ],
    }

    const { findings, stats } = runCorpus(config, { cwd: root })

    // The catch-all fired ONLY for `notes.md`; `A-0001.md` went to the earlier specific rule.
    expect(findings.map((f) => ({ id: f.id, path: f.path }))).toEqual([
      { id: 'rule/A', path: 'A-0001.md' },
      { id: 'rule/catchall', path: 'notes.md' },
    ])
    expect(stats.matchedByRule).toEqual([1, 1]) // one to specific, one to catch-all
    expect(stats.filesMatched).toBe(2)
    expect(stats.filesUnmatched).toBe(0)
  })
})

describe('runCorpus — a per-rule `exclude` drops a file from that rule', () => {
  it('falls a per-rule-excluded file THROUGH to the next matching rule', () => {
    // Rule 0 includes every `.md` but EXCLUDES `skip-*.md`; rule 1 is a plain `**/*.md` catch-all.
    // `keep.md` matches rule 0 (not excluded) → rule 0. `skip-me.md` matches rule 0's include but
    // is removed by its per-rule exclude, so it falls through to rule 1. Walk order: `keep.md`
    // (0x6b) precedes `skip-me.md` (0x73).
    const root = vault({
      'keep.md': '## Body\n\nkept by rule 0\n',
      'skip-me.md': '## Body\n\nexcluded from rule 0\n',
    })
    const config: CorpusConfig = {
      rules: [
        {
          include: ['**/*.md'],
          exclude: ['**/skip-*.md'],
          contract: tagContract('A'),
          name: 'primary',
        },
        { include: ['**/*.md'], contract: tagContract('B'), name: 'fallback' },
      ],
    }

    const { findings, stats } = runCorpus(config, { cwd: root })

    // `keep.md` → rule 0's contract; `skip-me.md`, dropped from rule 0 by its exclude, → rule 1's.
    expect(findings.map((f) => ({ id: f.id, path: f.path }))).toEqual([
      { id: 'rule/A', path: 'keep.md' },
      { id: 'rule/B', path: 'skip-me.md' },
    ])
    expect(stats.matchedByRule).toEqual([1, 1])
    expect(stats.filesMatched).toBe(2)
  })

  it('skips a per-rule-excluded file entirely when no later rule matches it', () => {
    // Only one rule, which excludes `skip-*.md`. `skip-me.md` is dropped from rule 0 and there is
    // no later rule to catch it, so it routes to nothing — scanned but unmatched, no finding.
    const root = vault({
      'keep.md': '## Body\n\nkept by rule 0\n',
      'skip-me.md': '## Body\n\nexcluded, with no fallback\n',
    })
    const config: CorpusConfig = {
      rules: [
        {
          include: ['**/*.md'],
          exclude: ['**/skip-*.md'],
          contract: tagContract('A'),
          name: 'primary',
        },
      ],
    }

    const { findings, stats } = runCorpus(config, { cwd: root })

    expect(findings.map((f) => ({ id: f.id, path: f.path }))).toEqual([
      { id: 'rule/A', path: 'keep.md' },
    ])
    expect(stats.filesScanned).toBe(2) // both walked
    expect(stats.filesMatched).toBe(1) // only `keep.md` routed
    expect(stats.filesUnmatched).toBe(1) // `skip-me.md` dropped by the per-rule exclude, no fallback
    expect(stats.matchedByRule).toEqual([1])
  })
})
