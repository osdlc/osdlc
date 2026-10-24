/**
 * Tests of the corpus runner's glob matching (`compileMatcher`).
 *
 * One include glob that starts with `**\/` matches a file at any depth, at the run root and in
 * nested folders. So a config needs one entry per rule, with no separate `X-*.md` for files at
 * the root. The test uses the runner's own matcher, so it fails if `**\/` stops matching the
 * root (after an options change or a picomatch upgrade).
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

/** Writes a small corpus to a new temp folder, removed after the suite, and returns its root. */
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
    expect(match('T-0001.md')).toBe(true) // at the root
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
 * `runCorpus`'s run stats, the counts the CLI prints as a summary. Every walked file counts in
 * `filesScanned`. A file sent to a rule counts in `filesMatched` and in that rule's
 * `matchedByRule[i]` (indexed like `config.rules`). Every other file (it matches no rule, or the
 * global filter removed it) counts in `filesUnmatched`.
 */
describe('runCorpus — run stats', () => {
  /** A contract that accepts everything. The stats do not depend on findings. */
  const acceptAll: Contract = {
    validate: () => ({ findings: [] as Finding[], tree: {} as DocTree }),
    read: () => {
      throw new Error('read is not exercised by the runner')
    },
  } as Contract

  it('counts scanned / matched / unmatched and per-rule matches, parallel to config.rules', () => {
    // 5 files: 2 tasks, 1 capability, and 2 that match no rule (a README and a note).
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

    // The totals the summary relies on.
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
    expect(stats.matchedByRule).toEqual([0]) // the named rule matched nothing
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
    expect(stats.filesMatched).toBe(1) // only the one not excluded matched
    expect(stats.filesUnmatched).toBe(1) // the filtered-out file is unmatched
    expect(stats.matchedByRule).toEqual([1])
  })
})

/**
 * `runCorpus` collects every document's findings into one flat `findings` array, and sets the
 * run's `exitCode` from their levels. The tests run a contract with `docRule`s (rules that see
 * the whole typed doc) over several documents. Every doc's findings end up in the same array,
 * each with the path of its document (`ctx.path`, relative, with `/` separators). Any `error`
 * gives exit code `1`. A run with only `warn` findings exits `0`.
 */
describe('runCorpus — docRule findings aggregate across documents into findings / exitCode', () => {
  /**
   * A small contract with two docRules over a body of two optional sections.
   * `doc/needs-summary` (error, the default level) fires when there is no `## Summary`.
   * `doc/has-owner` (warn, set explicitly) fires when there is no `## Owner`. There is no
   * `frontmatter` key, so these two rules are the only findings a document can produce. That
   * keeps the checks below exact.
   */
  function docContract() {
    return contract({
      body: sections({ order: 'recognized-relative', allowUnknown: true }, [
        optional(section('Summary')),
        optional(section('Owner')),
      ]),
      rules: [
        docRule('doc/needs-summary', (doc, ctx) => {
          // The same cast as fixture 16: the typed body has `section(name)`, which returns
          // `undefined` when the section is absent. With no `pos`, the finding is for the whole
          // document, and the engine sets its path from `ctx.path`.
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
                  level: 'warn', // warn, so case 2 exits 0
                }),
              ]
        }),
      ],
    })
  }

  /** One rule that sends every `.md` in the tree to the doc contract. */
  const config: CorpusConfig = {
    rules: [{ include: ['**/*.md'], contract: docContract(), name: 'doc' }],
  }

  it('aggregates BOTH docRules across BOTH documents; the error-level rule sets exitCode 1', () => {
    // Two docs, each with only a `## Notes` section (all H2, so there is no heading-depth-jump).
    // Neither has a Summary or an Owner, so both rules fire on each doc. The walk is sorted, so
    // doc-a comes before doc-b. Within a doc both findings are at line 0, so they stay in the
    // order the rules are listed.
    const root = vault({
      'doc-a.md': '## Notes\n\nnotes for a\n',
      'doc-b.md': '## Notes\n\nnotes for b\n',
    })

    const { findings, exitCode } = runCorpus(config, { cwd: root })

    // 4 findings (2 rules × 2 docs), each with its document's path. needs-summary comes before
    // has-owner within a doc, and doc-a comes before doc-b.
    expect(findings.map((f) => ({ id: f.id, level: f.level, path: f.path }))).toEqual([
      { id: 'doc/needs-summary', level: 'error', path: 'doc-a.md' },
      { id: 'doc/has-owner', level: 'warn', path: 'doc-a.md' },
      { id: 'doc/needs-summary', level: 'error', path: 'doc-b.md' },
      { id: 'doc/has-owner', level: 'warn', path: 'doc-b.md' },
    ])

    // The run's findings include both documents' paths.
    expect(new Set(findings.map((f) => f.path))).toEqual(new Set(['doc-a.md', 'doc-b.md']))
    // Both rule ids appear in the run's findings.
    expect(new Set(findings.map((f) => f.id))).toEqual(
      new Set(['doc/needs-summary', 'doc/has-owner']),
    )
    // There is an error-level finding, so the run exits 1.
    expect(exitCode).toBe(1)
  })

  it('a warn-only run leaves exitCode 0 — a warn-level docRule does NOT bump the exit code', () => {
    // Each doc has a `## Summary`, so the error rule passes. Each still lacks `## Owner`, so the
    // warn rule fires. The run's only findings are warnings, and they come from both documents.
    const root = vault({
      'doc-a.md': '## Summary\n\nsummary for a\n',
      'doc-b.md': '## Summary\n\nsummary for b\n',
    })

    const { findings, exitCode } = runCorpus(config, { cwd: root })

    expect(findings.map((f) => ({ id: f.id, level: f.level, path: f.path }))).toEqual([
      { id: 'doc/has-owner', level: 'warn', path: 'doc-a.md' },
      { id: 'doc/has-owner', level: 'warn', path: 'doc-b.md' },
    ])
    // No error-level finding, so the exit code is 0 despite the warnings.
    expect(findings.every((f) => f.level === 'warn')).toBe(true)
    expect(exitCode).toBe(0)
  })
})

/**
 * Links between documents: a `docRule` uses `extractVaultRefs` (the test's wikilink helper) and
 * a set of known pages to emit a `warn` finding for a wikilink whose target page does not exist.
 *
 * `runCorpus` validates each document on its own, so it has no view of the whole folder. The
 * docRule uses the set of page names the test writes. This shows how to build the check from
 * existing parts. It is not built-in folder-wide validation, which is out of scope. A link to a
 * missing page gives one `warn` finding with the linking document's path. A link to a real page
 * gives nothing. A warning does not change the exit code from 0.
 */
describe('runCorpus — a cross-document docRule warns on a wikilink whose target page is missing', () => {
  /**
   * The folder's pages, by `.md` stem. The test writes the folder, so it knows the page names.
   * A wikilink whose `target` is not in this set is a broken link.
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
          // The whole doc's flattened section text. The `[[target]]` tokens are kept when flattening.
          const text = [
            body.section('Links')?.text('all') ?? '',
            ...body.unknown.map((s) => s.text('all')),
          ].join('\n')

          return extractVaultRefs(text)
            .filter((ref) => ref.kind === 'wikilink' && ref.target !== '') // ignore `#` / `#^` links within the doc
            .filter((ref) => !knownPages.has(ref.target)) // the target page is not in the vault
            .map((ref) =>
              ctx.finding({
                id: 'vault/wikilink-target-exists',
                message: `wikilink target [[${ref.target}]] matches no page in the vault`,
                level: 'warn', // a broken link warns and does not fail the run
              }),
            )
        }),
      ],
    })
  }

  /** One rule that sends every `.md` in the folder to the wikilink contract. */
  const config: CorpusConfig = {
    rules: [{ include: ['**/*.md'], contract: vaultLinkContract(), name: 'vault' }],
  }

  it('emits exactly one warn finding for the dangling target; the existing target produces none; exitCode stays 0', () => {
    // `index.md` links to one real page (`exists`) and one missing page (`ghost`). There is an
    // `exists.md` and no `ghost.md`. All headings are H2, so there is no heading-depth-jump.
    const root = vault({
      'index.md': '## Links\n\nSee [[exists]] and also [[ghost]] for more.\n',
      'exists.md': '## Links\n\nNothing dangling on this page.\n',
    })

    const { findings, exitCode } = runCorpus(config, { cwd: root })

    // The only finding is the broken `ghost` link, with the linking doc's path.
    expect(findings.map((f) => ({ id: f.id, level: f.level, path: f.path }))).toEqual([
      { id: 'vault/wikilink-target-exists', level: 'warn', path: 'index.md' },
    ])
    // The link to a real page (`[[exists]]`) gives no finding.
    expect(findings.filter((f) => f.message.includes('[[exists]]'))).toEqual([])
    expect(findings[0]?.message).toContain('[[ghost]]')
    // A run with only warnings exits 0.
    expect(exitCode).toBe(0)
  })
})

/**
 * Rule order. For each file, `runCorpus` picks the first rule whose `include` matches and whose
 * own `exclude` does not. It validates the file against that rule's contract only.
 *
 * The three `describe`s below check this. Each uses `tagContract(tag)`, whose one `docRule`
 * always emits one finding with the id `rule/<tag>`. The finding's id shows which contract
 * validated a file, and the finding count shows how many times. The finding has no `pos`, so
 * the engine sets its path from `ctx.path`, and each finding names its file. The bodies are all
 * H2 and `allowUnknown`, so a document's only finding is its rule's tag.
 */

/**
 * A contract whose one `docRule` always fires, emitting one `rule/<tag>` finding for every
 * document sent to it. The id names the contract.
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
    // Both rules' `include` globs match `A-0001.md`: rule 0 is `A-*.md` and rule 1 is a
    // `**/*.md` catch-all. Only rule 0's contract validates the file.
    const root = vault({ 'A-0001.md': '## Body\n\nrouted content\n' })
    const config: CorpusConfig = {
      rules: [
        { include: ['**/A-*.md'], contract: tagContract('A'), name: 'specific' },
        { include: ['**/*.md'], contract: tagContract('B'), name: 'catch-all' },
      ],
    }

    const { findings } = runCorpus(config, { cwd: root })

    // The only finding is from rule 0's contract (`rule/A`). Rule 1's `rule/B` did not run.
    expect(findings.map((f) => ({ id: f.id, path: f.path }))).toEqual([
      { id: 'rule/A', path: 'A-0001.md' },
    ])
  })

  it('attributes the match to rule index 0 (not 1) and reports the file exactly once', () => {
    // The same overlap, checked through the stats. The earlier rule takes the file, so it is
    // counted under index 0. The later rule gets nothing, and the file is reported once.
    const root = vault({ 'A-0001.md': '## Body\n\nrouted content\n' })
    const config: CorpusConfig = {
      rules: [
        { include: ['**/A-*.md'], contract: tagContract('A'), name: 'specific' },
        { include: ['**/*.md'], contract: tagContract('B'), name: 'catch-all' },
      ],
    }

    const { findings, stats } = runCorpus(config, { cwd: root })

    expect(stats.matchedByRule).toEqual([1, 0]) // index 0 took it; index 1 got nothing
    expect(stats.filesMatched).toBe(1)
    expect(findings.length).toBe(1) // validated once, not once per matching rule
  })
})

describe('runCorpus — a trailing catch-all rule fires only for files no earlier rule matched', () => {
  it('routes `A-*.md` to the specific rule and everything else to the trailing catch-all', () => {
    // Rule 0 is specific (`A-*.md`). Rule 1 is a `**/*.md` catch-all at the end. `A-0001.md`
    // matches both and goes to rule 0. `notes.md` matches only the catch-all. The walk is sorted,
    // so `A-0001.md` (0x41) comes before `notes.md` (0x6e).
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

    // The catch-all fired only for `notes.md`. `A-0001.md` went to the earlier rule.
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
    // Rule 0 includes every `.md` but excludes `skip-*.md`. Rule 1 is a `**/*.md` catch-all.
    // `keep.md` goes to rule 0. `skip-me.md` matches rule 0's include, but rule 0's exclude
    // removes it, so it goes to rule 1. In walk order `keep.md` (0x6b) comes before
    // `skip-me.md` (0x73).
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

    // `keep.md` → rule 0's contract. `skip-me.md`, excluded from rule 0, → rule 1's.
    expect(findings.map((f) => ({ id: f.id, path: f.path }))).toEqual([
      { id: 'rule/A', path: 'keep.md' },
      { id: 'rule/B', path: 'skip-me.md' },
    ])
    expect(stats.matchedByRule).toEqual([1, 1])
    expect(stats.filesMatched).toBe(2)
  })

  it('skips a per-rule-excluded file entirely when no later rule matches it', () => {
    // One rule, which excludes `skip-*.md`. `skip-me.md` is excluded and no later rule takes it,
    // so it is scanned but unmatched, with no finding.
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
    expect(stats.filesMatched).toBe(1) // only `keep.md` matched
    expect(stats.filesUnmatched).toBe(1) // `skip-me.md` excluded, and no later rule
    expect(stats.matchedByRule).toEqual([1])
  })
})
