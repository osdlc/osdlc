/**
 * A temp name that is already taken belongs to another writer: the write fails
 * and leaves that file alone. The random part of the name is pinned so the
 * collision can be staged.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { atomicWrite, atomicWriteAsync } from '../src/index.ts'

vi.mock('node:crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:crypto')>()),
  randomBytes: (size: number) => Buffer.alloc(size),
}))

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'etag-write-temp-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('a taken temp name', () => {
  const stage = (): { target: string; theirs: string } => {
    const target = join(root, 'x.md')
    const theirs = join(root, '.x.md.000000000000.tmp')
    writeFileSync(target, 'old')
    writeFileSync(theirs, 'another writer')
    return { target, theirs }
  }

  test('atomicWrite fails and keeps the temp file of the other writer', () => {
    const { target, theirs } = stage()
    expect(() => atomicWrite(target, 'new')).toThrow(/EEXIST/)
    expect(readFileSync(theirs, 'utf8')).toBe('another writer')
    expect(readFileSync(target, 'utf8')).toBe('old')
    expect(readdirSync(root).sort()).toEqual(['.x.md.000000000000.tmp', 'x.md'])
  })

  test('atomicWriteAsync fails and keeps the temp file of the other writer', async () => {
    const { target, theirs } = stage()
    await expect(atomicWriteAsync(target, 'new')).rejects.toMatchObject({ code: 'EEXIST' })
    expect(readFileSync(theirs, 'utf8')).toBe('another writer')
    expect(readFileSync(target, 'utf8')).toBe('old')
  })
})
