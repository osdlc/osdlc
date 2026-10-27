/** Color detection: every row of the precedence table in the README, in its order. */
import { describe, expect, test } from 'vitest'

import { detectColorLevel, type ColorDetectInput, type ColorLevel } from '../src/index.ts'

const TTY = { TERM: 'xterm' }

type Row = [string, Record<string, string>, boolean | undefined, ColorLevel]

const detect = (
  env: Record<string, string>,
  isTTY: boolean | undefined,
  override?: ColorDetectInput['override'],
) => detectColorLevel({ env, isTTY, ...(override !== undefined ? { override } : {}) })

describe('1. override wins over everything', () => {
  test('false turns color off under FORCE_COLOR on a truecolor TTY', () => {
    expect(detect({ FORCE_COLOR: '3', COLORTERM: 'truecolor' }, true, false)).toBe('none')
  })

  test('a level sets the level, under NO_COLOR and off a TTY', () => {
    expect(detect({ NO_COLOR: '1' }, false, 'ansi256')).toBe('ansi256')
    expect(detect(TTY, true, 'none')).toBe('none')
  })

  test('true turns color on under NO_COLOR, TERM=dumb and off a TTY', () => {
    expect(detect({ NO_COLOR: '1', TERM: 'xterm-256color' }, false, true)).toBe('ansi256')
    expect(detect({ TERM: 'dumb' }, false, true)).toBe('ansi16')
  })

  test('true takes the level FORCE_COLOR asks for, or else the terminal level', () => {
    expect(detect({ FORCE_COLOR: '3' }, false, true)).toBe('truecolor')
    expect(detect({ FORCE_COLOR: '0', TERM: 'xterm-256color' }, false, true)).toBe('ansi256')
    expect(detect({ FORCE_COLOR: 'false' }, false, true)).toBe('ansi16')
  })

  test('a string that is not a level throws a RangeError', () => {
    const override = 'always' as unknown as ColorLevel
    expect(() => detect({}, true, override)).toThrow(RangeError)
  })
})

describe('2. NO_COLOR', () => {
  test.each<Row>([
    ['NO_COLOR=1 on a TTY', { ...TTY, NO_COLOR: '1' }, true, 'none'],
    ['NO_COLOR=0 is still set', { ...TTY, NO_COLOR: '0' }, true, 'none'],
    ['NO_COLOR wins over FORCE_COLOR=1', { NO_COLOR: '1', FORCE_COLOR: '1' }, false, 'none'],
    ['NO_COLOR wins over FORCE_COLOR=3', { NO_COLOR: 'x', FORCE_COLOR: '3' }, true, 'none'],
    ['empty NO_COLOR is ignored', { ...TTY, NO_COLOR: '' }, true, 'ansi16'],
    ['empty NO_COLOR leaves FORCE_COLOR', { NO_COLOR: '', FORCE_COLOR: '2' }, false, 'ansi256'],
  ])('%s', (_, env, isTTY, level) => {
    expect(detect(env, isTTY)).toBe(level)
  })
})

describe('3. FORCE_COLOR', () => {
  test.each<[string, ColorLevel]>([
    ['0', 'none'],
    ['00', 'none'],
    ['false', 'none'],
    ['', 'ansi16'],
    ['true', 'ansi16'],
    ['1', 'ansi16'],
    ['2', 'ansi256'],
    ['3', 'truecolor'],
    ['4', 'truecolor'],
    ['16', 'truecolor'],
  ])('%j gives %s, off a TTY', (value, level) => {
    expect(detect({ FORCE_COLOR: value }, false)).toBe(level)
  })

  test('0 and false turn color off on a truecolor TTY', () => {
    expect(detect({ FORCE_COLOR: '0', COLORTERM: 'truecolor' }, true)).toBe('none')
    expect(detect({ FORCE_COLOR: 'false', COLORTERM: 'truecolor' }, true)).toBe('none')
  })

  test.each([
    'yes',
    'TRUE',
    'FALSE',
    'always',
    '-1',
    '1.5',
    'constructor',
    '__proto__',
    'toString',
  ])('another value, %j, turns color on at the terminal level', (value) => {
    expect(detect({ FORCE_COLOR: value, TERM: 'xterm-256color' }, false)).toBe('ansi256')
    expect(detect({ FORCE_COLOR: value }, false)).toBe('ansi16')
  })

  test('wins over TERM=dumb', () => {
    expect(detect({ FORCE_COLOR: '1', TERM: 'dumb' }, true)).toBe('ansi16')
  })
})

describe('4-6. without a flag or variable', () => {
  test.each<Row>([
    ['TERM=dumb on a TTY', { TERM: 'dumb' }, true, 'none'],
    ['not a TTY', TTY, false, 'none'],
    ['isTTY undefined', TTY, undefined, 'none'],
    ['a plain TTY', TTY, true, 'ansi16'],
    ['no TERM on a TTY', {}, true, 'ansi16'],
    ['a 256-color TERM', { TERM: 'xterm-256color' }, true, 'ansi256'],
    ['COLORTERM=truecolor', { TERM: 'xterm-256color', COLORTERM: 'truecolor' }, true, 'truecolor'],
    ['COLORTERM=24bit', { COLORTERM: '24bit' }, true, 'truecolor'],
    ['a -direct TERM', { TERM: 'xterm-direct' }, true, 'truecolor'],
    ['Windows Terminal', { WT_SESSION: 'x' }, true, 'truecolor'],
    ['iTerm', { TERM_PROGRAM: 'iTerm.app' }, true, 'truecolor'],
    ['WezTerm', { TERM_PROGRAM: 'WezTerm' }, true, 'truecolor'],
    ['ghostty', { TERM_PROGRAM: 'ghostty' }, true, 'truecolor'],
  ])('%s', (_, env, isTTY, level) => {
    expect(detect(env, isTTY)).toBe(level)
  })
})

test('the env object is not changed', () => {
  const env = Object.freeze({ ...TTY, FORCE_COLOR: '2' })
  expect(detectColorLevel({ env, isTTY: true })).toBe('ansi256')
})
