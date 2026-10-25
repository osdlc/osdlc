/**
 * The shared key table and the terminal key reader.
 */

import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { KEY_TABLE, footerHints, keyLines, keysFor, type KeyBinding } from '../src/keys.ts'
import { isText, namedKey, splitKeys } from '../src/tui/keys-input.ts'

describe('the key table', () => {
  test('imports nothing, so the page can use it', () => {
    const source = readFileSync(new URL('../src/keys.ts', import.meta.url), 'utf-8')
    expect(source).not.toMatch(/^import /m)
  })

  test('every view that has a footer keeps a way out at every width', () => {
    for (const view of ['list', 'arguments', 'settings', 'help'] as const) {
      const always = keysFor('tui', view).filter((k) => k.always === true)
      expect(always.length).toBeGreaterThan(0)
    }
  })

  test('the web view has its own keys in the same table', () => {
    expect(keysFor('web', 'list').length).toBeGreaterThan(0)
    expect(KEY_TABLE.every((k) => k.surface === 'tui' || k.surface === 'web')).toBe(true)
  })
})

describe('footerHints', () => {
  const keys: KeyBinding[] = [
    { surface: 'tui', view: 'list', keys: ['a'], action: 'a', hint: 'a one', rank: 2 },
    { surface: 'tui', view: 'list', keys: ['b'], action: 'b', hint: 'b two', rank: 1 },
    { surface: 'tui', view: 'list', keys: ['c'], action: 'c' },
    { surface: 'tui', view: 'list', keys: ['q'], action: 'q', hint: 'q quit', always: true },
  ]

  test('all hints in table order when they fit', () => {
    expect(footerHints(keys, 80)).toBe('a one  b two  q quit')
  })

  test('drops the highest rank first, and keeps table order', () => {
    expect(footerHints(keys, 14)).toBe('b two  q quit')
  })

  test('keeps an always hint even when nothing else fits', () => {
    expect(footerHints(keys, 3)).toBe('q quit')
  })

  test('a skill row shows the skill form of a hint', () => {
    const withSkill: KeyBinding[] = [{ ...keys[0]!, skillHint: 'a copy' }, ...keys.slice(1)]
    expect(footerHints(withSkill, 80, '  ', 'skill')).toBe('a copy  b two  q quit')
    expect(footerHints(withSkill, 80)).toBe('a one  b two  q quit')
  })

  test("the terminal UI's Enter hint reads copy on a skill row", () => {
    expect(footerHints(keysFor('tui', 'list'), 200, '  ', 'skill')).toContain('enter copy /name')
    expect(footerHints(keysFor('tui', 'list'), 200, '  ', 'skill')).not.toContain('enter run')
  })
})

describe('keyLines', () => {
  test('aligns the actions in one column', () => {
    const rows = keysFor('tui', 'arguments')
    const lines = keyLines('tui', 'arguments')
    expect(lines[0]).toMatch(/^ {2}type +the arguments/)
    expect(new Set(lines.map((l, i) => l.indexOf(rows[i]!.action))).size).toBe(1)
  })
})

describe('splitKeys', () => {
  test('an escape sequence is one key, and text after it is kept', () => {
    expect(splitKeys('\x1b[Zcheck')).toEqual(['\x1b[Z', 'c', 'h', 'e', 'c', 'k'])
  })

  test('sequences with parameters and SS3 sequences', () => {
    expect(splitKeys('\x1b[1;2A\x1b[5~\x1bOHx')).toEqual(['\x1b[1;2A', '\x1b[5~', '\x1bOH', 'x'])
  })

  test('Esc alone, Esc before Esc, and Alt with a letter', () => {
    expect(splitKeys('\x1b')).toEqual(['\x1b'])
    expect(splitKeys('\x1b\x1b[A')).toEqual(['\x1b', '\x1b[A'])
    expect(splitKeys('\x1bb')).toEqual(['\x1bb'])
  })

  test('a paste is one key per character, astral characters whole', () => {
    expect(splitKeys('a😀b')).toEqual(['a', '😀', 'b'])
  })

  test('a sequence cut off at the end of the read stays whole', () => {
    expect(splitKeys('\x1b[1;')).toEqual(['\x1b[1;'])
  })

  test('named keys and text', () => {
    expect(namedKey('\x1b[4~')).toBe('end')
    expect(namedKey('\x1bOA')).toBe('up')
    expect(namedKey('x')).toBeUndefined()
    expect(isText('x')).toBe(true)
    expect(isText('\x7f')).toBe(false)
    expect(isText('\x1b[A')).toBe(false)
    expect(isText('\u0085')).toBe(false)
  })
})
