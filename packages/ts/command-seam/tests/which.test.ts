/**
 * `which`: the lookup rules a spawn uses, without spawning. POSIX-only.
 */

import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'vitest'

import { spawnRunner, which } from '../src/index.ts'

const root = realpathSync(mkdtempSync(join(tmpdir(), 'seam-which-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))

function file(rel: string, mode: number): string {
  const p = join(root, rel)
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, '#!/bin/sh\necho ran\n')
  chmodSync(p, mode)
  return p
}

const first = file('a/tool', 0o755)
const second = file('b/tool', 0o755)
file('a/plain', 0o644)
file('b/plain', 0o755)
mkdirSync(join(root, 'a/dir-tool'), { recursive: true })
const PATH = `${join(root, 'a')}:${join(root, 'b')}`

describe('which', () => {
  test('the first executable match on PATH wins', () => {
    expect(which('tool', { env: { PATH } })).toBe(first)
    expect(which('tool', { env: { PATH: `${join(root, 'b')}:${join(root, 'a')}` } })).toBe(second)
  })

  test('a file without the execute bit, or a folder, is skipped', () => {
    expect(which('plain', { env: { PATH } })).toBe(join(root, 'b/plain'))
    expect(which('dir-tool', { env: { PATH } })).toBeUndefined()
  })

  test('a missing binary, an empty name and a missing PATH folder are undefined', () => {
    expect(which('definitely-not-a-real-binary-which', { env: { PATH } })).toBeUndefined()
    expect(which('', { env: { PATH } })).toBeUndefined()
    expect(which('tool', { env: { PATH: join(root, 'nope') } })).toBeUndefined()
  })

  test('a name with a slash is resolved against cwd, not searched', () => {
    expect(which('./a/tool', { cwd: root, env: { PATH: '' } })).toBe(first)
    expect(which(first, { env: { PATH: '' } })).toBe(first)
    expect(which('a/plain', { cwd: root })).toBeUndefined()
  })

  test('an empty PATH entry means cwd, as for Node', () => {
    const a = join(root, 'a')
    expect(which('tool', { cwd: a, env: { PATH: '' } })).toBe(first)
    expect(which('tool', { cwd: a, env: { PATH: `${join(root, 'nope')}::/x` } })).toBe(first)
  })

  test('a relative PATH entry is resolved against cwd', () => {
    expect(which('tool', { cwd: root, env: { PATH: 'b' } })).toBe(second)
  })

  test('without env it reads the parent PATH, like the runners', () => {
    expect(which('sh')).toMatch(/\/sh$/)
  })

  test('PATH set to undefined falls back to /usr/bin:/bin', () => {
    const found = which('sh', { env: { PATH: undefined } })
    expect(found === '/usr/bin/sh' || found === '/bin/sh').toBe(true)
  })

  test('agrees with spawnRunner on what it can start', () => {
    const r = spawnRunner('tool').run([], { cwd: root, env: { PATH } })
    expect(r.stdout).toBe('ran\n')
    const missing = spawnRunner('dir-tool').run([], { cwd: root, env: { PATH } })
    expect(missing.neverExited).toBe(true)
  })
})
