import { describe, expect, test } from 'vitest'
import { type CodeRules, stripCode, stripCodeWith } from '../src/index.ts'

const BOTH: CodeRules[] = ['commonmark', 'skill-export']

/** Whether the span the backtick at the start of `text` opens closes. */
function spanCloses(text: string, rules: CodeRules): boolean {
  return stripCodeWith(text, rules).startsWith(' ')
}

describe('stripCode', () => {
  test('a fence becomes spaces and keeps its newlines', () => {
    expect(stripCode('a\n```\nhidden\n```\nb\n')).toBe('a\n   \n      \n   \nb\n')
  })

  test('an inline span becomes spaces', () => {
    expect(stripCode('a `x` b')).toBe('a     b')
  })

  test('an unterminated inline backtick is left alone', () => {
    expect(stripCode('a `x b')).toBe('a `x b')
  })

  test('the code point count is kept exactly', () => {
    for (const rules of BOTH) {
      for (const src of [
        '`é` after',
        '```\nsanté\n```\n',
        '~~~\nsanté\n',
        '``a ` é``',
        '`😀` after',
        'plain text',
        'a `x` b `y`',
      ]) {
        expect(Array.from(stripCodeWith(src, rules)).length).toBe(Array.from(src).length)
      }
    }
  })

  test('a fence closes only on its own character at its length or more', () => {
    const src = '````\n```\n~~~~~\nx\n`````\ny'
    expect(stripCode(src)).toBe('    \n   \n     \n \n     \ny')
    expect(stripCodeWith(src, 'skill-export')).toBe('    \n   \n     \n \n     \ny')
  })

  test('a span does not cross a blank line or a fence line', () => {
    for (const rules of BOTH) {
      expect(spanCloses('`a\nb`', rules)).toBe(true)
      expect(spanCloses('`a\n\nb`', rules)).toBe(false)
      expect(spanCloses('`a\n```\nb`', rules)).toBe(false)
    }
  })

  test('block starts end a commonmark span only', () => {
    for (const next of [
      '# h',
      '###### h',
      '===',
      '***',
      '_ _ _',
      '> q',
      '- i',
      '  * i',
      '    + nested',
      '1. i',
      '12) i',
    ]) {
      const src = `\`a\n${next}\nb\``
      expect(spanCloses(src, 'commonmark')).toBe(false)
      expect(spanCloses(src, 'skill-export')).toBe(true)
    }
    for (const next of ['#hashtag', '####### seven', '-dash', '1.5 kg', '    # indented']) {
      expect(spanCloses(`\`a\n${next}\nb\``, 'commonmark')).toBe(true)
    }
  })

  test('commonmark closes a span only on a run of its own length', () => {
    expect(stripCode('`a``b')).toBe('`a``b')
    expect(stripCodeWith('`a``b', 'skill-export')).toBe('   `b')
  })

  // A quadratic pass takes tens of seconds on these inputs; a linear one takes
  // well under a second, even on a loaded machine. The bound is that wide on
  // purpose: it catches the shape of the cost, not a slowdown.
  test('a pass is linear on long lines and unclosed runs', () => {
    const longLine = '`a` [[x]] '.repeat(200_000)
    const unclosed = (lengths: number[]): string =>
      lengths.map((n) => `x ${'`'.repeat(n)} text\n`).join('')
    const rising = unclosed(Array.from({ length: 2000 }, (_, i) => i + 1))
    const falling = unclosed(Array.from({ length: 2000 }, (_, i) => 2000 - i))
    for (const rules of BOTH) {
      for (const text of [longLine, rising, falling]) {
        const started = performance.now()
        const out = stripCodeWith(text, rules)
        const elapsed = performance.now() - started
        expect(out.length).toBe(text.length)
        expect(elapsed).toBeLessThan(10_000)
      }
    }
  }, 120_000)
})
