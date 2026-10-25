/**
 * `which` with the Windows rules, run on any OS by passing `platform`.
 * The fake files carry no execute bit, since Windows has none.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'vitest'

import { which } from '../src/index.ts'

const root = realpathSync(mkdtempSync(join(tmpdir(), 'seam-which-win-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

function file(rel: string): string {
  const p = join(root, rel)
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, '')
  return p
}

const npmCmd = file('a/npm.CMD')
const gitExe = file('b/git.EXE')
file('b/npm.EXE')
const toolBat = file('b/tool.BAT')
file('a/notes.txt')
mkdirSync(join(root, 'a/dir.EXE'), { recursive: true })
const local = file('cwd/local.EXE')
const PATH = `${join(root, 'a')};${join(root, 'b')}`
const win = (env: Record<string, string | undefined>, cwd?: string) =>
  ({ platform: 'win32', env, ...(cwd === undefined ? {} : { cwd }) }) as const

describe('which on win32', () => {
  test('PATH is split on ; and the first folder with any PATHEXT match wins', () => {
    expect(which('npm', win({ PATH }))).toBe(npmCmd)
    expect(which('git', win({ PATH }))).toBe(gitExe)
    expect(which('tool', win({ PATH }))).toBe(toolBat)
  })

  test('extensions are tried in PATHEXT order within a folder', () => {
    const exe = file('c/both.EXE')
    file('c/both.CMD')
    const dir = join(root, 'c')
    expect(which('both', win({ PATH: dir }))).toBe(exe)
    expect(which('both', win({ PATH: dir, PATHEXT: '.CMD;.EXE' }))).toBe(join(dir, 'both.CMD'))
  })

  test('a name already ending in a PATHEXT extension is tried as given, in any case', () => {
    expect(which('git.EXE', win({ PATH }))).toBe(gitExe)
    const lower = file('d/up.exe')
    expect(which('up.exe', win({ PATH: join(root, 'd') }))).toBe(lower)
    expect(which('notes.txt', win({ PATH }))).toBeUndefined()
    expect(which('notes.txt', win({ PATH, PATHEXT: '.TXT' }))).toBe(join(root, 'a/notes.txt'))
  })

  test('the PATH and PATHEXT names match in any case', () => {
    expect(which('git', win({ Path: PATH }))).toBe(gitExe)
    expect(which('both', win({ path: join(root, 'c'), PathExt: '.CMD' }))).toBe(
      join(root, 'c/both.CMD'),
    )
  })

  test('an unset or empty PATHEXT uses .COM;.EXE;.BAT;.CMD', () => {
    expect(which('npm', win({ PATH, PATHEXT: '' }))).toBe(npmCmd)
    expect(which('npm', win({ PATH, PATHEXT: undefined }))).toBe(npmCmd)
  })

  test('a folder is not a match, and empty PATH entries are skipped', () => {
    expect(which('dir', win({ PATH }))).toBeUndefined()
    expect(which('local', win({ PATH: ';;' }, join(root, 'cwd')))).toBeUndefined()
    expect(which('local', win({ PATH: '' }, join(root, 'cwd')))).toBeUndefined()
  })

  test('cwd is searched only when PATH names it', () => {
    expect(which('local', win({ PATH: '.' }, join(root, 'cwd')))).toBe(local)
  })

  test('a name with \\ or / is a path relative to cwd, with PATHEXT applied', () => {
    expect(which('cwd/local', win({ PATH: '' }, root))).toBe(local)
    expect(which('cwd\\local.EXE', win({ PATH: '' }, root))).toBe(
      // On POSIX hosts a `\` is not a separator for the file system, so only
      // a Windows host finds this one.
      process.platform === 'win32' ? local : undefined,
    )
    expect(which(local, win({ PATH: '' }))).toBe(local)
  })

  test('an empty name or a missing binary is undefined', () => {
    expect(which('', win({ PATH }))).toBeUndefined()
    expect(which('nope', win({ PATH }))).toBeUndefined()
  })
})
