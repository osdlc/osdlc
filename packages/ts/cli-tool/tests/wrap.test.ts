import { describe, expect, test } from 'vitest'

import { defineCli } from '../src/define-cli.ts'
import { columns, helpWidth, wrapText } from '../src/wrap.ts'

describe('wrapText', () => {
  test('refills prose paragraphs to the width', () => {
    const text = 'one two three\nfour five six seven eight\n\nnine ten\n'
    expect(wrapText(text, 14)).toBe('one two three\nfour five six\nseven eight\n\nnine ten\n')
  })

  test('keeps indented lines, fenced blocks and blank lines as written', () => {
    const text =
      'intro words here\n  keep   this   line\n```\nraw   code line that is long\n```\nend'
    expect(wrapText(text, 10)).toBe(
      'intro\nwords here\n  keep   this   line\n```\nraw   code line that is long\n```\nend',
    )
  })

  test('a word longer than the width gets a line of its own', () => {
    expect(wrapText('a supercalifragilistic b', 8)).toBe('a\nsupercalifragilistic\nb')
  })

  test('defaults to 80 columns', () => {
    const long = Array.from({ length: 40 }, () => 'word').join(' ')
    for (const line of wrapText(long).split('\n')) expect(line.length).toBeLessThanOrEqual(80)
  })
})

describe('helpWidth', () => {
  test('clamps the terminal width, and is 80 when unknown', () => {
    expect(helpWidth()).toBe(80)
    expect(helpWidth(0)).toBe(80)
    expect(helpWidth(Number.NaN)).toBe(80)
    expect(helpWidth(20)).toBe(40)
    expect(helpWidth(72.5)).toBe(72)
    expect(helpWidth(300)).toBe(100)
  })
})

describe('columns', () => {
  test('pads terms and wraps text under itself', () => {
    const rows = [
      { term: '-a', text: 'one two three four five six seven' },
      { term: '--bb', text: 'x' },
    ]
    expect(columns(rows, 20)).toBe('  -a    one two three four\n        five six seven\n  --bb  x')
  })

  test('a term wider than half the width gets its own line', () => {
    expect(
      columns(
        [
          { term: 'a-very-long-term-name', text: 'text' },
          { term: 'b', text: 'y' },
        ],
        30,
      ),
    ).toBe(`  a-very-long-term-name\n${' '.repeat(17)}text\n  b${' '.repeat(14)}y`)
  })

  test('no rows is empty', () => {
    expect(columns([])).toBe('')
  })
})

test('defineCli wraps its epilogue at render time', () => {
  const cli = defineCli({
    name: 'tooly',
    summary: 's',
    flags: {},
    width: 30,
    epilogue:
      'This sentence is written on one long line and must wrap.\n  kept as written, however long it is',
  })
  expect(cli.help()).toContain(
    'This sentence is written on\none long line and must wrap.\n  kept as written, however long it is',
  )
})
