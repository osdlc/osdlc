import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createVaultIndex, type ExternalNote } from '@osdlc/markdown-vault'
import { parseBase } from '../../src/base/parse.ts'
import { runView } from '../../src/query.ts'
import { DateValue, DurationValue } from '../../src/expr/values.ts'

// A summary folds one value per row, so any implementation that spreads the
// column into a variadic call (Math.min(...nums)) blows the call stack once a
// vault is large enough. 200k rows is comfortably past the ~125k threshold V8
// allows on a default stack.
const ROWS = 200_000

test('min/max/range/earliest/latest summaries survive a vault with more rows than a call can take arguments', () => {
  const notes: ExternalNote[] = []
  for (let i = 0; i < ROWS; i++) {
    notes.push({
      path: `n/${i}.md`,
      frontmatter: { low: i, high: i, span: i, from: '2026-01-01', to: '2026-01-02' },
      size: 1,
    })
  }
  const vault = createVaultIndex(notes)
  const base = parseBase(`
views:
  - type: table
    name: V
    order: [low, high, span, from, to]
    summaries:
      low: Min
      high: Max
      span: Range
      from: Earliest
      to: Latest
`)

  const result = runView(vault, base, 'V')

  assert.equal(result.summaries['low'], 0)
  assert.equal(result.summaries['high'], ROWS - 1)
  assert.equal(result.summaries['span'], ROWS - 1)
  const from = result.summaries['from']
  const to = result.summaries['to']
  assert.ok(from instanceof DateValue && to instanceof DateValue)
  assert.equal((from as DateValue).ms, new Date(2026, 0, 1).getTime())
  assert.equal((to as DateValue).ms, new Date(2026, 0, 2).getTime())
})

test('Range over an all-date column yields a DurationValue on a large vault', () => {
  const notes: ExternalNote[] = []
  for (let i = 0; i < ROWS; i++) {
    notes.push({
      path: `d/${i}.md`,
      frontmatter: { when: i % 2 === 0 ? '2026-01-01' : '2026-01-03' },
      size: 1,
    })
  }
  const vault = createVaultIndex(notes)
  const base = parseBase(`
views:
  - type: table
    name: V
    order: [when]
    summaries:
      when: Range
`)

  const span = runView(vault, base, 'V').summaries['when']
  assert.ok(span instanceof DurationValue)
  assert.equal((span as DurationValue).ms, 2 * 86_400_000)
})
