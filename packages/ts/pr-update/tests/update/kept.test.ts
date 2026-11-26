import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { keptOwnerElsewhere, type KeptPlace, type KeptRecord } from '../../src/update/kept.ts'

describe('keptOwnerElsewhere', () => {
  let root: string
  let gitDir: string
  let place: KeptPlace
  const record = (owner: string): KeptRecord => ({
    repo: 'acme/api',
    number: 7,
    head: 'topic',
    base: 'main',
    headOid: null,
    baseOid: null,
    path: join(root, 'kept', '7'),
    branch: 'pr-update/failed-acme-api-7',
    gitDir: owner,
  })

  beforeEach(() => {
    root = realpathSync.native(mkdtempSync(join(tmpdir(), 'pr-update-kept-')))
    gitDir = join(root, 'api.git')
    mkdirSync(gitDir)
    place = { dir: join(root, 'kept'), naming: 'repository', gitDir }
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  test('the git directory serving the run is not elsewhere', () => {
    expect(keptOwnerElsewhere(place, record(gitDir))).toBeNull()
  })

  // A record an older run wrote names the directory as that run spelled it: through a symlink
  // here, as a Windows short name or another letter case on macOS would be.
  test('nor is the same directory under another spelling', () => {
    const link = join(root, 'link.git')
    // A junction on Windows, which needs no privilege; the type is ignored elsewhere.
    symlinkSync(gitDir, link, 'junction')
    expect(keptOwnerElsewhere(place, record(link))).toBeNull()
  })

  test('another git directory that exists is elsewhere; one that is gone is not', () => {
    const other = join(root, 'other.git')
    mkdirSync(other)
    expect(keptOwnerElsewhere(place, record(other))).toBe(other)
    expect(keptOwnerElsewhere(place, record(join(root, 'gone.git')))).toBeNull()
  })
})
