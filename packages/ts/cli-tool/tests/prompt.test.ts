import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { askYesNo, isYes, readLine } from '../index.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cli-tool-prompt-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** Run `fn` with a file descriptor reading `input`. */
function withInput<T>(input: string, fn: (fd: number) => T): T {
  const file = join(dir, 'in')
  writeFileSync(file, input)
  const fd = openSync(file, 'r')
  try {
    return fn(fd)
  } finally {
    closeSync(fd)
  }
}

describe('readLine', () => {
  test.each([
    ['yes\nno\n', 'yes'],
    ['y', 'y'],
    ['', ''],
  ])('%p reads %p', (input, line) => {
    expect(withInput(input, readLine)).toBe(line)
  })
})

describe('readLine across calls', () => {
  test('a second read gets the line after the first newline', () => {
    withInput('y\nn\n', (fd) => {
      expect([readLine(fd), readLine(fd)]).toEqual(['y', 'n'])
    })
  })
  test('multi-byte characters decode whole', () => {
    const text = 'é'.repeat(1500)
    expect(withInput(`${text}\nnext\n`, readLine)).toBe(text)
  })
})

describe('isYes', () => {
  test.each(['y', 'yes', 'Y', 'YES', ' yes \r'])('%p is yes', (a) => {
    expect(isYes(a)).toBe(true)
  })
  test.each(['', 'n', 'no', 'yep', 'y y'])('%p is not', (a) => {
    expect(isYes(a)).toBe(false)
  })
})

describe('askYesNo', () => {
  test.each([
    ['\n', false, false],
    ['\n', true, true],
    ['y\n', false, true],
    ['n\n', true, false],
    ['maybe\n', true, false],
  ])('answer %p with defaultYes %p is %p', (input, defaultYes, expected) => {
    const written: string[] = []
    const answer = withInput(input, (fd) =>
      askYesNo('Go?', { defaultYes, fd, write: (t) => written.push(t) }),
    )
    expect(answer).toBe(expected)
    expect(written).toEqual([defaultYes ? 'Go? [Y/n] ' : 'Go? [y/N] '])
  })
})
