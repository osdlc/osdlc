/** Color detection: every rule of detectColorLevel, in its order. */
import { describe, expect, test } from 'vitest'

import { detectColorLevel, type ColorLevel } from '../src/index.ts'

const TTY = { TERM: 'xterm' }

describe('detectColorLevel', () => {
  test.each<[string, Record<string, string>, boolean | undefined, ColorLevel]>([
    ['a plain TTY', TTY, true, 'ansi16'],
    ['a 256-color TERM', { TERM: 'xterm-256color' }, true, 'ansi256'],
    ['COLORTERM=truecolor', { TERM: 'xterm-256color', COLORTERM: 'truecolor' }, true, 'truecolor'],
    ['COLORTERM=24bit', { COLORTERM: '24bit' }, true, 'truecolor'],
    ['a -direct TERM', { TERM: 'xterm-direct' }, true, 'truecolor'],
    ['Windows Terminal', { WT_SESSION: 'x' }, true, 'truecolor'],
    ['iTerm', { TERM_PROGRAM: 'iTerm.app' }, true, 'truecolor'],
    ['no TERM on a TTY', {}, true, 'ansi16'],
    ['not a TTY', TTY, false, 'none'],
    ['isTTY undefined', TTY, undefined, 'none'],
    ['TERM=dumb', { TERM: 'dumb' }, true, 'none'],
    ['NO_COLOR=1', { ...TTY, NO_COLOR: '1' }, true, 'none'],
    ['NO_COLOR empty is ignored', { ...TTY, NO_COLOR: '' }, true, 'ansi16'],
  ])('%s', (_, env, isTTY, level) => {
    expect(detectColorLevel({ env, isTTY })).toBe(level)
  })

  describe('FORCE_COLOR', () => {
    test.each<[string, ColorLevel]>([
      ['0', 'none'],
      ['false', 'none'],
      ['FALSE', 'none'],
      ['', 'ansi16'],
      ['1', 'ansi16'],
      ['true', 'ansi16'],
      ['2', 'ansi256'],
      ['3', 'truecolor'],
    ])('%j gives %s, even off a TTY', (value, level) => {
      expect(detectColorLevel({ env: { FORCE_COLOR: value }, isTTY: false })).toBe(level)
    })

    test('an unknown value turns color on at the terminal level', () => {
      const env = { FORCE_COLOR: 'yes', TERM: 'xterm-256color' }
      expect(detectColorLevel({ env, isTTY: false })).toBe('ansi256')
    })

    test('wins over NO_COLOR and TERM=dumb', () => {
      const env = { FORCE_COLOR: '1', NO_COLOR: '1', TERM: 'dumb' }
      expect(detectColorLevel({ env, isTTY: false })).toBe('ansi16')
    })

    test('FORCE_COLOR=0 turns color off on a truecolor TTY', () => {
      const env = { FORCE_COLOR: '0', COLORTERM: 'truecolor' }
      expect(detectColorLevel({ env, isTTY: true })).toBe('none')
    })
  })

  describe('override', () => {
    test('false turns color off on a forced truecolor TTY', () => {
      const env = { FORCE_COLOR: '3', COLORTERM: 'truecolor' }
      expect(detectColorLevel({ env, isTTY: true, override: false })).toBe('none')
    })

    test('true turns color on off a TTY and under NO_COLOR, at the terminal level', () => {
      const env = { NO_COLOR: '1', TERM: 'xterm-256color' }
      expect(detectColorLevel({ env, isTTY: false, override: true })).toBe('ansi256')
      expect(detectColorLevel({ env: { TERM: 'dumb' }, isTTY: false, override: true })).toBe(
        'ansi16',
      )
    })

    test('true takes the FORCE_COLOR level when it names one', () => {
      expect(detectColorLevel({ env: { FORCE_COLOR: '3' }, isTTY: false, override: true })).toBe(
        'truecolor',
      )
      expect(detectColorLevel({ env: { FORCE_COLOR: '0' }, isTTY: false, override: true })).toBe(
        'ansi16',
      )
    })

    test('a level sets the level', () => {
      expect(detectColorLevel({ env: {}, isTTY: false, override: 'ansi256' })).toBe('ansi256')
      expect(detectColorLevel({ env: TTY, isTTY: true, override: 'none' })).toBe('none')
    })

    test('a string that is not a level throws a RangeError', () => {
      const override = 'always' as unknown as ColorLevel
      expect(() => detectColorLevel({ env: {}, isTTY: true, override })).toThrow(RangeError)
    })
  })

  test('the env object is not changed', () => {
    const env = Object.freeze({ ...TTY, FORCE_COLOR: '2' })
    expect(detectColorLevel({ env, isTTY: true })).toBe('ansi256')
  })
})
