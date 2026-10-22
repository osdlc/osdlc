import { describe, expect, test } from 'vitest'

import type { Finding } from '../../src/core/index.js'
import type { RunStats } from '../../src/runner/index.js'
import { formatHuman, formatJson, formatRunSummary, formatSarif } from '../../src/cli/format.js'

// format.ts turns the runner's Finding[] into the three CLI output shapes. Each case shows a
// small input and the exact string (or parsed structure) it produces.

const findings: Finding[] = [
  {
    id: 'structure/section-missing',
    level: 'error',
    path: 'docs/a.md',
    message: 'Summary is missing',
  },
  {
    id: 'structure/heading-depth-jump',
    level: 'warn',
    path: 'docs/a.md',
    message: 'H4 under H2',
    pos: { line: 5, col: 1 },
  },
]

describe('formatHuman', () => {
  test("an empty corpus reports 'No findings.'", () => {
    expect(formatHuman([])).toBe('No findings.')
  })

  test('one line per finding (path:line only when positioned), then a summary', () => {
    expect(formatHuman(findings)).toBe(
      [
        'docs/a.md error structure/section-missing — Summary is missing',
        'docs/a.md:5 warn structure/heading-depth-jump — H4 under H2',
        '',
        '2 finding(s): 1 error, 1 warn, 0 report',
      ].join('\n'),
    )
  })

  test('a finding with a hint gets an indented hint line beneath its own', () => {
    const hinted: Finding[] = [
      {
        id: 'structure/section-missing',
        level: 'error',
        path: 'docs/a.md',
        message: 'Summary is missing',
        hint: 'a one-paragraph summary of the change',
      },
    ]
    expect(formatHuman(hinted)).toBe(
      [
        'docs/a.md error structure/section-missing — Summary is missing',
        '  hint: a one-paragraph summary of the change',
        '',
        '1 finding(s): 1 error, 0 warn, 0 report',
      ].join('\n'),
    )
  })
})

describe('formatRunSummary', () => {
  // labels[i] is the contract name for stats.matchedByRule[i]. A named rule gets a row;
  // an unnamed rule (inline --contract) contributes only to the total.

  test('named multi-contract: total line with `across K contracts` + one row per named rule', () => {
    const stats: RunStats = {
      filesScanned: 5,
      filesMatched: 4,
      filesUnmatched: 1,
      matchedByRule: [3, 1],
    }
    expect(formatRunSummary(stats, ['capability', 'task'])).toBe(
      [
        'Scanned 5 files; 4 matched across 2 contracts, 1 unmatched',
        '  capability: 3',
        '  task: 1',
      ].join('\n'),
    )
  })

  test('inline single contract (no names): total line only, no per-contract rows', () => {
    const stats: RunStats = {
      filesScanned: 12,
      filesMatched: 12,
      filesUnmatched: 0,
      matchedByRule: [12],
    }
    expect(formatRunSummary(stats, [undefined])).toBe('Scanned 12 files; 12 matched, 0 unmatched')
  })

  test('a named rule that matched 0 still gets a row (evidence it routed nothing)', () => {
    const stats: RunStats = {
      filesScanned: 3,
      filesMatched: 2,
      filesUnmatched: 1,
      matchedByRule: [2, 0],
    }
    expect(formatRunSummary(stats, ['task', 'driver'])).toBe(
      [
        'Scanned 3 files; 2 matched across 2 contracts, 1 unmatched',
        '  task: 2',
        '  driver: 0',
      ].join('\n'),
    )
  })

  test('singular: `1 file` / `1 contract` when the count is exactly one', () => {
    const stats: RunStats = {
      filesScanned: 1,
      filesMatched: 1,
      filesUnmatched: 0,
      matchedByRule: [1],
    }
    expect(formatRunSummary(stats, ['task'])).toBe(
      ['Scanned 1 file; 1 matched across 1 contract, 0 unmatched', '  task: 1'].join('\n'),
    )
  })

  test('an unnamed rule among named ones counts toward the total but gets no row', () => {
    const stats: RunStats = {
      filesScanned: 5,
      filesMatched: 4,
      filesUnmatched: 1,
      matchedByRule: [3, 1],
    }
    expect(formatRunSummary(stats, ['task', undefined])).toBe(
      ['Scanned 5 files; 4 matched across 1 contract, 1 unmatched', '  task: 3'].join('\n'),
    )
  })
})

describe('formatJson', () => {
  test('the findings array verbatim — round-trips through JSON.parse', () => {
    expect(JSON.parse(formatJson(findings))).toEqual(findings)
  })
})

describe('formatSarif — a SARIF 2.1.0 log', () => {
  const log = JSON.parse(formatSarif(findings))

  test('version + tool driver identify markdown-contract', () => {
    expect(log.version).toBe('2.1.0')
    expect(log.runs[0].tool.driver.name).toBe('markdown-contract')
  })

  test('distinct rule ids are listed once, in first-seen order', () => {
    expect(log.runs[0].tool.driver.rules).toEqual([
      { id: 'structure/section-missing' },
      { id: 'structure/heading-depth-jump' },
    ])
  })

  test("each finding → one result (warn maps to 'warning'; startLine comes from pos)", () => {
    expect(log.runs[0].results[1]).toEqual({
      ruleId: 'structure/heading-depth-jump',
      level: 'warning',
      message: { text: 'H4 under H2' },
      locations: [
        { physicalLocation: { artifactLocation: { uri: 'docs/a.md' }, region: { startLine: 5 } } },
      ],
    })
  })

  test('a whole-document finding (no pos) omits the region', () => {
    expect(log.runs[0].results[0].locations[0].physicalLocation.region).toBeUndefined()
  })

  test("report-level maps to 'note', and a repeated id is listed once in the driver", () => {
    const repeated: Finding[] = [
      { id: 'content/note', level: 'report', path: 'docs/b.md', message: 'first' },
      { id: 'content/note', level: 'report', path: 'docs/b.md', message: 'second' },
    ]
    const out = JSON.parse(formatSarif(repeated))
    // The rule id appears once even though two findings carry it.
    expect(out.runs[0].tool.driver.rules).toEqual([{ id: 'content/note' }])
    // report → "note"; both findings still become their own result.
    expect(out.runs[0].results.map((r: { level: string }) => r.level)).toEqual(['note', 'note'])
  })

  test("a finding's hint rides in the result's properties bag; hint-less results carry none", () => {
    const hinted: Finding[] = [
      {
        id: 'structure/section-missing',
        level: 'error',
        path: 'docs/a.md',
        message: 'Summary is missing',
        hint: 'a one-paragraph summary',
      },
      { id: 'content/note', level: 'report', path: 'docs/b.md', message: 'plain' },
    ]
    const out = JSON.parse(formatSarif(hinted))
    expect(out.runs[0].results[0].properties).toEqual({ hint: 'a one-paragraph summary' })
    expect(out.runs[0].results[1].properties).toBeUndefined()
  })
})
