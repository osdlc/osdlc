import { describe, expect, test } from 'vitest'

import { spawnRunner } from '../src/sync.ts'
import { shellJoin, shellQuote } from '../src/quote.ts'

describe('shellQuote', () => {
  test('leaves an inert word bare', () => {
    expect(shellQuote('refs/heads/feat/x')).toBe('refs/heads/feat/x')
    expect(shellQuote('--force-with-lease=refs/heads/a:0123')).toBe(
      '--force-with-lease=refs/heads/a:0123',
    )
  })

  test('quotes spaces, quotes and the empty word', () => {
    expect(shellQuote('a b')).toBe(`'a b'`)
    expect(shellQuote("it's")).toBe(`'it'\\''s'`)
    expect(shellQuote('')).toBe(`''`)
    expect(shellQuote('$HOME')).toBe(`'$HOME'`)
    expect(shellQuote('a\nb')).toBe(`'a\nb'`)
  })

  // A reference quoter used as an oracle: `shellQuote` must match it
  // byte for byte.
  test('matches the former step-runner quoter on edge cases', () => {
    const old = (v: string): string =>
      /^[A-Za-z0-9_@%+=:,./-]+$/.test(v) ? v : `'${v.replace(/'/g, `'\\''`)}'`
    for (const w of [
      '',
      ' ',
      'a b',
      "'",
      "''",
      "it's",
      'a\nb',
      '$(x)',
      '`x`',
      '42',
      'a/b-c.d',
      '~',
      '*',
      'é',
      '\\',
    ]) {
      expect(shellQuote(w)).toBe(old(w))
    }
  })
})

describe('shellJoin', () => {
  test('round-trips through sh', () => {
    const words = ['a b', "it's", '$HOME', '', 'plain', 'x;y']
    const out = spawnRunner('sh').run(['-c', `printf '%s\\n' ${shellJoin(words)}`], {
      cwd: process.cwd(),
    })
    expect(out.stdout).toBe(words.map((w) => `${w}\n`).join(''))
  })
})
