/**
 * The PATH lookup, tested against a real temporary directory — the point of
 * replacing `Bun.which` was that it must work under node, and a stubbed
 * filesystem would not prove that.
 */

import { afterAll, describe, expect, test } from 'vitest'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import { which } from '../src/which.ts'

const dir = mkdtempSync(join(tmpdir(), 'detect-runners-which-'))
const other = mkdtempSync(join(tmpdir(), 'detect-runners-which2-'))
afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(other, { recursive: true, force: true })
})

const tool = join(dir, 'faketool')
writeFileSync(tool, '#!/bin/sh\nexit 0\n')
chmodSync(tool, 0o755)

const notExecutable = join(dir, 'readme')
writeFileSync(notExecutable, 'not a program\n')
chmodSync(notExecutable, 0o644)

const shadowed = join(other, 'faketool')
writeFileSync(shadowed, '#!/bin/sh\nexit 1\n')
chmodSync(shadowed, 0o755)

const env = (path: string) => ({ PATH: path })

describe('which', () => {
  test('finds an executable on PATH and returns its absolute path', () => {
    expect(which('faketool', env(dir))).toBe(tool)
  })

  test('returns null for something not there', () => {
    expect(which('definitely-not-a-real-binary', env(dir))).toBeNull()
  })

  test('a file that is not executable does not count', () => {
    expect(which('readme', env(dir))).toBeNull()
  })

  test('the first PATH entry wins', () => {
    expect(which('faketool', env([dir, other].join(delimiter)))).toBe(tool)
    expect(which('faketool', env([other, dir].join(delimiter)))).toBe(shadowed)
  })

  test('an empty or missing PATH finds nothing rather than throwing', () => {
    expect(which('faketool', env(''))).toBeNull()
    expect(which('faketool', {})).toBeNull()
  })

  test('a name with a separator is a path, not a PATH search', () => {
    expect(which(tool, env(''))).toBe(tool)
    expect(which(join(dir, 'nope'), env(dir))).toBeNull()
  })

  test('it agrees with the real thing on a binary that is certainly present', () => {
    // `node` is running this suite, so it is on PATH by construction.
    expect(which('node')).not.toBeNull()
  })
})
