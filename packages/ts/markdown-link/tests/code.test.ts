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

describe('container blocks', () => {
  test('a fence in a list item is code and ends with the item', () => {
    expect(stripCode('- ```\n  [[a]]\n  ```\n\n[[b]]')).toBe('     \n       \n     \n\n[[b]]')
    // Not indented to the content: the item ends, so does the fence.
    expect(stripCode('- ```\n[[a]]\n')).toBe('     \n[[a]]\n')
    // A blank line stays in the item; the unclosed fence runs on.
    expect(stripCode('- ```\n  [[a]]\n\n  [[b]]\n[[c]]')).toBe('     \n       \n\n       \n[[c]]')
  })

  test('a fence indented to the content column opens', () => {
    expect(stripCode('10. item\n    ```\n    [[a]]\n    ```\n[[b]]')).toBe(
      '10. item\n       \n         \n       \n[[b]]',
    )
    // Four columns past the content is indented code.
    expect(stripCode('- item\n      ```\n')).toBe('- item\n      ```\n')
    // A tab goes to the next multiple of four.
    expect(stripCode('-\titem\n\t```\n')).toBe('-\titem\n    \n')
  })

  test('a fence in a block quote ends with the quote', () => {
    expect(stripCode('> ```\n> [[a]]\n> ```\n[[b]]')).toBe('     \n       \n     \n[[b]]')
    expect(stripCode('> ```\n> [[a]]\n[[b]]')).toBe('     \n       \n[[b]]')
    expect(stripCode('> ```\n> a\n\n[[b]]')).toBe('     \n   \n\n[[b]]')
  })

  test('containers nest', () => {
    expect(stripCode('- a\n  - b\n    > ```\n    > [[x]]\n  [[y]]')).toBe(
      '- a\n  - b\n         \n           \n  [[y]]',
    )
  })

  test('a thematic break or a marker with no space is not a container', () => {
    expect(stripCode('- - -\n[[a]]')).toBe('- - -\n[[a]]')
    expect(stripCode('1.5 ```\n[[a]]')).toBe('1.5 ```\n[[a]]')
  })

  test("'skill-export' knows no containers and 'none' finds no code", () => {
    const text = '- ```\n  [[a]]\n  ```\n[[b]]'
    expect(stripCodeWith(text, 'none')).toBe(text)
    expect(stripCodeWith(text, 'skill-export')).toBe('- ```\n  [[a]]\n     \n     ')
  })
})

describe('table rows', () => {
  test('a span stays in its cell', () => {
    // GFM cuts the row at every unescaped pipe first, backticks or not.
    expect(stripCode('| `a | [[x]] | b` |')).toBe('| `a | [[x]] | b` |')
    expect(stripCode('| `a` | [[x]] |')).toBe('|     | [[x]] |')
    // An escaped pipe stays in the cell, and so in the span.
    expect(stripCode('| `a \\| b` | [[x]] |')).toBe('|          | [[x]] |')
    // Rows in a list item and a block quote.
    expect(stripCode('- x\n  | `a | [[x]] | b` |')).toBe('- x\n  | `a | [[x]] | b` |')
    expect(stripCode('> | `a | [[x]] | b` |')).toBe('> | `a | [[x]] | b` |')
    expect(stripCodeWith('| `a | [[x]] | b` |', 'skill-export')).toBe('|                 |')
  })
})
