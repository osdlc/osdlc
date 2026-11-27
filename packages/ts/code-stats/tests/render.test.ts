import { describe, expect, test } from 'vitest'

import type { Change } from '../src/types.ts'
import { buildCountReport } from '../src/report/count.ts'
import { createScannerRegistry } from '../src/scan/registry.ts'
import { buildDiffReport } from '../src/report/diff.ts'
import { renderCompare, renderCount, renderDiff } from '../src/report/render.ts'
import { RISK_SECTION } from '../src/describe/render.ts'
import { spliceSection, STATS_SECTION } from '../src/report/splice.ts'

const { start: STATS_START, end: STATS_END } = STATS_SECTION
const spliceBody = (body: string, block: string) => spliceSection(body, block, STATS_SECTION)
import { diff } from './helpers.ts'

const CHANGE: Change = {
  kind: 'range',
  label: 'a..b',
  pr: null,
  base: null,
  head: null,
}
const report = (d: string, label = 'a..b') => buildDiffReport({ ...CHANGE, label }, d, null)

describe('renderDiff', () => {
  test('a marked block with the line table, the groups and the summary', () => {
    const out = renderDiff(report(diff('lib/a.ts', ['-old()', '+// why', '+old(1)'])))
    expect(out.startsWith(`${STATS_START}\n`)).toBe(true)
    expect(out.endsWith(`\n${STATS_END}`)).toBe(true)
    expect(out).toContain('| Logic | 0 | 1 | 0 | 0 | 0 |')
    expect(out).toContain('| Comments | 1 | 0 | 0 | 0 | +1 |')
    expect(out).toContain('| **Total** | **1** | **1** | **0** | **0** | **+1** |')
    expect(out).toContain('| Source | 1 | 2 | 1 |')
    expect(out).toContain('### Code summary')
    expect(out).not.toContain('Per-file detail')
  })

  test('detail adds the per-file table; an empty diff says so', () => {
    expect(renderDiff(report(diff('lib/a.ts', ['+x()'])), { detail: true })).toContain(
      'Per-file detail',
    )
    const empty = renderDiff(report(''))
    expect(empty).toContain('| _no changed files_ | 0 | 0 | 0 |')
    expect(empty).not.toContain('### Code summary')
  })

  test('a pipe in a path cannot break a table', () => {
    expect(renderDiff(report(diff('a|b.ts', ['+x()'])))).toContain('`a\\|b.ts`')
  })

  test('a path with a backslash before its pipe keeps that one backslash', () => {
    const out = renderDiff(report(diff('a\\|b.ts', ['+x()'])), { detail: true })
    // A code span has no backslash escapes: the backslash already escapes the pipe for the table.
    expect(out).toContain('| `a\\|b.ts` | logic |')
  })

  test('a language name is escaped as cell text, a line break and all', () => {
    const r = buildCountReport(
      { label: 'HEAD', commit: null },
      [],
      [{ path: 'x.zz', content: { kind: 'text', text: 'x\n' } }],
      {
        registry: createScannerRegistry({
          scanners: [{ id: 's', language: 'A|B\nC', matches: () => true, scan: () => ['logic'] }],
        }),
      },
    )
    expect(renderCount(r)).toContain('| A\\|B C | 1 |')
  })

  test('with no commits, the reason is given once, in the notes', () => {
    const out = renderDiff(report(diff('lib/a.ts', ['+x()']), 'PR #3'))
    expect(out.match(/PR #3's commits are not in this checkout/g)).toHaveLength(1)
    expect(out).toContain('**Exported API**\n\n_Skipped: see the note below._')
  })
})

describe('renderCount', () => {
  test('languages, groups and what was not read', () => {
    const r = buildCountReport(
      { label: 'HEAD', commit: 'abcdef1234567890' },
      ['src'],
      [
        { path: 'src/a.ts', content: { kind: 'text', text: 'x()\n' } },
        { path: 'src/b.png', content: { kind: 'binary', bytes: 3 } },
      ],
    )
    const out = renderCount(r)
    expect(out).toContain('## Lines of code: HEAD (abcdef123456) under `src`')
    expect(out).toContain('| TypeScript | 1 | 1 | 0 | 0 | 0 | 0 | 1 |')
    expect(out).toContain('| Source | 1 | 1 | 0 | 0 | 0 | 0 | 1 |')
    expect(out).toContain('_Not read: 1 binary._')
  })

  test('languages past the first twelve fold into one row unless detail is asked for', () => {
    const exts = [
      'ts',
      'rs',
      'py',
      'go',
      'java',
      'c',
      'cpp',
      'rb',
      'php',
      'swift',
      'kt',
      'scala',
      'lua',
      'sh',
    ]
    const files = exts.map((e, i) => ({
      path: `f.${e}`,
      content: { kind: 'text' as const, text: 'x\n'.repeat(exts.length - i) },
    }))
    const r = buildCountReport({ label: 'HEAD', commit: null }, [], files)
    expect(renderCount(r)).toContain('| 2 more languages | 2 |')
    expect(renderCount({ ...r, fileList: null }, { detail: true })).not.toContain('more languages')
  })
})

describe('renderCompare', () => {
  test('two changes side by side', () => {
    const a = report(diff('a.ts', ['+x()', '+y()']), 'PR #1')
    const b = report(diff('b.ts', ['-p()', '+q()']), 'PR #2')
    const out = renderCompare({ schema: 1, a, b })
    expect(out).toContain('## PR #1 vs PR #2')
    expect(out).toContain('| Logic | +2 −0 | +1 −1 · 1 changed |')
    expect(out).toContain('| Source | 1 | 1 |')
  })

  test('a label with a pipe is escaped in the column headers', () => {
    const out = renderCompare({ schema: 1, a: report('', 'x|y'), b: report('', 'z') })
    expect(out).toContain('| Lines | A: x\\|y | B: z |')
  })
})

describe('spliceSection for the statistics', () => {
  const block = renderDiff(report(diff('lib/a.ts', ['+x'])))
  const footer = '<!-- bot-footer: run=1 id=abc -->'

  test('appends when there is no footer', () => {
    expect(spliceBody('## Summary\n- a\n', block)).toBe(
      `## Summary\n- a\n\n## Change statistics\n\n${block}\n`,
    )
  })
  test('goes before trailing HTML-comment lines, which stay last and exact', () => {
    const out = spliceBody(`## Summary\n- a\n\n${footer}\n<!-- other -->`, block)
    expect(out).toBe(
      `## Summary\n- a\n\n## Change statistics\n\n${block}\n\n${footer}\n<!-- other -->`,
    )
    expect(spliceBody(`x\n\n${footer}\n`, block).endsWith(`${footer}\n`)).toBe(true)
  })
  test('replaces an existing marked block and nothing else', () => {
    const old = `${STATS_START}\nold table\n${STATS_END}`
    const body = `## Summary\n\n## Change statistics\n\n${old}\n\n## Test plan\n- t\n\n${footer}`
    expect(spliceBody(body, block)).toBe(
      `## Summary\n\n## Change statistics\n\n${block}\n\n## Test plan\n- t\n\n${footer}`,
    )
  })
  test('idempotent, and an empty body gets just the section', () => {
    const once = spliceBody(`## S\n\n${footer}`, block)
    expect(spliceBody(once, block)).toBe(once)
    expect(spliceBody('', block)).toBe(`## Change statistics\n\n${block}\n`)
  })
  test('a quoted marker is never taken for the block', () => {
    const quoted = `## Summary\n\nThe block starts at \`${STATS_START}\`.\n`
    const once = spliceBody(quoted, block)
    expect(once).toBe(`${quoted.trimEnd()}\n\n## Change statistics\n\n${block}\n`)
    expect(spliceBody(once, block)).toBe(once)
  })
  test('with two complete blocks, the first is replaced', () => {
    const first = `${STATS_START}\nfirst\n${STATS_END}`
    const second = `${STATS_START}\nsecond\n${STATS_END}`
    expect(spliceBody(`## A\n\n${first}\n\n## B\n\n${second}\n`, block)).toBe(
      `## A\n\n${block}\n\n## B\n\n${second}\n`,
    )
  })
  test('markers inside fenced code are not the block', () => {
    const fence = `## Usage\n\n\`\`\`md\n${STATS_START}\ntable\n${STATS_END}\n\`\`\`\n`
    const once = spliceBody(fence, block)
    expect(once).toBe(`${fence.trimEnd()}\n\n## Change statistics\n\n${block}\n`)
    const tilde = `~~~\n${STATS_START}\n~~~\n\n${STATS_START}\nold\n${STATS_END}\n`
    expect(spliceBody(tilde, block)).toBe(`~~~\n${STATS_START}\n~~~\n\n${block}\n`)
  })
  test('an orphaned start line does not pair with a later end', () => {
    const body = `## Summary\n\n${STATS_START}\nold table, end marker lost\n\n## Test plan\n- t\n`
    const once = spliceBody(body, block)
    expect(once).toContain('## Test plan\n- t')
    expect(spliceBody(once, block)).toBe(once)
  })
})

describe('spliceSection', () => {
  const block = renderDiff(report(diff('lib/a.ts', ['+x'])))
  const risk = `${RISK_SECTION.start}\n\n- one\n\n${RISK_SECTION.end}`

  test('a body ending in another generated block gets the new one after it', () => {
    const stats = `## Change statistics\n\n${block}\n`
    expect(spliceSection(stats, risk, RISK_SECTION)).toBe(`${stats}\n## Risk\n\n${risk}\n`)
    const endsInRisk = `## Risk\n\n${risk}\n`
    expect(spliceBody(endsInRisk, block)).toBe(`${endsInRisk}\n## Change statistics\n\n${block}\n`)
  })
  test('an existing heading with no block gets the block under it', () => {
    const body = '## Change statistics\n\n## Testing\n- ran it\n'
    const once = spliceBody(body, block)
    expect(once).toBe(`## Change statistics\n\n${block}\n\n## Testing\n- ran it\n`)
    expect(spliceBody(once, block)).toBe(once)
    expect(spliceBody('## Change statistics', block)).toBe(`## Change statistics\n\n${block}\n`)
  })
  test('a CRLF body keeps CRLF line ends', () => {
    const body = '## Summary\r\n- a\r\n'
    const once = spliceBody(body, block)
    expect(once.replace(/\r\n/g, '')).not.toContain('\n')
    expect(once.startsWith('## Summary\r\n- a\r\n\r\n## Change statistics\r\n')).toBe(true)
    expect(spliceBody(once, block)).toBe(once)
  })
})

test('a body that ends inside an unclosed fence gets the fence closed, once', () => {
  const block = renderDiff(report(diff('lib/a.ts', ['+x'])))
  const body = 'Intro\n\n```ts\nconst x = 1\n'
  const once = spliceBody(body, block)
  expect(once).toBe(`Intro\n\n\`\`\`ts\nconst x = 1\n\`\`\`\n\n## Change statistics\n\n${block}\n`)
  expect(spliceBody(once, block)).toBe(once)
})
