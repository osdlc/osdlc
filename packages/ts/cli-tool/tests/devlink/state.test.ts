import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import * as dirsModule from '@osdlc/config-layers/dirs'
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { resolve } from '../../src/devlink/resolve.ts'
import { homePath, readActive, stateDir, writeActive } from '../../src/devlink/state.ts'
import { SPEC, sandbox, type Sandbox } from './support.ts'

let sb: Sandbox
beforeEach(() => {
  sb = sandbox()
})
afterEach(() => sb.dispose())

describe('readActive on an unreadable state path', () => {
  test('a directory named home reads as no link and resolve() still answers', () => {
    mkdirSync(homePath(SPEC, { dirs: sb.dirs }), { recursive: true }) // EISDIR
    expect(readActive(SPEC, { dirs: sb.dirs })).toBeNull()
    expect(resolve(SPEC, { dirs: sb.dirs, env: {}, cwd: sb.root }).source).toBe('local')
  })

  test('a file where the state directory should be reads as no link', () => {
    mkdirSync(dirname(sb.stateDir), { recursive: true })
    writeFileSync(sb.stateDir, 'not a directory') // ENOTDIR
    expect(readActive(SPEC, { dirs: sb.dirs })).toBeNull()
  })
})

describe('writeActive', () => {
  test('replaces the file whole and leaves no temp file behind', () => {
    writeActive(SPEC, '/one', { dirs: sb.dirs })
    const before = statSync(homePath(SPEC, { dirs: sb.dirs })).ino
    writeActive(SPEC, '/two', { dirs: sb.dirs })
    expect(readActive(SPEC, { dirs: sb.dirs })).toBe('/two')
    // A rename swaps the inode; an in-place truncate-and-write keeps it.
    expect(statSync(homePath(SPEC, { dirs: sb.dirs })).ino).not.toBe(before)
    expect(readdirSync(sb.stateDir)).toEqual(['home'])
    rmSync(sb.stateDir, { recursive: true })
  })
})

test('state is resolved under the xdg convention', () => {
  const seen: unknown[] = []
  const spy = vi.spyOn(dirsModule, 'systemDirs').mockImplementation((vendor, opts) => {
    seen.push(opts)
    return sb.dirs
  })
  try {
    expect(stateDir(SPEC)).toBe(sb.stateDir)
    expect(seen).toEqual([{ convention: 'xdg' }])
  } finally {
    spy.mockRestore()
  }
})
