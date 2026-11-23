/**
 * repositoriesFile: where the file is, the variable that moves it, the
 * schema, and the compare-and-swap write.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { WriteConflictError as EtagWriteConflictError } from '@osdlc/etag-write'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { osdlcDirs, OSDLC_VENDOR_DIRS } from '../src/index.ts'
import { REPOSITORIES_ENV, WriteConflictError, repositoriesFile } from '../src/repositories.ts'
import { makeSandbox, type Sandbox } from './helpers.ts'

let sb: Sandbox
beforeEach(() => {
  sb = makeSandbox()
})
afterEach(() => sb.cleanup())

describe('osdlcDirs', () => {
  test('is pinned to Xdg: OSDLC_CONVENTION moves nothing', () => {
    const home = sb.home
    const plain = osdlcDirs({ env: {}, home }).standalone('osdlc').config().path
    const moved = osdlcDirs({ env: { OSDLC_CONVENTION: 'native' }, home })
    expect(moved.standalone('osdlc').config().path).toBe(plain)
  })

  test('OSDLC_ROOT moves the family root', () => {
    const dirs = osdlcDirs({ env: { OSDLC_ROOT: join(sb.root, 'r') }, home: sb.home })
    expect(dirs.standalone('osdlc').config().path).toBe(join(sb.root, 'r', 'config', 'osdlc'))
    expect(OSDLC_VENDOR_DIRS.vendor).toBe('osdlc')
  })
})

describe('repositoriesFile', () => {
  test('is repositories.yaml directly in the osdlc config home', () => {
    const file = repositoriesFile(sb.opts)
    expect(file.path()).toBe(sb.file)
    expect(file.env).toBe('OSDLC_REPOSITORIES')
  })

  test('OSDLC_REPOSITORIES moves it', () => {
    const elsewhere = join(sb.root, 'elsewhere.yaml')
    vi.stubEnv(REPOSITORIES_ENV, elsewhere)
    expect(repositoriesFile(sb.opts).path()).toBe(elsewhere)
  })

  test('a relative OSDLC_REPOSITORIES is refused before the file is read', () => {
    vi.stubEnv(REPOSITORIES_ENV, 'repositories.yaml')
    const file = repositoriesFile(sb.opts)
    const message = /OSDLC_REPOSITORIES must be an absolute path.*'repositories\.yaml'/
    expect(() => file.path()).toThrow(message)
    expect(() => file.load()).toThrow(message)
    expect(() => file.read()).toThrow(message)
    expect(() => file.writeRoots([], { etag: null })).toThrow(message)
  })

  test('a missing file loads as {}', () => {
    expect(repositoriesFile(sb.opts).load()).toEqual({
      path: sb.file,
      exists: false,
      value: {},
      issues: [],
    })
  })

  test('the schema is strict: an unknown key is reported and dropped', () => {
    sb.writeFile('roots: [/a]\nrepos: [/b]\n')
    const loaded = repositoriesFile(sb.opts).load()
    expect(loaded.value).toEqual({ roots: ['/a'] })
    expect(loaded.issues).toEqual([
      { path: ['repos'], code: 'unknown_key', message: 'unknown key; ignored' },
    ])
  })

  test('a load reads the file again, so an edit made during a run is seen', () => {
    const file = repositoriesFile(sb.opts)
    sb.writeFile('roots: [/a]\n')
    expect(file.load().value.roots).toEqual(['/a'])
    sb.writeFile('roots: [/b]\n')
    expect(file.load().value.roots).toEqual(['/b'])
  })
})

describe('writeRoots', () => {
  test('creates the file and its directory when there is none', () => {
    const file = repositoriesFile(sb.opts)
    expect(file.read()).toBeNull()
    file.writeRoots(['~/dev', '/srv/repos'], { etag: null })
    expect(file.load().value).toEqual({ roots: ['~/dev', '/srv/repos'] })
  })

  test('keeps the comments and replaces only roots', () => {
    sb.writeFile('# where my checkouts are\nroots:\n  - /old # this laptop\n')
    const file = repositoriesFile(sb.opts)
    const before = file.read()!
    file.writeRoots(['/new'], { etag: before.etag })
    const text = readFileSync(sb.file, 'utf-8')
    expect(text).toContain('# where my checkouts are')
    expect(file.load().value).toEqual({ roots: ['/new'] })
  })

  test('adds roots to a file that has none', () => {
    sb.writeFile('# set by hand\n')
    const file = repositoriesFile(sb.opts)
    file.writeRoots(['~'], { etag: file.read()!.etag })
    expect(readFileSync(sb.file, 'utf-8')).toContain('# set by hand')
    expect(file.load().value).toEqual({ roots: ['~'] })
  })

  test('keeps every key other than roots byte for byte', () => {
    sb.writeFile('limit: .inf # mine\nnote: !!str 007\nroots: [/a]\n')
    const file = repositoriesFile(sb.opts)
    file.writeRoots(['/b'], { etag: file.read()!.etag })
    const text = readFileSync(sb.file, 'utf-8')
    expect(text).toContain('limit: .inf # mine\nnote: !!str 007\n')
    expect(file.load().value.roots).toEqual(['/b'])
  })

  test('is a compare-and-swap: a file changed since it was read is not written', () => {
    sb.writeFile('roots: [/a]\n')
    const file = repositoriesFile(sb.opts)
    const before = file.read()!
    sb.writeFile('roots: [/b]\n')
    expect(() => file.writeRoots(['/c'], { etag: before.etag })).toThrow(WriteConflictError)
    expect(file.load().value.roots).toEqual(['/b'])
  })

  test('a file made since the caller found none is not overwritten', () => {
    const file = repositoriesFile(sb.opts)
    sb.writeFile('roots: [/b]\n')
    expect(() => file.writeRoots(['/c'], { etag: null })).toThrow(WriteConflictError)
  })

  test('WriteConflictError is the class @osdlc/etag-write throws', () => {
    expect(WriteConflictError).toBe(EtagWriteConflictError)
  })

  test('refuses a root the reader would drop', () => {
    const file = repositoriesFile(sb.opts)
    expect(() => file.writeRoots(['dev/repos'], { etag: null })).toThrow(
      /a root must be absolute, '~' or start with '~\/'; 'dev\/repos'/,
    )
    expect(() => file.writeRoots(['~someone/dev'], { etag: null })).toThrow(/'~someone\/dev'/)
    expect(existsSync(sb.file)).toBe(false)
  })
})
